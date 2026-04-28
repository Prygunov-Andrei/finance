"""SpecParser — port from backend/llm_services/services/specification_parser.py.

Stateless (the parser instance lives only for one request), no Django dependency.

E15.04 — добавлен column-aware path:
- 1й приоритет: `extract_structured_rows` + `normalize_via_llm` (gpt-4o-mini).
- 2й приоритет (fallback): legacy line-based `parse_page_items` (без LLM).
- 3й приоритет (если text layer отсутствует): Vision на исходном image.
"""

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from typing import Any

import fitz
from fastapi.concurrency import run_in_threadpool

from ..config import settings
from ..providers.base import BaseLLMProvider
from ..schemas.spec import PagesStats, PageSummary, SpecItem, SpecParseResponse
from ._common import _strip_markdown_fence
from .pdf_render import render_page_to_b64
from .pdf_text import (
    _VARIANT_RE,
    TEXT_LAYER_MIN_CHARS_PER_PAGE,
    TableRow,
    extract_structured_rows,
    has_usable_text_layer,
    parse_page_items,
)
from .pricing import build_llm_costs
from .spec_normalizer import (
    LLMNormalizationError,
    NormalizedItem,
    NormalizedPage,
    compute_confidence,
    normalize_via_llm,
    normalize_via_llm_multimodal,
)
from .spec_postprocess import (
    _looks_like_continuation,
    _strip_duplicate_pos_prefix,
    _unbreak_dash_word,
    apply_no_qty_merge,
    apply_p2_cosmetics,
    backfill_source_row_index,
    cap_sticky_name,
    cover_bbox_rows,
    inherit_series_parent,
    restore_from_bbox_rows,
)
from .vision_counter import count_items_on_page

# E15-06 it3 (QA #55 hardcore): маппинг section-keyword → sticky единственного
# числа. Используется для pre-inject cells.name в rows где PDF полагается на
# visual-continuation (cells.name пусто, только qty+unit+model). Без этого LLM
# наследует sticky от предыдущей серии («Решётка») на Воздуховоды.
_SECTION_KEYWORD_TO_STICKY: tuple[tuple[str, str], ...] = (
    ("воздуховод", "Воздуховод"),
    ("клапан", "Клапан"),
    ("решётк", "Решётка"),
    ("решетк", "Решётка"),
    ("труб", "Труба"),
    ("вентилятор", "Вентилятор"),
    ("заслонк", "Заслонка"),
    ("стакан", "Стакан"),
    ("дефлектор", "Дефлектор"),
    ("узел прохода", "Узел прохода"),
    ("изоляц", "Изоляция"),
    ("вставк", "Вставка"),
    ("диффузор", "Диффузор"),
    ("глушител", "Глушитель"),
    ("шибер", "Шибер"),
)


def _sticky_from_section_heading(section_name: str) -> str:
    """Вернуть sticky-имя единственного числа из section-heading.

    «Воздуховоды приточной противодымной …» → «Воздуховод».
    «Клапаны огнезадерживающие …» → «Клапан». Если keyword не найден —
    возвращает '' (не обновляем sticky).
    """
    if not section_name:
        return ""
    lower = section_name.lower()
    for keyword, sticky in _SECTION_KEYWORD_TO_STICKY:
        if keyword in lower:
            return sticky
    return ""

logger = logging.getLogger(__name__)

# E19-1: per-page progress callback. Вызывается после post-process данной
# страницы, но ДО cross-page continuation merge. Cross-page изменения
# last item доедут в финальном `finished` callback на async-роуте.
# Сигнатура: (page_1based, items_dicts) → Awaitable[None]. items —
# уже готовые dict'ы (asdict от NormalizedItem) для JSON-сериализации.
PageDoneCallback = Callable[[int, list[dict]], Awaitable[None]]


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
    llm_cached_tokens: int = 0  # TD-01: prompt-cache hits
    llm_warnings: list[str] = field(default_factory=list)
    # E15.05 it2 (R27): метрики multimodal retry.
    multimodal_retries: int = 0
    multimodal_prompt_tokens: int = 0
    multimodal_completion_tokens: int = 0
    multimodal_cached_tokens: int = 0  # TD-01
    # Per-page confidence — сохраняется для отчёта/логов.
    confidence_scores: list[tuple[int, float, bool]] = field(default_factory=list)
    # E15-06 (#52): per-page LLM self-check (expected vs parsed).
    pages_summary: list[PageSummary] = field(default_factory=list)


class SpecParser:
    """Async PDF specification parser via LLM Vision."""

    def __init__(self, provider: BaseLLMProvider) -> None:
        self.provider = provider
        self.state = _ParseState()
        self._on_page_done: PageDoneCallback | None = None
        # E19 hotfix: страницы уже прошедшие post-process+fire_page_done в
        # run_one (Phase 3 inline). Phase 5 пропустит их дублирование, но
        # выполнит cross-page merge как обычно.
        self._inline_processed_pages: set[int] = set()

    async def parse(
        self,
        pdf_bytes: bytes,
        filename: str = "document.pdf",
        *,
        on_page_done: PageDoneCallback | None = None,
    ) -> SpecParseResponse:
        # E19-1: progress hook для async-режима. None = backward-compat
        # (sync-роут /v1/parse/spec не передаёт callback — поведение
        # идентично текущему).
        self._on_page_done = on_page_done
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

        # Фаза 1b — cross-page continuation (spec-2 заход 2/10, Класс C).
        # Rows в НАЧАЛЕ страницы N > 0 с пустыми pos+qty+model+unit+brand
        # но непустым name — это «оторвавшийся» хвост multi-line name с
        # предыдущей страницы. Изымаем их из pages_rows[N] (LLM не увидит,
        # не спутает с item 1 страницы N) и складываем в буфер для
        # приклейки к last item страницы N-1 после LLM-normalize.
        cross_page_continuations: dict[int, list[str]] = {}
        for pi in range(1, len(pages_rows)):
            rows_pi = pages_rows[pi]
            taken: list[TableRow] = []
            while rows_pi:
                r = rows_pi[0]
                cells_typed = r.cells  # type: ignore[attr-defined]
                pos = (cells_typed.get("pos") or "").strip()
                qty = (cells_typed.get("qty") or "").strip()
                unit = (cells_typed.get("unit") or "").strip()
                model = (cells_typed.get("model") or "").strip()
                brand = (cells_typed.get("brand") or "").strip()
                name = (cells_typed.get("name") or "").strip()
                is_sec = r.is_section_heading  # type: ignore[attr-defined]
                if (
                    not is_sec
                    and name
                    and not pos
                    and not qty
                    and not unit
                    and not model
                    and not brand
                    # spec-ov2 regression (QA-заход 2/10 final check): section-
                    # heading без is_section_heading-флага («Фасооные изделия к
                    # вентиляторам ПДВ», начинается с заглавной) ошибочно
                    # таскался как cross-page continuation и склеивался с last
                    # item page 7. Требуем чтобы name ТОЧНО выглядел как
                    # continuation (lowercase-start / предлог / continuation-
                    # прилагательное). Consistent с cover_bbox_rows.
                    and _looks_like_continuation(name)
                ):
                    taken.append(rows_pi.pop(0))
                    continue
                break
            if taken:
                cross_page_continuations[pi - 1] = [
                    (r.cells.get("name") or "").strip() for r in taken  # type: ignore[attr-defined]
                ]
                logger.info(
                    "cross-page continuation: taken %d rows from page %d",
                    len(taken), pi + 1,
                )

        # Фаза 2 — best-effort sticky/section перед каждой страницей.
        # E15-06 it3 (QA заход 1/10 hardcore): section-heading обновляет sticky
        # по ключевому слову — «Воздуховоды приточной ...» → sticky «Воздуховод».
        # Без этого sticky «ПН2-4,5 Решетка» с предыдущей series наследовался к
        # Воздуховодам на следующей странице (items 122-130 на spec-ov2).
        stickies: list[tuple[str, str]] = []
        cur_section = ""
        cur_sticky = ""
        for rows in pages_rows:
            stickies.append((cur_section, cur_sticky))
            for r in rows:
                name = r.cells.get("name", "")  # type: ignore[attr-defined]
                if r.is_section_heading and name:  # type: ignore[attr-defined]
                    cur_section = name
                    keyword_sticky = _sticky_from_section_heading(name)
                    if keyword_sticky:
                        cur_sticky = keyword_sticky
                elif name:
                    cur_sticky = name

        # Сохраняем cross-page buffer в state для Фазы 5.
        self._cross_page_continuations = cross_page_continuations

        # Фаза 2b — pre-inject sticky в rows с пустым cells.name (E15-06 it3).
        # LLM не умеет стабильно переключать sticky между страницами по
        # section-heading (правило 18.5 помогает, но не всегда). Проще —
        # заполнить cells.name на стороне Python для «гол»-rows (только qty/
        # unit/model) до отправки в LLM. Тогда LLM получает явный name и не
        # путается с sticky от предыдущей серии.
        # Фаза 2c (spec-3 заход 3/10 повтор, #5): pre-join КОРОТКИХ буквенных
        # pos-кодов в начало cells.name. LLM иногда сдвигает одиночные pos
        # (А1/Д1/У1 на листе 9 ТАБС) относительно next row's name — жёсткая
        # склейка предотвращает confusion.
        #
        # STRICT regex: 1-2 буквы + цифры [+опциональная .N]. Матчит «А1»,
        # «Д1», «У1», «K1.1», «ПН2», «N1.1». НЕ матчит составные/длинные
        # pos типа «П1/В1», «П2.1/В2.1», «ВЕ1-ВЕ11.2» — они LLM'ом и так
        # обрабатываются, а injection длинного префикса в name наоборот
        # роняет recall (test: spec-3 p1 с «П1/В1-» injection упал с 18 на 14).
        # Числовые («1», «2», «4.10») — НЕ матчат по определению.
        _ALPHA_POS_RE = re.compile(r"^[A-Za-zА-Яа-яЁё]{1,2}\d+(?:\.\d+)?$")
        for page_num, rows in enumerate(pages_rows):
            local_sticky = stickies[page_num][1]
            for r in rows:
                cells_typed = r.cells  # type: ignore[attr-defined]
                pos_raw = (cells_typed.get("pos") or "").strip()
                name = (cells_typed.get("name") or "").strip()
                # Phase 2c: pre-join буквенного pos в начало name.
                if (
                    pos_raw
                    and name
                    and _ALPHA_POS_RE.match(pos_raw)
                    and not name.startswith(pos_raw)
                ):
                    cells_typed["name"] = f"{pos_raw}-{name}"
                    name = cells_typed["name"]
                if r.is_section_heading and name:  # type: ignore[attr-defined]
                    keyword_sticky = _sticky_from_section_heading(name)
                    if keyword_sticky:
                        local_sticky = keyword_sticky
                    continue
                if name:
                    local_sticky = name
                    continue
                # Пустой name + есть qty/unit/model → inject sticky.
                has_content = bool(
                    (cells_typed.get("qty") or "").strip()
                    or (cells_typed.get("unit") or "").strip()
                    or (cells_typed.get("model") or "").strip()
                )
                if has_content and local_sticky:
                    cells_typed["name"] = local_sticky

        # Фаза 3 — параллельные LLM calls, ограниченные семафором.
        # E15-06 it3 hotfix: на 19+ стр PDF без throttle получаем 38-60
        # concurrent OpenAI calls → rate-limit 429. Semaphore(6) достаточно.
        import asyncio as _asyncio
        llm_sema = _asyncio.Semaphore(settings.llm_max_concurrency)

        async def run_one(
            page_num: int, rows: list[TableRow], section: str, sticky: str
        ) -> tuple[int, Any]:
            if not rows:
                return page_num, None
            async with llm_sema:
                try:
                    norm = await normalize_via_llm(
                        self.provider,
                        rows,
                        page_number=page_num + 1,
                        current_section=section,
                        sticky_parent_name=sticky,
                        max_tokens=settings.llm_normalize_max_tokens,
                    )
                except NotImplementedError:
                    return page_num, "no_text_complete"
                except LLMNormalizationError as e:
                    logger.warning(
                        "llm normalize failed",
                        extra={"page": page_num + 1, "error": str(e)},
                    )
                    return page_num, None
            # E19 hotfix: inline post-process + fire_page_done СРАЗУ после LLM
            # ответа, до возврата из run_one. Раньше post-process делался в
            # Phase 5 после gather всех страниц — на 87-страничном PDF это
            # значит page_done callbacks стреляли волной через 5 часов вместо
            # инкрементального прогресса. Теперь fire стреляет per-page как
            # только LLM ответил для этой страницы.
            #
            # Если страница попадёт под Phase 4 multimodal retry, retry
            # запишет новый norm в final_by_page — Phase 5 переобрабатывает
            # его (set _inline_processed_pages не содержит этот page).
            self._apply_postprocess(norm, rows=rows, initial_sticky=sticky)
            await self._fire_page_done(page_num + 1, norm.items)
            self._inline_processed_pages.add(page_num)
            return page_num, norm

        async def run_vision_counter_gated(page_num: int) -> int:
            async with llm_sema:
                return await self._run_vision_counter(doc, page_num)

        async def run_multimodal_retry_gated(
            page_num: int,
            rows: list[TableRow],
            norm: NormalizedPage,
            sticky_ctx: tuple[str, str],
        ) -> tuple[int, Any]:
            async with llm_sema:
                return await self._run_multimodal_retry(
                    doc, page_num, rows, norm, sticky_ctx
                )

        tasks = [
            run_one(pn, rows, section, sticky)
            for pn, (rows, (section, sticky)) in enumerate(
                zip(pages_rows, stickies, strict=True)
            )
        ]

        # E15-06 it2 (#52/#9) — vision-based safety-net. Параллельно с text-
        # normalize запускаем cheap vision-call per page: LLM считает позиции
        # по картинке (независимо от bbox-rows). Результат cross-check'ается
        # в Phase 2b и триггерит multimodal retry если vision_count > parsed.
        vision_count_jobs: list[Any] = []
        vision_enabled = (
            settings.llm_vision_counter_enabled
            and settings.llm_multimodal_retry_enabled
        )
        if vision_enabled:
            for page_num in range(state.pages_total):
                if not pages_rows[page_num]:
                    vision_count_jobs.append(None)
                    continue
                vision_count_jobs.append(
                    run_vision_counter_gated(page_num)
                )

        outcomes = await _asyncio.gather(*tasks)

        vision_counts: dict[int, int] = {}
        if vision_enabled and vision_count_jobs:
            vision_results = await _asyncio.gather(
                *[j for j in vision_count_jobs if j is not None],
                return_exceptions=True,
            )
            # Восстановим соответствие page_num → count.
            it = iter(vision_results)
            for page_num, job in enumerate(vision_count_jobs):
                if job is None:
                    continue
                res = next(it)
                if isinstance(res, BaseException):
                    logger.warning(
                        "vision_counter crashed page %d: %s", page_num + 1, res
                    )
                    continue
                vision_counts[page_num] = int(res)

        # Фаза 4 — Phase 1 results в порядке страниц + R27 conditional
        # multimodal retry на страницах с низким confidence.
        phase1_by_page: dict[int, NormalizedPage] = {}
        for page_num, norm in outcomes:
            if norm == "no_text_complete":
                return  # провайдер без text_complete → fallback на sequential
            if norm is None:
                continue
            phase1_by_page[page_num] = norm
            state.llm_calls += 1
            state.llm_prompt_tokens += norm.prompt_tokens
            state.llm_completion_tokens += norm.completion_tokens
            state.llm_cached_tokens += norm.cached_tokens
            state.llm_warnings.extend(
                f"page {page_num + 1}: {w}" for w in norm.warnings
            )

        # R27 Phase 2 — параллельный multimodal retry. E15-06 it2: три триггера,
        #   (a) confidence < threshold (R27);
        #   (b) expected_count - parsed_count ≥ tolerance (LLM self-check, #52 it1);
        #   (c) vision_count - parsed_count ≥ vision_tolerance (vision safety, it2).
        #       (c) — единственный триггер который ловит полностью потерянные
        #       LLM'ом хвостовые rows, expected_count их «не видит».
        final_by_page: dict[int, NormalizedPage] = dict(phase1_by_page)
        retry_reasons: dict[int, str] = {}
        # Сохраним vision-counts в NormalizedPage для отчёта / PageSummary.
        for page_num, v_count in vision_counts.items():
            if page_num in phase1_by_page:
                phase1_by_page[page_num].expected_count_vision = v_count
        if settings.llm_multimodal_retry_enabled:
            retry_jobs = []
            for page_num, norm in phase1_by_page.items():
                rows = pages_rows[page_num]
                conf = compute_confidence(norm, rows)
                retried = False
                reasons: list[str] = []
                if conf < settings.llm_multimodal_retry_threshold and rows:
                    reasons.append(f"confidence={conf:.2f}")
                expected = norm.expected_count or 0
                parsed = len(norm.items)
                delta = expected - parsed
                if delta >= settings.llm_expected_count_tolerance and rows:
                    reasons.append(f"expected-parsed={delta}")
                v_count = vision_counts.get(page_num, 0)
                v_delta = v_count - parsed
                if (
                    v_count > 0
                    and v_delta >= settings.llm_vision_count_tolerance
                    and rows
                ):
                    reasons.append(f"vision-parsed={v_delta}")
                if reasons:
                    retried = True
                    retry_reasons[page_num] = ", ".join(reasons)
                    retry_jobs.append(
                        run_multimodal_retry_gated(
                            page_num, rows, norm, stickies[page_num]
                        )
                    )
                state.confidence_scores.append((page_num + 1, conf, retried))

            if retry_jobs:
                retry_outcomes = await _asyncio.gather(
                    *retry_jobs, return_exceptions=True
                )
                for outcome in retry_outcomes:
                    if isinstance(outcome, BaseException):
                        logger.warning(
                            "multimodal retry crashed: %s", outcome
                        )
                        continue
                    page_num, norm_p2 = outcome  # type: ignore[misc]
                    if norm_p2 is None:
                        continue
                    # Broker-selection: принимаем P2 если confidence вырос ИЛИ
                    # если P2 покрывает больше expected_count'а чем P1.
                    p1 = phase1_by_page[page_num]
                    rows = pages_rows[page_num]
                    conf_p1 = compute_confidence(p1, rows)
                    conf_p2 = compute_confidence(norm_p2, rows)
                    # E15-06 it2: при vision-trigger главное — coverage (закрыть
                    # хвостовые потери), даже если confidence чуть просел.
                    v_count = vision_counts.get(page_num, 0)
                    if v_count > 0:
                        expected = max(p1.expected_count, norm_p2.expected_count, v_count)
                    else:
                        expected = max(p1.expected_count, norm_p2.expected_count)
                    p1_coverage = len(p1.items) / max(expected, 1)
                    p2_coverage = len(norm_p2.items) / max(expected, 1)
                    accept_p2 = (
                        conf_p2 > conf_p1
                        or (p2_coverage > p1_coverage and p2_coverage >= 0.8)
                        or (
                            v_count > 0
                            and len(norm_p2.items) > len(p1.items)
                            and conf_p2 >= conf_p1 - 0.1
                        )
                    )
                    if accept_p2:
                        norm_p2.expected_count_vision = v_count
                        final_by_page[page_num] = norm_p2
                        # E19 hotfix: страница попала в multimodal retry — это
                        # новый norm без inline post-process. Снимаем флаг
                        # чтобы Phase 5 переобработал.
                        self._inline_processed_pages.discard(page_num)
                        # Обновляем метрики confidence для отчёта (заменяем tuple).
                        state.confidence_scores = [
                            (pn, conf_p2 if pn == page_num + 1 else c, r)
                            for pn, c, r in state.confidence_scores
                        ]
                    state.multimodal_retries += 1
                    state.multimodal_prompt_tokens += norm_p2.prompt_tokens
                    state.multimodal_completion_tokens += norm_p2.completion_tokens
                    state.multimodal_cached_tokens += norm_p2.cached_tokens
                    state.llm_warnings.extend(
                        f"page {page_num + 1} [multimodal]: {w}"
                        for w in norm_p2.warnings
                    )

        # Фаза 5 — применяем финальные результаты (после возможного retry) в
        # порядке страниц + обновление sequential state + PageSummary.
        tolerance = settings.llm_expected_count_tolerance
        v_tolerance = settings.llm_vision_count_tolerance
        for page_num in sorted(final_by_page.keys()):
            norm = final_by_page[page_num]
            initial_sticky = stickies[page_num][1] if page_num < len(stickies) else ""
            rows = pages_rows[page_num] if page_num < len(pages_rows) else []
            # E19 hotfix: post-process+fire_page_done теперь делается inline в
            # run_one (Phase 3), чтобы page_done callbacks стреляли инкрементально.
            # Phase 5 повторяет ТОЛЬКО для страниц, которые прошли через Phase 4
            # multimodal retry — там новый norm не прошёл inline post-process.
            if page_num not in self._inline_processed_pages:
                self._apply_postprocess(norm, rows=rows, initial_sticky=initial_sticky)
                await self._fire_page_done(page_num + 1, norm.items)

            # Cross-page continuation (Класс C spec-2): rows изъятые с
            # начала следующей страницы склеиваем в name last item ЭТОЙ.
            cp_tails = getattr(self, "_cross_page_continuations", {}).get(page_num)
            if cp_tails and norm.items:
                last = norm.items[-1]
                for tail in cp_tails:
                    if tail and tail not in last.name:
                        last.name = f"{last.name.rstrip()} {tail.strip()}".strip()
                logger.info(
                    "cross-page continuation applied: page %d last item += %d tails",
                    page_num + 1, len(cp_tails),
                )

            state.current_section = norm.new_section or state.current_section
            state.sticky_parent_name = norm.new_sticky or state.sticky_parent_name
            self._append_normalized_items(norm, page_num)
            if norm.items:
                state.pages_processed += 1
            else:
                state.pages_skipped += 1
            self._processed_pages.add(page_num)

            retried_flag = page_num in retry_reasons
            expected = norm.expected_count or 0
            expected_vision = (
                norm.expected_count_vision
                or vision_counts.get(page_num, 0)
            )
            parsed = len(norm.items)
            # E15-06 it2: suspicious теперь — по vision (главный сигнал), а
            # legacy expected_count оставляем как weaker fallback.
            suspicious = bool(
                (expected_vision and (expected_vision - parsed) >= v_tolerance)
                or (expected and (expected - parsed) >= tolerance)
            )
            state.pages_summary.append(
                PageSummary(
                    page=page_num + 1,
                    expected_count=expected,
                    expected_count_vision=expected_vision,
                    parsed_count=parsed,
                    retried=retried_flag,
                    suspicious=suspicious,
                )
            )

    async def _run_multimodal_retry(
        self,
        doc: "fitz.Document",
        page_num: int,
        rows: list[TableRow],
        phase1: NormalizedPage,
        sticky_ctx: tuple[str, str],
    ) -> tuple[int, NormalizedPage | None]:
        """Выполнить Phase 2: render page → base64 PNG → multimodal normalize."""
        try:
            img_b64 = await run_in_threadpool(render_page_to_b64, doc, page_num)
        except Exception as e:  # pragma: no cover
            logger.warning(
                "multimodal render failed",
                extra={"page": page_num + 1, "error": str(e)},
            )
            return page_num, None

        section, sticky = sticky_ctx
        try:
            norm_p2 = await normalize_via_llm_multimodal(
                self.provider,
                rows,
                image_b64=img_b64,
                page_number=page_num + 1,
                current_section=section,
                sticky_parent_name=sticky,
                max_tokens=settings.llm_normalize_max_tokens,
            )
        except NotImplementedError:
            logger.info(
                "provider has no multimodal_complete, skip retry",
                extra={"page": page_num + 1},
            )
            return page_num, None
        except LLMNormalizationError as e:
            logger.warning(
                "multimodal LLM normalize failed",
                extra={"page": page_num + 1, "error": str(e)},
            )
            return page_num, None

        # Unused var avoided — phase1 logged for debug only.
        if phase1 is not None and phase1.items:
            logger.debug(
                "multimodal retry finished",
                extra={
                    "page": page_num + 1,
                    "p1_items": len(phase1.items),
                    "p2_items": len(norm_p2.items),
                },
            )
        return page_num, norm_p2

    async def _process_page_sequential(self, doc: fitz.Document, page_num: int) -> None:
        """Обработка страницы по старой (pre-batch) последовательной схеме —
        используется как fallback для страниц без text layer и в случае,
        когда batch-LLM пропустил страницу (rows пусты / провайдер без
        text_complete)."""
        await self._process_page(doc, page_num)

    async def _fire_page_done(
        self,
        page_1based: int,
        items: list[NormalizedItem] | list[SpecItem],
    ) -> None:
        """Вызвать `on_page_done` (E19-1) если установлен. Тихо ловим
        исключения чтобы кривой callback не уронил парсер.

        Принимает список `NormalizedItem` (column-aware/batch path) или
        `SpecItem` (Vision/legacy fallback) и сериализует в plain dicts.
        """
        if self._on_page_done is None:
            return
        try:
            payload: list[dict] = []
            for it in items:
                if isinstance(it, SpecItem):
                    payload.append(it.model_dump())
                else:
                    payload.append(asdict(it))
            await self._on_page_done(page_1based, payload)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # pragma: no cover — диагностика
            logger.warning(
                "on_page_done callback failed",
                extra={"page": page_1based, "error": str(e)},
            )

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
            llm_costs=build_llm_costs(getattr(self.provider, "usage_log", None)),
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
            items_before = len(state.items)
            for item_data in items_llm:
                raw_name = str(item_data.get("name", "")).strip()
                # DEV-BACKLOG #13: Vision path учитывает sticky_parent_name,
                # унаследованный из column-aware пути предыдущих страниц.
                # Нужно для mixed PDF (native page → sticky «Воздуховод» →
                # scan page → Vision возвращает item с variant-only name
                # «ф100» или пустым name). Без sticky bridge рвётся.
                final_name = _apply_vision_sticky(raw_name, state.sticky_parent_name)
                if final_name and not _VARIANT_RE.match(final_name):
                    # Полное имя — обновляем sticky для следующих items/страниц.
                    state.sticky_parent_name = final_name
                state.sort_order += 1
                state.items.append(
                    SpecItem(
                        name=final_name,
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
            # E19-1: progress callback (Vision fallback path).
            await self._fire_page_done(page_num + 1, state.items[items_before:])

        except Exception as e:
            # DEV-BACKLOG #16: logger.exception пишет traceback в JSON-лог —
            # регрессии в parse_page_items / extract_structured_rows ловим
            # по stack, а не только по факту потерянных items.
            error_msg = f"Page {page_num + 1}: {e}"
            logger.exception(
                "spec_parse page error",
                extra={"page": page_num + 1, "error": str(e)},
            )
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
        state.llm_cached_tokens += normalized.cached_tokens
        state.llm_warnings.extend(
            f"page {page_num + 1}: {w}" for w in normalized.warnings
        )

        initial_sticky = state.sticky_parent_name
        self._apply_postprocess(
            normalized, rows=rows, initial_sticky=initial_sticky
        )
        # E19-1: progress callback (sequential column-aware fallback).
        await self._fire_page_done(page_num + 1, normalized.items)
        state.current_section = normalized.new_section or state.current_section
        state.sticky_parent_name = normalized.new_sticky or state.sticky_parent_name

        self._append_normalized_items(normalized, page_num)
        if normalized.items:
            state.pages_processed += 1
        else:
            state.pages_skipped += 1

        tolerance = settings.llm_expected_count_tolerance
        expected = normalized.expected_count or 0
        parsed = len(normalized.items)
        state.pages_summary.append(
            PageSummary(
                page=page_num + 1,
                expected_count=expected,
                parsed_count=parsed,
                retried=False,
                suspicious=bool(expected and (expected - parsed) >= tolerance),
            )
        )
        return True

    def _apply_postprocess(
        self,
        norm: NormalizedPage,
        *,
        rows: list[TableRow] | None = None,
        initial_sticky: str,
    ) -> None:
        """E15-06: safety-net после LLM normalize.

        1. apply_no_qty_merge — склеить continuation-орфаны (#51/#53).
        2. cap_sticky_name — отрезать sticky у non-series items (#55).
        3. restore_from_bbox_rows (E15-06 it2, #55) — сверить item.name с
           cells.name исходной bbox-row. Если LLM применила sticky к row где
           cells.name = «Воздуховод», а item.name = «Решётка» — восстановить
           Воздуховод. Требует rows + source_row_index.
        4. cover_bbox_rows (E15-06 it2, #51) — coverage-check: rows с
           непустым cells.name, не попавшие в items, склеиваем с
           предыдущим item.name (LLM выбросила continuation).

        initial_sticky — sticky_parent_name на входе страницы (с предыдущей
        страницы или с входа всего документа). Нужен для cap_sticky_name,
        чтобы корректно определить «ошибочно прилипший» родитель.
        """
        before = len(norm.items)
        if rows:
            # Fallback mapping если LLM (gpt-5.2) не заполнила source_row_index.
            norm.items = backfill_source_row_index(norm.items, rows)
        norm.items = apply_no_qty_merge(norm.items)
        norm.items = cap_sticky_name(norm.items, initial_sticky=initial_sticky)
        if rows:
            norm.items = restore_from_bbox_rows(norm.items, rows)
            norm.items = cover_bbox_rows(norm.items, rows)
        # Spec-3 Class B: fix word-break «по- крытием» → «покрытием» в
        # финальных item.name (после всех merge). Regex cyrillic-only,
        # safety на spec-ov2/АОВ проверена (никаких ложных hits).
        for it in norm.items:
            it.name = _unbreak_dash_word(it.name)
            it.name = _strip_duplicate_pos_prefix(it.name)
        # Spec-3 Class G/H: series suffix items («n=4сек.», «Ду15», «ф100»)
        # наследуют parent name от соседнего выше с тем же model_name.
        norm.items = inherit_series_parent(norm.items, rows)
        # TD-04 P2 cosmetics — Class J/G/I/N/O. Финальный полировочный layer
        # на готовых items (см. apply_p2_cosmetics docstring).
        norm.items = apply_p2_cosmetics(norm.items)
        after = len(norm.items)
        if before != after:
            norm.warnings.append(
                f"postprocess: merged {before - after} continuation row(s)"
            )

    async def _run_vision_counter(
        self, doc: "fitz.Document", page_num: int
    ) -> int:
        """E15-06 it2: один cheap vision-call — «сколько позиций на картинке».

        Независим от bbox-parser — LLM смотрит на картинку и считает позиции
        с qty. Используется как safety-net для детекции потерь хвоста.
        При любой ошибке возвращает 0 (safety-net не триггерит retry).
        """
        try:
            img_b64 = await run_in_threadpool(render_page_to_b64, doc, page_num)
        except Exception as e:  # pragma: no cover
            logger.warning(
                "vision_counter render failed",
                extra={"page": page_num + 1, "error": str(e)},
            )
            return 0
        return await count_items_on_page(img_b64, self.provider)

    def _append_normalized_items(
        self, normalized: NormalizedPage, page_num: int
    ) -> None:
        """Преобразовать NormalizedItem-ы в SpecItem и дописать в state.

        Секция — приоритет: `item.section_name` (LLM заполнил per-item для
        страниц с несколькими разделами) → `normalized.new_section` (секция
        по окончании страницы, для page-level) → `state.current_section`
        (унаследована с предыдущих страниц).
        """
        state = self.state
        for item_data in normalized.items:
            final_name = _merge_system_prefix(item_data)
            state.sort_order += 1
            section = (
                item_data.section_name
                or normalized.new_section
                or state.current_section
            )
            state.items.append(
                SpecItem(
                    name=final_name[:500],
                    model_name=item_data.model_name,
                    brand=item_data.brand,
                    manufacturer=item_data.manufacturer,
                    unit=item_data.unit or "шт",
                    quantity=item_data.quantity,
                    tech_specs="",  # comments теперь отдельное поле
                    comments=item_data.comments,
                    section_name=section,
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
        items_before = len(state.items)
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
        # E19-1: progress callback (legacy text-layer fallback).
        await self._fire_page_done(page_num + 1, state.items[items_before:])
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
                    "cached_tokens": state.llm_cached_tokens,
                    "multimodal_retries": state.multimodal_retries,
                    "multimodal_prompt_tokens": state.multimodal_prompt_tokens,
                    "multimodal_completion_tokens": state.multimodal_completion_tokens,
                    "multimodal_cached_tokens": state.multimodal_cached_tokens,
                    "warnings_count": len(state.llm_warnings),
                    "confidence_scores": state.confidence_scores,
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
            pages_summary=sorted(state.pages_summary, key=lambda p: p.page),
            llm_costs=build_llm_costs(getattr(self.provider, "usage_log", None)),
        )


def _apply_vision_sticky(raw_name: str, sticky: str) -> str:
    """DEV-BACKLOG #13: применить sticky_parent_name в Vision-пути.

    Vision LLM не знает про parent context с предыдущих страниц. Если item
    вернулся с пустым name — это продолжение серии, используем sticky
    целиком. Если name — только вариант («ф100», «150х100»), склеиваем
    sticky + variant («Воздуховод ф100»). Полное имя оставляем как есть.
    """
    if not sticky:
        return raw_name
    if not raw_name:
        return sticky
    if _VARIANT_RE.match(raw_name):
        return f"{sticky} {raw_name}"
    return raw_name


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
