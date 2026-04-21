"""SpecParser — port from backend/llm_services/services/specification_parser.py.

Stateless (the parser instance lives only for one request), no Django dependency.

E15.04 — добавлен column-aware path:
- 1й приоритет: `extract_structured_rows` + `normalize_via_llm` (gpt-4o-mini).
- 2й приоритет (fallback): legacy line-based `parse_page_items` (без LLM).
- 3й приоритет (если text layer отсутствует): Vision на исходном image.
"""

import json
import logging
from dataclasses import dataclass, field

import fitz
from fastapi.concurrency import run_in_threadpool

from ..config import settings
from ..providers.base import BaseLLMProvider
from ..schemas.spec import PagesStats, SpecItem, SpecParseResponse
from ._common import _strip_markdown_fence
from .pdf_render import render_page_to_b64
from .pdf_text import (
    TEXT_LAYER_MIN_CHARS_PER_PAGE,
    TableRow,
    extract_structured_rows,
    has_usable_text_layer,
    parse_page_items,
)
from .spec_normalizer import (
    LLMNormalizationError,
    NormalizedItem,
    NormalizedPage,
    normalize_via_llm,
)

logger = logging.getLogger(__name__)

CLASSIFY_PROMPT = """Ты получаешь изображение страницы проектной спецификации (ОВиК/СС).

Определи тип страницы:
- "specification" — таблица с перечнем оборудования/материалов (колонки: наименование, тип/марка, ед.изм., кол-во)
- "drawing" — чертёж, план, схема (пропускаем)
- "title" — титульный лист, штампы (пропускаем)
- "other" — прочее (пропускаем)

Если это specification, также определи название раздела (если виден заголовок типа "Система вентиляции", "Слаботочные системы" и т.д.).

Ответь строго JSON:
{"type": "specification|drawing|title|other", "section_name": "..." или ""}
"""

EXTRACT_PROMPT = """Ты получаешь изображение страницы спецификации оборудования ОВиК/СС.

Извлеки ВСЕ позиции из таблицы. Для каждой позиции:
- name: наименование и техническая характеристика (полное)
- model_name: тип, марка, обозначение документа (артикул)
- brand: поставщик/производитель (если указан)
- unit: единица измерения (шт, м.п., м.кв., кг)
- quantity: количество (число)
- tech_specs: дополнительные ТТХ (строка, если есть)

Если на странице нет позиций — верни пустой массив.
Ответь строго JSON: {"items": [...]}
"""


@dataclass
class _ParseState:
    """Accumulator that lets us return partial results on timeout/cancellation."""

    pages_total: int = 0
    items: list[SpecItem] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    pages_processed: int = 0
    pages_skipped: int = 0
    current_section: str = ""
    sticky_parent_name: str = ""
    sort_order: int = 0
    # E15.04 LLM-метрики для QA-отчёта.
    llm_calls: int = 0
    llm_prompt_tokens: int = 0
    llm_completion_tokens: int = 0
    llm_warnings: list[str] = field(default_factory=list)


class SpecParser:
    """Async PDF specification parser via LLM Vision."""

    def __init__(self, provider: BaseLLMProvider) -> None:
        self.provider = provider
        self.state = _ParseState()

    async def parse(self, pdf_bytes: bytes, filename: str = "document.pdf") -> SpecParseResponse:
        state = self.state
        doc = await run_in_threadpool(fitz.open, stream=pdf_bytes, filetype="pdf")
        try:
            state.pages_total = len(doc)
            logger.info(
                "spec_parse start",
                extra={"doc_filename": filename, "pages_total": state.pages_total},
            )

            # E15.04: сначала пробуем column-aware batch (параллельные LLM
            # calls, best-effort sticky из предыдущих страниц). Для страниц
            # без text layer / пустых rows — legacy/vision fallback
            # последовательно (rare case).
            if settings.llm_normalize_enabled:
                await self._process_batch_column_aware(doc)
                # Страницы, которые не обработались column-aware (text layer
                # есть, но rows=0 → legacy попытается; text layer нет → Vision).
                for page_num in range(state.pages_total):
                    if page_num in self._processed_pages:
                        continue
                    await self._process_page_sequential(doc, page_num)
            else:
                for page_num in range(state.pages_total):
                    await self._process_page_sequential(doc, page_num)
        finally:
            doc.close()

        # Дедупликация отключена с E15.03-hotfix: смета = точная копия PDF,
        # одинаковые (name, model, brand) из разных секций остаются отдельно.
        return self._finalize()

    async def _process_batch_column_aware(self, doc: fitz.Document) -> None:
        """Extract rows синхронно для всех страниц → параллельный LLM.

        Best-effort carry-over sticky/section: перед LLM-call'ом страницы N
        берём последнее ненулевое name / section_heading из rows страниц
        1..N-1. LLM получает эти подсказки в промпте.

        Результаты собираются в оригинальном порядке страниц — важно,
        чтобы sort_order соответствовал PDF (фронт отображает по нему).
        """
        state = self.state
        self._processed_pages: set[int] = getattr(self, "_processed_pages", set())

        # Фаза 1 — extract rows per page (sync, быстро).
        pages_rows: list[list[TableRow]] = []
        for page_num in range(state.pages_total):
            try:
                page = doc[page_num]
                if not has_usable_text_layer(page, min_chars=TEXT_LAYER_MIN_CHARS_PER_PAGE):
                    pages_rows.append([])
                    continue
                rows: list[TableRow] = await run_in_threadpool(extract_structured_rows, page)
                pages_rows.append(rows)
            except Exception as e:  # pragma: no cover - защита от fitz-exceptions
                logger.warning(
                    "extract_structured_rows failed",
                    extra={"page": page_num + 1, "error": str(e)},
                )
                pages_rows.append([])

        # Фаза 2 — best-effort sticky/section перед каждой страницей.
        stickies: list[tuple[str, str]] = []
        cur_section = ""
        cur_sticky = ""
        for rows in pages_rows:
            stickies.append((cur_section, cur_sticky))
            for r in rows:
                name = r.cells.get("name", "")  # type: ignore[attr-defined]
                if r.is_section_heading and name:  # type: ignore[attr-defined]
                    cur_section = name
                elif name:
                    cur_sticky = name

        # Фаза 3 — параллельные LLM calls (только для непустых rows).
        async def run_one(page_num: int, rows: list[TableRow], section: str, sticky: str):
            if not rows:
                return page_num, None
            try:
                norm = await normalize_via_llm(
                    self.provider,
                    rows,
                    page_number=page_num + 1,
                    current_section=section,
                    sticky_parent_name=sticky,
                    max_tokens=settings.llm_normalize_max_tokens,
                )
                return page_num, norm
            except NotImplementedError:
                return page_num, "no_text_complete"
            except LLMNormalizationError as e:
                logger.warning(
                    "llm normalize failed",
                    extra={"page": page_num + 1, "error": str(e)},
                )
                return page_num, None

        tasks = [
            run_one(pn, rows, section, sticky)
            for pn, (rows, (section, sticky)) in enumerate(
                zip(pages_rows, stickies, strict=True)
            )
        ]
        import asyncio as _asyncio
        outcomes = await _asyncio.gather(*tasks)

        # Фаза 4 — слияние результатов в порядке страниц + финализация
        # sequential state (sticky/section для возможного legacy fallback).
        for page_num, norm in outcomes:
            if norm == "no_text_complete":
                # Провайдер не поддерживает text_complete — все страницы пойдут
                # в sequential fallback.
                return
            if norm is None:
                continue  # rows пустые / LLM упал → sequential-fallback на этой странице
            state.llm_calls += 1
            state.llm_prompt_tokens += norm.prompt_tokens
            state.llm_completion_tokens += norm.completion_tokens
            state.llm_warnings.extend(
                f"page {page_num + 1}: {w}" for w in norm.warnings
            )
            state.current_section = norm.new_section or state.current_section
            state.sticky_parent_name = norm.new_sticky or state.sticky_parent_name
            self._append_normalized_items(norm, page_num)
            if norm.items:
                state.pages_processed += 1
            else:
                state.pages_skipped += 1
            self._processed_pages.add(page_num)

    async def _process_page_sequential(self, doc: fitz.Document, page_num: int) -> None:
        """Обработка страницы по старой (pre-batch) последовательной схеме —
        используется как fallback для страниц без text layer и в случае,
        когда batch-LLM пропустил страницу (rows пусты / провайдер без
        text_complete)."""
        await self._process_page(doc, page_num)

    def build_partial(self) -> SpecParseResponse:
        """Snapshot current state — used when the outer timeout fires."""
        state = self.state
        return SpecParseResponse(
            status="partial",
            items=list(state.items),
            errors=(state.errors or []) + ["timeout: parser cancelled"],
            pages_stats=PagesStats(
                total=state.pages_total,
                processed=state.pages_processed,
                skipped=state.pages_skipped,
                error=len(state.errors),
            ),
        )

    async def _process_page(self, doc: fitz.Document, page_num: int) -> None:
        state = self.state
        try:
            page = doc[page_num]

            # E15.04 column-aware path: у страницы есть text layer →
            # извлекаем bbox-rows, нормализуем через gpt-4o-mini.
            # Fallback: legacy line-based parser (без LLM) → Vision (нет text).
            if has_usable_text_layer(page, min_chars=TEXT_LAYER_MIN_CHARS_PER_PAGE):
                if settings.llm_normalize_enabled and await self._try_column_aware(page, page_num):
                    return
                # Legacy text-layer fallback (LLM выключен / упал / стаб
                # провайдера). Recall ниже, но не требует OPENAI_API_KEY.
                if await self._process_page_legacy_text(page, page_num):
                    return
                state.pages_skipped += 1
                return

            # Vision fallback — для сканов/битого text layer.
            page_b64 = await run_in_threadpool(render_page_to_b64, doc, page_num)

            classification = await self._classify_page(page_b64, page_num)
            if classification.get("section_name"):
                state.current_section = classification["section_name"]

            if classification.get("type") != "specification":
                state.pages_skipped += 1
                return

            items_llm = await self._extract_items(page_b64, page_num)
            for item_data in items_llm:
                state.sort_order += 1
                state.items.append(
                    SpecItem(
                        name=str(item_data.get("name", "")).strip(),
                        model_name=str(item_data.get("model_name", "")),
                        brand=str(item_data.get("brand", "")),
                        unit=str(item_data.get("unit", "шт")),
                        quantity=float(item_data.get("quantity", 1)),
                        tech_specs=str(item_data.get("tech_specs", "")),
                        section_name=state.current_section,
                        page_number=page_num + 1,
                        sort_order=state.sort_order,
                    )
                )
            state.pages_processed += 1

        except Exception as e:
            error_msg = f"Page {page_num + 1}: {e}"
            logger.warning("spec_parse page error", extra={"page": page_num + 1, "error": str(e)})
            state.errors.append(error_msg)

    async def _try_column_aware(self, page: fitz.Page, page_num: int) -> bool:
        """Попытаться обработать страницу через column-aware + LLM. True при
        успехе (страница учтена в pages_processed/pages_skipped), False если
        следует упасть на legacy text-layer fallback.

        Провайдер без text_complete (Inert/Noop в тестах, любой кастом без
        импла) → NotImplementedError → возвращаем False. На LLMNormalizationError
        (битый JSON от OpenAI) тоже False — вызывающий код сделает fallback.
        """
        state = self.state
        rows = await run_in_threadpool(extract_structured_rows, page)
        if not rows:
            # Text layer есть, но структурных rows извлечь не удалось —
            # пробуем legacy парсер (он может поймать что-то в reading-order).
            return False

        try:
            normalized = await normalize_via_llm(
                self.provider,
                rows,
                page_number=page_num + 1,
                current_section=state.current_section,
                sticky_parent_name=state.sticky_parent_name,
                max_tokens=settings.llm_normalize_max_tokens,
            )
        except NotImplementedError:
            logger.info(
                "column-aware LLM path skipped (provider has no text_complete)",
                extra={"page": page_num + 1},
            )
            return False
        except LLMNormalizationError as e:
            logger.warning(
                "llm normalize failed, fallback to legacy",
                extra={"page": page_num + 1, "error": str(e)},
            )
            return False

        state.llm_calls += 1
        state.llm_prompt_tokens += normalized.prompt_tokens
        state.llm_completion_tokens += normalized.completion_tokens
        state.llm_warnings.extend(
            f"page {page_num + 1}: {w}" for w in normalized.warnings
        )

        state.current_section = normalized.new_section or state.current_section
        state.sticky_parent_name = normalized.new_sticky or state.sticky_parent_name

        self._append_normalized_items(normalized, page_num)
        if normalized.items:
            state.pages_processed += 1
        else:
            state.pages_skipped += 1
        return True

    def _append_normalized_items(
        self, normalized: NormalizedPage, page_num: int
    ) -> None:
        """Преобразовать NormalizedItem-ы в SpecItem и дописать в state."""
        state = self.state
        for item_data in normalized.items:
            final_name = _merge_system_prefix(item_data)
            state.sort_order += 1
            state.items.append(
                SpecItem(
                    name=final_name[:500],
                    model_name=item_data.model_name,
                    brand=item_data.brand,
                    unit=item_data.unit or "шт",
                    quantity=item_data.quantity,
                    tech_specs="",  # comments теперь отдельное поле
                    comments=item_data.comments,
                    section_name=normalized.new_section or state.current_section,
                    page_number=page_num + 1,
                    sort_order=state.sort_order,
                )
            )

    async def _process_page_legacy_text(
        self, page: fitz.Page, page_num: int
    ) -> bool:
        """Legacy line-based text-layer парсер (pre-E15.04). Используется:
        - тесты с Noop/Inert провайдером (golden baseline без OpenAI),
        - runtime fallback если text_complete бросил / LLM вернул битый JSON,
        - settings.llm_normalize_enabled=False (kill switch).
        """
        state = self.state
        parsed_items, new_section, new_sticky = await run_in_threadpool(
            parse_page_items,
            page,
            state.current_section,
            state.sticky_parent_name,
        )
        if new_section:
            state.current_section = new_section
        state.sticky_parent_name = new_sticky
        if not parsed_items:
            return False
        for item_data in parsed_items:
            state.sort_order += 1
            state.items.append(
                SpecItem(
                    name=str(item_data.get("name", "")).strip()[:500],
                    model_name=str(item_data.get("model_name", "")),
                    brand="",
                    unit=str(item_data.get("unit", "шт")),
                    quantity=float(item_data.get("quantity", 1) or 1),
                    tech_specs="",
                    comments="",
                    section_name=str(item_data.get("section_name", "")),
                    page_number=page_num + 1,
                    sort_order=state.sort_order,
                )
            )
        state.pages_processed += 1
        return True

    async def _classify_page(self, image_b64: str, page_num: int) -> dict:
        for attempt in range(settings.max_page_retries):
            try:
                response = await self.provider.vision_complete(image_b64, CLASSIFY_PROMPT)
                # DEV-BACKLOG #10: gpt-4o-mini иногда оборачивает JSON в
                # ```json ... ``` fence — снимаем до json.loads.
                parsed = json.loads(_strip_markdown_fence(response))
                return parsed if isinstance(parsed, dict) else {"type": "other", "section_name": ""}
            except (json.JSONDecodeError, KeyError) as e:
                if attempt == settings.max_page_retries - 1:
                    logger.warning(
                        "classify failed",
                        extra={"page": page_num + 1, "attempts": attempt + 1, "error": str(e)},
                    )
                    return {"type": "other", "section_name": ""}
        return {"type": "other", "section_name": ""}

    async def _extract_items(self, image_b64: str, page_num: int) -> list[dict]:
        for attempt in range(settings.max_page_retries):
            try:
                response = await self.provider.vision_complete(image_b64, EXTRACT_PROMPT)
                # DEV-BACKLOG #10: см. комментарий в _classify_page.
                data = json.loads(_strip_markdown_fence(response))
                items = data.get("items", [])
                return list(items) if isinstance(items, list) else []
            except (json.JSONDecodeError, KeyError) as e:
                if attempt == settings.max_page_retries - 1:
                    raise ValueError(f"Extract items page {page_num + 1}: {e}") from e
        return []

    def _finalize(self) -> SpecParseResponse:
        state = self.state
        status = "done"
        if state.errors and state.items:
            status = "partial"
        elif state.errors and not state.items:
            status = "error"
        if state.llm_calls:
            logger.info(
                "spec_parse llm metrics",
                extra={
                    "llm_calls": state.llm_calls,
                    "prompt_tokens": state.llm_prompt_tokens,
                    "completion_tokens": state.llm_completion_tokens,
                    "warnings_count": len(state.llm_warnings),
                },
            )
        return SpecParseResponse(
            status=status,
            items=state.items,
            errors=state.errors,
            pages_stats=PagesStats(
                total=state.pages_total,
                processed=state.pages_processed,
                skipped=state.pages_skipped,
                error=len(state.errors),
            ),
        )


def _merge_system_prefix(item: NormalizedItem) -> str:
    """Склейка system_prefix с name через `-` (R7 в TЗ E15.04).

    Решение PO: если из ЕСКД-таблицы пришёл префикс системы (ПВ-ИТП, ВД1,
    ПД1...5 и т.п.) в отдельной pos-колонке — не теряем его, а склеиваем
    с именем через дефис: «ПВ-ИТП-Вентилятор канальный...».

    Если LLM уже включил префикс в name (увидел дублирование) — не
    добавляем повторно.
    """
    name = item.name.strip()
    prefix = item.system_prefix.strip()
    if not prefix:
        return name
    if name.startswith(prefix):
        return name
    if not name:
        return prefix
    return f"{prefix}-{name}"
