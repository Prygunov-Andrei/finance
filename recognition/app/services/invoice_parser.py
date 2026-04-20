"""InvoiceParser — async PDF supplier-invoice parser via LLM Vision.

Контракт: specs/15-recognition-api.md §2.
"""

import logging
from dataclasses import dataclass, field

import fitz
from fastapi.concurrency import run_in_threadpool

from ..providers.base import BaseLLMProvider
from ..schemas.invoice import (
    InvoiceItem,
    InvoiceMeta,
    InvoiceParseResponse,
    SupplierInfo,
)
from ._common import dedupe_by_key, determine_status, pages_stats, vision_json
from .pdf_render import render_page_to_b64

logger = logging.getLogger(__name__)


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
    supplier: SupplierInfo = field(default_factory=SupplierInfo)
    invoice_meta: InvoiceMeta = field(default_factory=InvoiceMeta)
    supplier_extracted: bool = False
    sort_order: int = 0


class InvoiceParser:
    """Async PDF invoice parser."""

    def __init__(self, provider: BaseLLMProvider) -> None:
        self.provider = provider
        self.state = _InvoiceParseState()

    async def parse(self, pdf_bytes: bytes, filename: str = "invoice.pdf") -> InvoiceParseResponse:
        state = self.state
        doc = await run_in_threadpool(fitz.open, stream=pdf_bytes, filetype="pdf")
        try:
            state.pages_total = len(doc)
            logger.info(
                "invoice_parse start",
                extra={"doc_filename": filename, "pages_total": state.pages_total},
            )

            for page_num in range(state.pages_total):
                await self._process_page(doc, page_num)
        finally:
            doc.close()

        state.items = self._deduplicate(state.items)
        return self._finalize()

    def build_partial(self) -> InvoiceParseResponse:
        state = self.state
        return InvoiceParseResponse(
            status="partial",
            items=self._deduplicate(list(state.items)),
            supplier=state.supplier,
            invoice_meta=state.invoice_meta,
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
                "invoice_parse page error", extra={"page": page_num + 1, "error": str(e)}
            )
            state.errors.append(error_msg)

    async def _classify_page(self, image_b64: str, page_num: int) -> dict:
        try:
            return await vision_json(
                self.provider, image_b64, CLASSIFY_PROMPT, log_ctx=f"invoice_classify_p{page_num+1}"
            )
        except ValueError:
            # classification provider failure — consider page "items" (try extract anyway)
            return {"type": "items"}

    async def _extract_items(self, image_b64: str, page_num: int) -> list[dict]:
        try:
            data = await vision_json(
                self.provider,
                image_b64,
                EXTRACT_ITEMS_PROMPT,
                log_ctx=f"invoice_items_p{page_num+1}",
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
                log_ctx=f"invoice_header_p{page_num+1}",
            )
        except ValueError as e:
            state.errors.append(f"Page {page_num + 1} header: {e}")
            return

        supplier = data.get("supplier") or {}
        meta = data.get("invoice_meta") or {}
        if isinstance(supplier, dict):
            state.supplier = SupplierInfo(
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

    def _finalize(self) -> InvoiceParseResponse:
        state = self.state
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
        )

    @staticmethod
    def _deduplicate(items: list[InvoiceItem]) -> list[InvoiceItem]:
        def key(i: InvoiceItem) -> tuple[str, str, str]:
            return (
                i.name.lower().strip(),
                i.model_name.lower().strip(),
                i.brand.lower().strip(),
            )

        def merge(target: InvoiceItem, dup: InvoiceItem) -> None:
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
