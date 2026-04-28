"""InvoiceParser — async hybrid PDF invoice parser (E16 it1).

Architecture (mirror SpecParser E15.04-E15.05):
  Phase 0: extract_title_block (1 text-LLM call на page 1 → supplier + meta).
  Phase 1: extract_invoice_rows per page с text layer (bbox → TableRow).
  Phase 2a: normalize_invoice_items_via_llm (параллельно, gpt-4o full text).
  Phase 2b: conditional multimodal retry если confidence < threshold, с
            broker-selection (принимаем P2 только если confidence вырос).
  Fallback: Vision-only (legacy CLASSIFY_PROMPT + EXTRACT_PROMPT) для
            страниц без text layer.

Контракт: specs/15-recognition-api.md §2.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

import fitz
from fastapi.concurrency import run_in_threadpool

from ..config import settings
from ..providers.base import BaseLLMProvider
from ..schemas.invoice import (
    InvoiceItem,
    InvoiceMeta,
    InvoiceParseResponse,
    InvoiceSupplier,
)
from ._common import determine_status, pages_stats, vision_json
from .invoice_normalizer import (
    LLMInvoiceNormalizationError,
    NormalizedInvoicePage,
    compute_invoice_confidence,
    normalize_invoice_items_via_llm,
    normalize_invoice_items_via_llm_multimodal,
)
from .invoice_title_block import TitleBlockError, extract_title_block
from .pdf_render import render_page_to_b64
from .pdf_text import (
    TEXT_LAYER_MIN_CHARS_PER_PAGE,
    TableRow,
    extract_invoice_rows,
    has_usable_text_layer,
)
from .pricing import build_llm_costs

logger = logging.getLogger(__name__)


# Legacy Vision prompts — остаются для pages без text layer (scanned invoice).
CLASSIFY_PROMPT = """Ты получаешь изображение страницы счёта поставщика (invoice).

Определи тип страницы:
- "header" — первая/титульная страница с реквизитами поставщика, номером и датой счёта, итоговой суммой
- "items" — продолжение таблицы позиций (наименование, цена, количество, сумма)
- "other" — прочее (приложения, подписи, не относящееся)

Одна страница может быть одновременно "header" и "items" — в этом случае вернуть "header" (она также будет обработана как items).

Ответь строго JSON:
{"type": "header|items|other"}
"""


EXTRACT_ITEMS_PROMPT = """Ты получаешь изображение страницы счёта поставщика.

Извлеки ВСЕ товарные позиции из таблицы. Для каждой позиции:
- name: наименование товара (без модели/бренда)
- model_name: артикул/модель (если указан отдельной колонкой)
- brand: бренд/производитель (если указан)
- unit: единица измерения (шт, м, м.п., кг — как в документе)
- quantity: количество (число)
- price_unit: цена за единицу (число, как в документе — с НДС или без)
- price_total: итоговая сумма по строке (число)
- currency: ISO 4217 (RUB / USD / EUR — по умолчанию RUB)
- vat_rate: ставка НДС в % (0/10/20), null если не указана

Если на странице нет табличных позиций — верни пустой массив.
Ответь строго JSON: {"items": [...]}
"""


EXTRACT_HEADER_PROMPT = """Ты получаешь изображение первой/титульной страницы счёта поставщика.

Извлеки реквизиты поставщика и мета счёта. Отсутствующие поля = "" или 0.

supplier:
- name: название поставщика (юрлицо)
- inn: ИНН
- kpp: КПП
- bank_account: расчётный счёт
- bik: БИК
- correspondent_account: корр. счёт

invoice_meta:
- number: номер счёта
- date: дата в формате YYYY-MM-DD (если в документе другой формат — приведи к ISO)
- total_amount: итоговая сумма счёта (число)
- vat_amount: сумма НДС (число)
- currency: ISO 4217 (RUB по умолчанию)

Ответь строго JSON:
{"supplier": {...}, "invoice_meta": {...}}
"""


@dataclass
class _InvoiceParseState:
    pages_total: int = 0
    items: list[InvoiceItem] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    pages_processed: int = 0
    pages_skipped: int = 0
    supplier: InvoiceSupplier = field(default_factory=InvoiceSupplier)
    invoice_meta: InvoiceMeta = field(default_factory=InvoiceMeta)
    supplier_extracted: bool = False
    sort_order: int = 0
    # Метрики Phase 0-2 для QA-отчёта (см. _finalize).
    title_block_retry: bool = False
    llm_calls: int = 0
    llm_prompt_tokens: int = 0
    llm_completion_tokens: int = 0
    llm_cached_tokens: int = 0  # TD-01: prompt caching
    multimodal_retries: int = 0
    multimodal_prompt_tokens: int = 0
    multimodal_completion_tokens: int = 0
    multimodal_cached_tokens: int = 0  # TD-01
    confidence_scores: list[tuple[int, float, bool]] = field(default_factory=list)
    llm_warnings: list[str] = field(default_factory=list)


class InvoiceParser:
    """Async PDF invoice parser — hybrid bbox + LLM pipeline."""

    def __init__(self, provider: BaseLLMProvider) -> None:
        self.provider = provider
        self.state = _InvoiceParseState()
        self._processed_pages: set[int] = set()

    async def parse(
        self, pdf_bytes: bytes, filename: str = "invoice.pdf"
    ) -> InvoiceParseResponse:
        state = self.state
        doc = await run_in_threadpool(fitz.open, stream=pdf_bytes, filetype="pdf")
        try:
            state.pages_total = len(doc)
            logger.info(
                "invoice_parse start",
                extra={"doc_filename": filename, "pages_total": state.pages_total},
            )
            if state.pages_total == 0:
                return self._finalize()

            # Phase 0 — title block. Делаем ОДИН раз, на первой странице.
            # Требует text layer; если его нет — позже fallback на Vision
            # header prompt.
            await self._phase0_title_block(doc)

            # Phase 1-2 — items pipeline на страницах с text layer.
            await self._phase12_items_column_aware(doc)

            # Fallback для страниц без text layer: Vision-only path.
            for page_num in range(state.pages_total):
                if page_num in self._processed_pages:
                    continue
                await self._process_page_vision_fallback(doc, page_num)
        finally:
            doc.close()

        return self._finalize()

    def build_partial(self) -> InvoiceParseResponse:
        state = self.state
        return InvoiceParseResponse(
            status="partial",
            items=list(state.items),
            supplier=state.supplier,
            invoice_meta=state.invoice_meta,
            errors=(state.errors or []) + ["timeout: parser cancelled"],
            pages_stats=pages_stats(
                state.pages_total,
                state.pages_processed,
                state.pages_skipped,
                len(state.errors),
            ),
            llm_costs=build_llm_costs(getattr(self.provider, "usage_log", None)),
        )

    # ------------------------------------------------------------------
    # Phase 0 — title block
    # ------------------------------------------------------------------

    async def _phase0_title_block(self, doc: fitz.Document) -> None:
        """Phase 0 — supplier + invoice_meta через text-only LLM call.

        Читаем text layer ВСЕХ страниц (до ~50k символов) — итоговые
        значения («Итого, руб:», «в т.ч. НДС, руб:») нередко на ПОСЛЕДНЕЙ
        странице таблицы, как в invoice-02 (ЛУИС+).
        """
        state = self.state
        text_parts: list[str] = []
        budget = 50_000
        for page_num in range(state.pages_total):
            page_text = await run_in_threadpool(
                doc[page_num].get_text  # type: ignore[attr-defined]
            )
            if not page_text:
                continue
            text_parts.append(f"--- page {page_num + 1} ---\n{page_text}")
            budget -= len(page_text)
            if budget <= 0:
                break
        text = "\n".join(text_parts)
        if not text.strip():
            return

        # Pre-render page 1 PNG для возможного multimodal retry.
        try:
            page_b64 = await run_in_threadpool(render_page_to_b64, doc, 0)
        except Exception:  # pragma: no cover - defensive
            page_b64 = None

        try:
            result = await extract_title_block(
                self.provider,
                text,
                multimodal_fallback_image_b64=page_b64,
                max_tokens=settings.llm_normalize_max_tokens,
            )
        except NotImplementedError:
            # Провайдер без text_complete (тестовые stubs) — пропускаем
            # Phase 0, будет legacy Vision header-fallback.
            logger.info("title_block skipped: provider has no text_complete")
            return
        except TitleBlockError as e:
            state.errors.append(f"title_block: {e}")
            return

        state.supplier = result.supplier
        state.invoice_meta = result.meta
        state.supplier_extracted = bool(result.supplier.inn or result.supplier.name)
        state.title_block_retry = result.multimodal_retry_used
        state.llm_calls += 1
        state.llm_prompt_tokens += result.prompt_tokens
        state.llm_completion_tokens += result.completion_tokens
        state.llm_cached_tokens += result.cached_tokens

    # ------------------------------------------------------------------
    # Phase 1-2 — items hybrid
    # ------------------------------------------------------------------

    async def _phase12_items_column_aware(self, doc: fitz.Document) -> None:
        """Параллельный text-only normalize + conditional multimodal retry.

        Для каждой страницы с text layer:
          Phase 1: bbox extract_invoice_rows → LLM text-normalize.
          Phase 2: если confidence < threshold → multimodal retry с
                   broker-selection (P2 принимается только если confidence
                   вырос относительно P1).
        """
        state = self.state

        # extract_invoice_rows per page (sync, быстро).
        pages_rows: list[list[TableRow]] = []
        for page_num in range(state.pages_total):
            page = doc[page_num]
            if not has_usable_text_layer(page, min_chars=TEXT_LAYER_MIN_CHARS_PER_PAGE):
                pages_rows.append([])
                continue
            try:
                rows = await run_in_threadpool(extract_invoice_rows, page)
            except Exception as e:  # pragma: no cover
                logger.warning(
                    "extract_invoice_rows failed",
                    extra={"page": page_num + 1, "error": str(e)},
                )
                rows = []
            pages_rows.append(rows)

        # Параллельные LLM calls (Phase 1) для страниц с непустыми rows.
        async def run_one(
            page_num: int, rows: list[TableRow]
        ) -> tuple[int, NormalizedInvoicePage | str | None]:
            if not rows:
                return page_num, None
            try:
                norm = await normalize_invoice_items_via_llm(
                    self.provider,
                    rows,
                    page_number=page_num + 1,
                    max_tokens=settings.llm_normalize_max_tokens,
                )
                return page_num, norm
            except NotImplementedError:
                return page_num, "no_text_complete"
            except LLMInvoiceNormalizationError as e:
                logger.warning(
                    "llm invoice normalize failed",
                    extra={"page": page_num + 1, "error": str(e)},
                )
                state.errors.append(f"page {page_num + 1}: {e}")
                return page_num, None

        tasks = [run_one(pn, rows) for pn, rows in enumerate(pages_rows)]
        outcomes = await asyncio.gather(*tasks)

        phase1_by_page: dict[int, NormalizedInvoicePage] = {}
        provider_supports_text = True
        for page_num, norm in outcomes:
            if norm == "no_text_complete":
                # Провайдер не умеет text_complete — позже legacy Vision.
                provider_supports_text = False
                continue
            if norm is None or isinstance(norm, str):
                continue
            phase1_by_page[page_num] = norm
            state.llm_calls += 1
            state.llm_prompt_tokens += norm.prompt_tokens
            state.llm_completion_tokens += norm.completion_tokens
            state.llm_cached_tokens += norm.cached_tokens
            state.llm_warnings.extend(
                f"page {page_num + 1}: {w}" for w in norm.warnings
            )

        if not provider_supports_text:
            # Весь Phase 1-2 пропускаем — Vision fallback справится.
            return

        # Phase 2 — conditional multimodal retry.
        final_by_page: dict[int, NormalizedInvoicePage] = dict(phase1_by_page)
        if settings.llm_multimodal_retry_enabled:
            retry_jobs = []
            for page_num, norm in phase1_by_page.items():
                rows = pages_rows[page_num]
                conf = compute_invoice_confidence(norm, rows)
                retried = False
                if conf < settings.llm_multimodal_retry_threshold and rows:
                    retried = True
                    retry_jobs.append(
                        self._run_multimodal_retry(doc, page_num, rows, norm)
                    )
                state.confidence_scores.append((page_num + 1, conf, retried))

            if retry_jobs:
                retry_outcomes = await asyncio.gather(
                    *retry_jobs, return_exceptions=True
                )
                for outcome in retry_outcomes:
                    if isinstance(outcome, BaseException):
                        logger.warning("invoice multimodal retry crashed: %s", outcome)
                        continue
                    page_num, norm_p2 = outcome  # type: ignore[misc]
                    if norm_p2 is None:
                        continue
                    p1 = phase1_by_page[page_num]
                    rows = pages_rows[page_num]
                    conf_p1 = compute_invoice_confidence(p1, rows)
                    conf_p2 = compute_invoice_confidence(norm_p2, rows)
                    if conf_p2 > conf_p1:
                        final_by_page[page_num] = norm_p2
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

        # Применяем финальные результаты в порядке страниц.
        for page_num in sorted(final_by_page.keys()):
            norm = final_by_page[page_num]
            self._append_normalized_items(norm, page_num)
            if norm.items:
                state.pages_processed += 1
            else:
                state.pages_skipped += 1
            self._processed_pages.add(page_num)

    async def _run_multimodal_retry(
        self,
        doc: fitz.Document,
        page_num: int,
        rows: list[TableRow],
        phase1: NormalizedInvoicePage,
    ) -> tuple[int, NormalizedInvoicePage | None]:
        try:
            img_b64 = await run_in_threadpool(render_page_to_b64, doc, page_num)
        except Exception as e:  # pragma: no cover
            logger.warning(
                "invoice multimodal render failed",
                extra={"page": page_num + 1, "error": str(e)},
            )
            return page_num, None

        try:
            norm_p2 = await normalize_invoice_items_via_llm_multimodal(
                self.provider,
                rows,
                image_b64=img_b64,
                page_number=page_num + 1,
                max_tokens=settings.llm_normalize_max_tokens,
            )
        except NotImplementedError:
            logger.info(
                "invoice provider has no multimodal_complete — skip retry",
                extra={"page": page_num + 1},
            )
            return page_num, None
        except LLMInvoiceNormalizationError as e:
            logger.warning(
                "invoice multimodal normalize failed",
                extra={"page": page_num + 1, "error": str(e)},
            )
            return page_num, None

        logger.debug(
            "invoice multimodal retry finished",
            extra={
                "page": page_num + 1,
                "p1_items": len(phase1.items) if phase1 else 0,
                "p2_items": len(norm_p2.items),
            },
        )
        return page_num, norm_p2

    def _append_normalized_items(
        self, normalized: NormalizedInvoicePage, page_num: int
    ) -> None:
        state = self.state
        default_vat_rate = state.invoice_meta.vat_rate
        for it in normalized.items:
            state.sort_order += 1
            # vat_rate: если LLM не указал per-item, берём из title block.
            vat_rate = it.vat_rate if it.vat_rate is not None else default_vat_rate
            state.items.append(
                InvoiceItem(
                    name=it.name,
                    model_name=it.model_name,
                    brand=it.brand,
                    unit=it.unit,
                    quantity=it.quantity,
                    price_unit=it.price_unit,
                    price_total=it.price_total,
                    currency=state.invoice_meta.currency or "RUB",
                    vat_rate=vat_rate,
                    vat_amount=it.vat_amount,
                    lead_time_days=it.lead_time_days,
                    notes=it.notes,
                    supply_type=it.supply_type,
                    page_number=page_num + 1,
                    sort_order=state.sort_order,
                )
            )

    # ------------------------------------------------------------------
    # Vision fallback (legacy path — для страниц без text layer)
    # ------------------------------------------------------------------

    async def _process_page_vision_fallback(
        self, doc: fitz.Document, page_num: int
    ) -> None:
        state = self.state
        try:
            page_b64 = await run_in_threadpool(render_page_to_b64, doc, page_num)

            classification = await self._classify_page(page_b64, page_num)
            page_type = classification.get("type")

            if page_type == "other":
                state.pages_skipped += 1
                return

            # Header extract — только если Phase 0 не получил supplier.
            if page_type == "header" and not state.supplier_extracted:
                await self._extract_header_vision(page_b64, page_num)

            items = await self._extract_items_vision(page_b64, page_num)
            for item_data in items:
                state.sort_order += 1
                state.items.append(
                    InvoiceItem(
                        name=str(item_data.get("name", "")).strip(),
                        model_name=str(item_data.get("model_name", "")),
                        brand=str(item_data.get("brand", "")),
                        unit=str(item_data.get("unit", "шт")),
                        quantity=float(item_data.get("quantity") or 1.0),
                        price_unit=float(item_data.get("price_unit") or 0.0),
                        price_total=float(item_data.get("price_total") or 0.0),
                        currency=str(item_data.get("currency") or "RUB"),
                        vat_rate=_as_int_or_none(item_data.get("vat_rate")),
                        page_number=page_num + 1,
                        sort_order=state.sort_order,
                    )
                )
            state.pages_processed += 1
        except Exception as e:
            error_msg = f"Page {page_num + 1}: {e}"
            logger.warning(
                "invoice_parse vision fallback error",
                extra={"page": page_num + 1, "error": str(e)},
            )
            state.errors.append(error_msg)

    async def _classify_page(self, image_b64: str, page_num: int) -> dict:
        try:
            return await vision_json(
                self.provider,
                image_b64,
                CLASSIFY_PROMPT,
                log_ctx=f"invoice_classify_p{page_num + 1}",
            )
        except ValueError:
            return {"type": "items"}

    async def _extract_items_vision(self, image_b64: str, page_num: int) -> list[dict]:
        try:
            data = await vision_json(
                self.provider,
                image_b64,
                EXTRACT_ITEMS_PROMPT,
                log_ctx=f"invoice_items_p{page_num + 1}",
            )
        except ValueError as e:
            raise ValueError(f"Extract items page {page_num + 1}: {e}") from e
        items = data.get("items", [])
        return list(items) if isinstance(items, list) else []

    async def _extract_header_vision(self, image_b64: str, page_num: int) -> None:
        state = self.state
        try:
            data = await vision_json(
                self.provider,
                image_b64,
                EXTRACT_HEADER_PROMPT,
                log_ctx=f"invoice_header_p{page_num + 1}",
            )
        except ValueError as e:
            state.errors.append(f"Page {page_num + 1} header: {e}")
            return

        supplier = data.get("supplier") or {}
        meta = data.get("invoice_meta") or {}
        if isinstance(supplier, dict):
            state.supplier = InvoiceSupplier(
                name=str(supplier.get("name", "")),
                inn=str(supplier.get("inn", "")),
                kpp=str(supplier.get("kpp", "")),
                bank_account=str(supplier.get("bank_account", "")),
                bik=str(supplier.get("bik", "")),
                correspondent_account=str(supplier.get("correspondent_account", "")),
            )
            state.supplier_extracted = True
        if isinstance(meta, dict):
            state.invoice_meta = InvoiceMeta(
                number=str(meta.get("number", "")),
                date=str(meta.get("date", "")),
                total_amount=float(meta.get("total_amount") or 0.0),
                vat_amount=float(meta.get("vat_amount") or 0.0),
                currency=str(meta.get("currency") or "RUB"),
            )

    # ------------------------------------------------------------------
    # Finalize
    # ------------------------------------------------------------------

    def _finalize(self) -> InvoiceParseResponse:
        state = self.state
        if state.llm_calls or state.multimodal_retries:
            logger.info(
                "invoice_parse llm metrics",
                extra={
                    "llm_calls": state.llm_calls,
                    "prompt_tokens": state.llm_prompt_tokens,
                    "completion_tokens": state.llm_completion_tokens,
                    "cached_tokens": state.llm_cached_tokens,
                    "multimodal_retries": state.multimodal_retries,
                    "multimodal_prompt_tokens": state.multimodal_prompt_tokens,
                    "multimodal_completion_tokens": state.multimodal_completion_tokens,
                    "multimodal_cached_tokens": state.multimodal_cached_tokens,
                    "title_block_retry": state.title_block_retry,
                    "confidence_scores": state.confidence_scores,
                    "warnings_count": len(state.llm_warnings),
                },
            )
        return InvoiceParseResponse(
            status=determine_status(state.errors, state.items),
            items=state.items,
            supplier=state.supplier,
            invoice_meta=state.invoice_meta,
            errors=state.errors,
            pages_stats=pages_stats(
                state.pages_total,
                state.pages_processed,
                state.pages_skipped,
                len(state.errors),
            ),
            llm_costs=build_llm_costs(getattr(self.provider, "usage_log", None)),
        )


def _as_int_or_none(value: object) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, (str, float)):
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
    return None
