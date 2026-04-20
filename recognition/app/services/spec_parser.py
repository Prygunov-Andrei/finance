"""SpecParser — port from backend/llm_services/services/specification_parser.py.

Stateless (the parser instance lives only for one request), no Django dependency.
"""

import json
import logging
from dataclasses import dataclass, field

import fitz
from fastapi.concurrency import run_in_threadpool

from ..config import settings
from ..providers.base import BaseLLMProvider
from ..schemas.spec import PagesStats, SpecItem, SpecParseResponse
from .pdf_render import render_page_to_b64

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
    sort_order: int = 0


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

            for page_num in range(state.pages_total):
                await self._process_page(doc, page_num)
        finally:
            doc.close()

        state.items = self._deduplicate(state.items)
        return self._finalize()

    def build_partial(self) -> SpecParseResponse:
        """Snapshot current state — used when the outer timeout fires."""
        state = self.state
        items = self._deduplicate(list(state.items))
        return SpecParseResponse(
            status="partial",
            items=items,
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
            page_b64 = await run_in_threadpool(render_page_to_b64, doc, page_num)

            classification = await self._classify_page(page_b64, page_num)
            if classification.get("section_name"):
                state.current_section = classification["section_name"]

            if classification.get("type") != "specification":
                state.pages_skipped += 1
                return

            items = await self._extract_items(page_b64, page_num)
            for item_data in items:
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

    async def _classify_page(self, image_b64: str, page_num: int) -> dict:
        for attempt in range(settings.max_page_retries):
            try:
                response = await self.provider.vision_complete(image_b64, CLASSIFY_PROMPT)
                parsed = json.loads(response)
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
                data = json.loads(response)
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

    @staticmethod
    def _deduplicate(items: list[SpecItem]) -> list[SpecItem]:
        """Merge identical items (name+model+brand) → sum quantities."""
        seen: dict[tuple[str, str, str], int] = {}
        result: list[SpecItem] = []

        for item in items:
            key = (
                item.name.lower().strip(),
                item.model_name.lower().strip(),
                item.brand.lower().strip(),
            )
            if key in seen:
                result[seen[key]].quantity += item.quantity
            else:
                seen[key] = len(result)
                result.append(item)

        return result
