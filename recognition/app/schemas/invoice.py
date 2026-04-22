"""Pydantic schemas for /v1/parse/invoice (per specs §2).

E16 it1 — hybrid pipeline для счетов поставщиков:
  - `InvoiceItem` расширен `vat_amount`, `lead_time_days`, `notes`,
    `supply_type`, `tech_specs` (mirror SpecItem where possible).
  - `InvoiceSupplier` (=старый `SupplierInfo`) расширен `address`, `bank_name`,
    `phone`.
  - `InvoiceMeta` расширен `vat_rate`, `contract_ref`, `project_ref`.

Все новые поля имеют default-значения → backward-compat: старые клиенты
(ISMeta payments-apply) продолжают читать базовые поля через `.get()` и не
ломаются.
"""

from pydantic import BaseModel, Field

from .spec import PagesStats


class InvoiceItem(BaseModel):
    name: str
    model_name: str = ""
    brand: str = ""
    unit: str = "шт"
    quantity: float = 1.0
    price_unit: float = 0.0
    price_total: float = 0.0
    currency: str = "RUB"
    vat_rate: int | None = None
    # E16 it1 — абсолютная сумма НДС по строке (инвойс-01 колонка «в т.ч. НДС»).
    # Если поставщик не указывает per-item (инвойс-02, УСН) — 0.0.
    vat_amount: float = 0.0
    # Срок поставки в рабочих днях. «7 р.д.» → 7; «в наличии» / пусто → None.
    lead_time_days: int | None = None
    # Примечание из счёта («в наличии», «заказной», комментарий поставщика).
    notes: str = ""
    # Тип поставки (invoice-02 колонка «ЗТ*»): "X" = заказной, пусто = в наличии.
    supply_type: str = ""
    tech_specs: str = ""
    page_number: int = 0
    sort_order: int = 0


class InvoiceSupplier(BaseModel):
    name: str = ""
    inn: str = ""
    kpp: str = ""
    bank_account: str = ""
    bik: str = ""
    correspondent_account: str = ""
    # E16 it1 — опциональные поля, заполняются Phase 0 extract_title_block.
    address: str = ""
    bank_name: str = ""
    phone: str = ""


# Backward-compat alias. Старый клиентский код импортировал `SupplierInfo` —
# оставляем чтобы не ломать импорты в тестах / downstream модулях.
SupplierInfo = InvoiceSupplier


class InvoiceMeta(BaseModel):
    number: str = ""
    date: str = ""
    total_amount: float = 0.0
    vat_amount: float = 0.0
    currency: str = "RUB"
    # E16 it1 — ставка НДС в % (22 / 20 / 10 / 0). None если «Без НДС» (УСН).
    vat_rate: int | None = None
    # Ссылка на договор («№ 12/20-315 от 22.12.2020») если указана в шапке.
    contract_ref: str = ""
    # Проектная / объектная привязка («Озеры 123 ДПУ») из примечания.
    project_ref: str = ""


class InvoiceParseResponse(BaseModel):
    status: str = "done"  # done | partial | error
    items: list[InvoiceItem] = Field(default_factory=list)
    supplier: InvoiceSupplier = Field(default_factory=InvoiceSupplier)
    invoice_meta: InvoiceMeta = Field(default_factory=InvoiceMeta)
    errors: list[str] = Field(default_factory=list)
    pages_stats: PagesStats = Field(default_factory=PagesStats)
