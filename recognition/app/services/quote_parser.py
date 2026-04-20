"""QuoteParser — async PDF КП (commercial offer) parser via LLM Vision.

Контракт: specs/15-recognition-api.md §3.
"""

import logging
from dataclasses import dataclass, field

import fitz
from fastapi.concurrency import run_in_threadpool

from ..providers.base import BaseLLMProvider
from ..schemas.quote import QuoteItem, QuoteMeta, QuoteParseResponse, QuoteSupplier
from ._common import dedupe_by_key, determine_status, pages_stats, vision_json
from .pdf_render import render_page_to_b64

logger = logging.getLogger(__name__)


CLASSIFY_PROMPT = """Ты получаешь изображение страницы коммерческого предложения (КП).

Определи тип страницы:
- "header" — страница с поставщиком, номером/датой КП, сроком действия, итоговой суммой
- "items" — таблица позиций (наименование, модель, цена, количество, иногда сроки поставки и гарантия)
- "other" — прочее (текст без таблицы, подписи, приложения)

Одна страница может быть одновременно "header" и "items" — верни "header".

Ответь строго JSON:
{"type": "header|items|other"}
"""


EXTRACT_ITEMS_PROMPT = """Ты получаешь изображение страницы КП (коммерческого предложения).

Извлеки ВСЕ позиции из таблицы. Для каждой:
- name: наименование (без модели/бренда)
- model_name: модель/артикул (если указан)
- brand: бренд/производитель (если указан)
- unit: единица измерения (шт, комплект, м.п. и т.д.)
- quantity: количество (число)
- price_unit: цена за единицу (число)
- price_total: итого по строке (число)
- currency: ISO 4217 (RUB по умолчанию)
- tech_specs: краткие технические характеристики одной строкой (если есть)
- lead_time_days: срок поставки в днях (если указан), иначе null
- warranty_months: гарантия в месяцах (если указана), иначе null

Если позиций нет — верни пустой массив.
Ответь строго JSON: {"items": [...]}
"""


EXTRACT_HEADER_PROMPT = """Ты получаешь изображение титульной страницы КП.

Извлеки реквизиты поставщика и мета КП. Недостающие поля = "" или 0.

supplier:
- name: название поставщика
- inn: ИНН (может отсутствовать у дистрибьюторов — тогда "")

quote_meta:
- number: номер КП
- date: дата оформления (YYYY-MM-DD)
- valid_until: срок действия (YYYY-MM-DD) — если указан "в течение N дней", прибавь к date
- total_amount: итоговая сумма (число)
- currency: ISO 4217 (RUB по умолчанию)

Ответь строго JSON:
{"supplier": {...}, "quote_meta": {...}}
"""


@dataclass
class _QuoteParseState:
    pages_total: int = 0
    items: list[QuoteItem] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    pages_processed: int = 0
    pages_skipped: int = 0
    supplier: QuoteSupplier = field(default_factory=QuoteSupplier)
    quote_meta: QuoteMeta = field(default_factory=QuoteMeta)
    supplier_extracted: bool = False
    sort_order: int = 0


class QuoteParser:
    """Async PDF quote (КП) parser."""

    def __init__(self, provider: BaseLLMProvider) -> None:
        self.provider = provider
        self.state = _QuoteParseState()

    async def parse(self, pdf_bytes: bytes, filename: str = "quote.pdf") -> QuoteParseResponse:
        state = self.state
        doc = await run_in_threadpool(fitz.open, stream=pdf_bytes, filetype="pdf")
        try:
            state.pages_total = len(doc)
            logger.info(
                "quote_parse start",
                extra={"doc_filename": filename, "pages_total": state.pages_total},
            )

            for page_num in range(state.pages_total):
                await self._process_page(doc, page_num)
        finally:
            doc.close()

        state.items = self._deduplicate(state.items)
        return self._finalize()

    def build_partial(self) -> QuoteParseResponse:
        state = self.state
        return QuoteParseResponse(
            status="partial",
            items=self._deduplicate(list(state.items)),
            supplier=state.supplier,
            quote_meta=state.quote_meta,
            errors=(state.errors or []) + ["timeout: parser cancelled"],
            pages_stats=pages_stats(
                state.pages_total,
                state.pages_processed,
                state.pages_skipped,
                len(state.errors),
            ),
        )

    async def _process_page(self, doc: fitz.Document, page_num: int) -> None:
        state = self.state
        try:
            page_b64 = await run_in_threadpool(render_page_to_b64, doc, page_num)

            classification = await self._classify_page(page_b64, page_num)
            page_type = classification.get("type")

            if page_type == "other":
                state.pages_skipped += 1
                return

            if page_type == "header" and not state.supplier_extracted:
                await self._extract_header(page_b64, page_num)

            items = await self._extract_items(page_b64, page_num)
            for item_data in items:
                state.sort_order += 1
                state.items.append(
                    QuoteItem(
                        name=str(item_data.get("name", "")).strip(),
                        model_name=str(item_data.get("model_name", "")),
                        brand=str(item_data.get("brand", "")),
                        unit=str(item_data.get("unit", "шт")),
                        quantity=float(item_data.get("quantity") or 1.0),
                        price_unit=float(item_data.get("price_unit") or 0.0),
                        price_total=float(item_data.get("price_total") or 0.0),
                        currency=str(item_data.get("currency") or "RUB"),
                        tech_specs=str(item_data.get("tech_specs") or ""),
                        lead_time_days=_as_int_or_none(item_data.get("lead_time_days")),
                        warranty_months=_as_int_or_none(item_data.get("warranty_months")),
                        page_number=page_num + 1,
                        sort_order=state.sort_order,
                    )
                )
            state.pages_processed += 1

        except Exception as e:
            error_msg = f"Page {page_num + 1}: {e}"
            logger.warning(
                "quote_parse page error", extra={"page": page_num + 1, "error": str(e)}
            )
            state.errors.append(error_msg)

    async def _classify_page(self, image_b64: str, page_num: int) -> dict:
        try:
            return await vision_json(
                self.provider, image_b64, CLASSIFY_PROMPT, log_ctx=f"quote_classify_p{page_num+1}"
            )
        except ValueError:
            return {"type": "items"}

    async def _extract_items(self, image_b64: str, page_num: int) -> list[dict]:
        try:
            data = await vision_json(
                self.provider,
                image_b64,
                EXTRACT_ITEMS_PROMPT,
                log_ctx=f"quote_items_p{page_num+1}",
            )
        except ValueError as e:
            raise ValueError(f"Extract items page {page_num + 1}: {e}") from e
        items = data.get("items", [])
        return list(items) if isinstance(items, list) else []

    async def _extract_header(self, image_b64: str, page_num: int) -> None:
        state = self.state
        try:
            data = await vision_json(
                self.provider,
                image_b64,
                EXTRACT_HEADER_PROMPT,
                log_ctx=f"quote_header_p{page_num+1}",
            )
        except ValueError as e:
            state.errors.append(f"Page {page_num + 1} header: {e}")
            return

        supplier = data.get("supplier") or {}
        meta = data.get("quote_meta") or {}
        if isinstance(supplier, dict):
            state.supplier = QuoteSupplier(
                name=str(supplier.get("name", "")),
                inn=str(supplier.get("inn", "")),
            )
            state.supplier_extracted = True
        if isinstance(meta, dict):
            state.quote_meta = QuoteMeta(
                number=str(meta.get("number", "")),
                date=str(meta.get("date", "")),
                valid_until=str(meta.get("valid_until", "")),
                total_amount=float(meta.get("total_amount") or 0.0),
                currency=str(meta.get("currency") or "RUB"),
            )

    def _finalize(self) -> QuoteParseResponse:
        state = self.state
        return QuoteParseResponse(
            status=determine_status(state.errors, state.items),
            items=state.items,
            supplier=state.supplier,
            quote_meta=state.quote_meta,
            errors=state.errors,
            pages_stats=pages_stats(
                state.pages_total,
                state.pages_processed,
                state.pages_skipped,
                len(state.errors),
            ),
        )

    @staticmethod
    def _deduplicate(items: list[QuoteItem]) -> list[QuoteItem]:
        def key(i: QuoteItem) -> tuple[str, str, str]:
            return (
                i.name.lower().strip(),
                i.model_name.lower().strip(),
                i.brand.lower().strip(),
            )

        def merge(target: QuoteItem, dup: QuoteItem) -> None:
            target.quantity += dup.quantity
            target.price_total += dup.price_total

        return dedupe_by_key(items, key, merge)


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
