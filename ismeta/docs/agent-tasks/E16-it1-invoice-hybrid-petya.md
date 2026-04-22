# ТЗ: E16 итерация 1 — Invoice гибрид (bbox + multimodal + gpt-4o) (IS-Петя)

**Команда:** IS-Петя.
**Ветка:** `recognition/09-e16-it1-invoice-hybrid`.
**Worktree:** `ERP_Avgust_is_petya_e16_invoice`.
**Приоритет:** 🔴 blocker (старый `invoice_parser.py` — чистый Vision, recall < 50% на реальных счетах).
**Срок:** 1.5–2 дня.

---

## Контекст

Андрей (PO): «Нам нужно практически 100% качество распознавания для любых документов — не только Спецификаций. Модуль использовать также для Счетов и КП от Поставщиков.»

SpecParser (E15.05 it2) закрыл эту задачу для Спецификаций (3 golden'а: ov2 98%, aov 100%, tabs 87% model). Теперь E16 переносит архитектуру на **Счета**.

**Текущий `invoice_parser.py`:**
- Pure Vision-only (`vision_complete` на PNG каждой страницы).
- `CLASSIFY_PROMPT` + `EXTRACT_PROMPT` с gpt-4o-mini.
- Нет bbox-парсера, нет multimodal retry, нет column detection.
- Recall < 50% на реальных счетах (QA подтвержденo PO).

**Цель E16 it1:** адаптировать SpecParser-паттерн на Invoice. Bbox-парсер → text-LLM (gpt-4o full) → conditional multimodal retry → финальная нормализация.

---

## Golden fixtures

Сохранены в `ismeta/tests/fixtures/golden/`:
- **`invoice-01.pdf`** — ООО «Фабрика Вентиляции ГалВент», 2 стр, 4 items (Воздуховоды АЛ-102/160/203/254), total 16 466,25 ₽, НДС 2 969,33 ₽ (22%).
  - Колонки: `№ | Товары (работы, услуги) | Кол-во | Ед. | Цена | в т.ч. НДС | Сумма`
  - Ед.изм. отдельной колонкой («упак»).
  - НДС per-item (колонка «в т.ч. НДС»).
  - Шапка реквизитов: бухгалтерский блок банка сверху (АЛЬФА-БАНК, БИК → Банк получателя → ИНН/КПП → Сч.№ получателя).
  - Номер/дата: «Счет на оплату № 20047 от 02 марта 2026, договор № 12/20-315 от 22 декабря 2020»
  - Примечание: «Озеры 123 ДПУ» (проектная привязка).

- **`invoice-02.pdf`** — ООО «ЛУИС+», 2 стр, 15 items (контроллеры доступа / коммутаторы / кабель), total 1 714 790,31 ₽, НДС 309 224,48 ₽ (~22%).
  - Колонки: `# | Товар/Услуга | ЗТ* | Срок | Цена, руб | Кол-во | Сумма, руб | Примечание`
  - **Ед.изм. ВНУТРИ «Кол-во»** — ячейка содержит «27 шт.», «2 шт.», «7 р.д.» — парсер должен разделить.
  - НДС per-item **отсутствует** (только итоговый).
  - Колонка **«ЗТ*»** (тип товара: Х = заказной).
  - Колонка **«Срок»** — «7 р.д.» для 2 items (lead_time_days).
  - Колонка **«Примечание»** — «в наличии» / «7 р.д.».
  - Шапка: списковый формат (Продавец → р/с / ИНН / КПП / Банк → БИК → Адрес).
  - Номер: «Счёт №ЛП001556 от 06.03.2026 по Договору поставки № ЛП2024/0416-2 от 16.04.2024»

**Покупатель** (ГК АВГУСТ) — **не извлекать** в `supplier`. Это мы сами, в `supplier` кладём только продавца.

---

## Архитектура — 5-фазный pipeline (mirror SpecParser)

```
Invoice PDF
  │
  ├─ Phase 0: extract_title_block(page_1)
  │     → ONE LLM call (gpt-4o full, text-only)
  │     → supplier + invoice_meta (номер, дата, договор, проект, итого, НДС, ставка)
  │     → Если confidence < 0.5 → multimodal retry (PNG page_1)
  │
  ├─ Phase 1: extract_invoice_rows(page) для каждой страницы с текстом
  │     → bbox-парсер, invoice-specific column headers
  │     → list[TableRow] c cells {pos, name, unit, qty, price_unit, price_total,
  │                              vat_amount, lead_time, notes, supply_type}
  │
  ├─ Phase 2a: normalize_invoice_items_via_llm(rows, page_num) для каждой страницы
  │     → text-only gpt-4o, параллельно через asyncio.gather
  │     → NormalizedInvoicePage
  │
  ├─ Phase 2b: compute_invoice_confidence → conditional multimodal retry
  │     → Если confidence < 0.7 → PNG + JSON rows
  │     → Broker: P2 принимается только если confidence_p2 > p1
  │
  └─ Finalize:
        InvoiceParseResponse(status, items, supplier, invoice_meta, errors, pages_stats)
```

**Ключевое отличие от SpecParser:** Phase 0 — title block extraction. Supplier и invoice_meta **не в таблице**, живут в шапке/блоке банка. Bbox-парсер для шапки ненадёжен (разная вёрстка: бухгалтерский блок vs списковый) → отдельный LLM call на **весь text layer page 1** с структурным промптом.

---

## Задачи

### 1. Расширить схему InvoiceItem + InvoiceMeta

**Файл:** `recognition/app/schemas/invoice.py`.

```python
class InvoiceItem(BaseModel):
    name: str
    model_name: str = ""
    brand: str = ""
    unit: str = "шт"
    quantity: float = 1.0
    price_unit: float = 0.0
    price_total: float = 0.0
    vat_amount: float = 0.0       # абсолютный НДС на item (инвойс-01 колонка «в т.ч. НДС»)
    vat_rate: int | None = None   # ставка НДС % (редко per-item, обычно в meta)
    # E16 новое:
    lead_time_days: int | None = None   # «7 р.д.» → 7 (как в QuoteItem)
    notes: str = ""                     # «в наличии» / «заказной» / примечание
    supply_type: str = ""               # ЗТ* (редко, только invoice-02): X=заказной
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
    # E16 новое (опционально):
    address: str = ""
    bank_name: str = ""       # «АО "АЛЬФА-БАНК" г. Москва»
    phone: str = ""


class InvoiceMeta(BaseModel):
    number: str = ""
    date: str = ""                    # ISO "2026-03-02" из «02 марта 2026»
    total_amount: float = 0.0
    vat_amount: float = 0.0
    currency: str = "RUB"
    # E16 новое:
    vat_rate: int | None = None       # 22 / 20 / 10 / 0 (None = «Без НДС» для УСН)
    contract_ref: str = ""            # «№ 12/20-315 от 22.12.2020»
    project_ref: str = ""             # «Озеры 123 ДПУ» (примечание о проекте)


class InvoiceParseResponse(BaseModel):
    status: str = "done"
    items: list[InvoiceItem] = Field(default_factory=list)
    supplier: InvoiceSupplier = Field(default_factory=InvoiceSupplier)
    invoice_meta: InvoiceMeta = Field(default_factory=InvoiceMeta)
    errors: list[str] = Field(default_factory=list)
    pages_stats: PagesStats = Field(default_factory=PagesStats)
```

**openapi.yaml** — добавить все новые поля.

**Backward compatibility:** все новые поля default-значения (`str = ""`, `int | None = None`), старые клиенты не ломаются.

### 2. extract_title_block (новый, LLM-based)

**Файл:** `recognition/app/services/invoice_title_block.py` (новый) — или в `invoice_parser.py` внутри метода.

```python
TITLE_BLOCK_PROMPT_TEMPLATE = """Ты получаешь текст первой страницы счёта на оплату
(извлечённый из PDF text layer). Извлеки структурированно данные поставщика
(продавца, не покупателя — покупатель это наша компания ГК АВГУСТ, пропусти её)
и метаданные счёта.

ВНИМАНИЕ: в счёте могут быть ДВЕ организации — «Поставщик» (он же «Продавец»,
«Получатель») и «Покупатель». Бери ТОЛЬКО поставщика. Его ИНН, КПП, банковские
реквизиты. Если явно написано «Покупатель: ООО "ГРУППА КОМПАНИЙ АВГУСТ"» —
пропусти этот блок.

Верни JSON (строго):
{
  "supplier": {
    "name": "полное наименование поставщика (ООО / АО / ИП)",
    "inn": "10-12 цифр",
    "kpp": "9 цифр (может отсутствовать у ИП — тогда пусто)",
    "bank_account": "р/с 20 цифр",
    "bik": "9 цифр",
    "correspondent_account": "к/с 20 цифр",
    "bank_name": "название банка (АО «АЛЬФА-БАНК»)",
    "address": "юридический адрес",
    "phone": "телефон если виден"
  },
  "invoice_meta": {
    "number": "номер счёта (20047 / ЛП001556 — оставь как в документе)",
    "date": "ISO дата YYYY-MM-DD (из «02 марта 2026» → 2026-03-02)",
    "total_amount": число (из «Всего к оплате» / «Итого» — итоговая сумма),
    "vat_amount": число (из «в т.ч. НДС» — если указано),
    "vat_rate": число (ставка % — 22 / 20 / 10 / 0, из текста «НДС(22%)» или контекста),
    "currency": "RUB" (default) / "USD" / "EUR",
    "contract_ref": "номер + дата договора («12/20-315 от 22.12.2020») если указан, иначе \"\"",
    "project_ref": "проектная/объектная привязка (например «Озеры 123 ДПУ» из Примечания) если указана, иначе \"\""
  }
}

Не выдумывай значения. Если поле не найдено в тексте — оставь "" или null.

ТЕКСТ СТРАНИЦЫ 1:
__PAGE_TEXT__
"""


async def extract_title_block(
    provider: BaseLLMProvider,
    page_1_text: str,
    *,
    multimodal_fallback_image_b64: str | None = None,
) -> tuple[InvoiceSupplier, InvoiceMeta]:
    """ONE text-LLM call → supplier + invoice_meta. Multimodal fallback
    if supplier.inn / invoice_meta.total пусты (low confidence).
    """
    prompt = TITLE_BLOCK_PROMPT_TEMPLATE.replace("__PAGE_TEXT__", page_1_text)
    completion = await provider.text_complete(prompt, temperature=0.0)
    data = json.loads(_strip_markdown_fence(completion.content))
    
    supplier = InvoiceSupplier(**(data.get("supplier") or {}))
    meta = InvoiceMeta(**(data.get("invoice_meta") or {}))
    
    # Multimodal fallback если критичные поля пусты.
    if (not supplier.inn or meta.total_amount == 0.0) and multimodal_fallback_image_b64:
        logger.info("title_block confidence low → multimodal retry")
        mm_completion = await provider.multimodal_complete(
            prompt, image_b64=multimodal_fallback_image_b64, temperature=0.0
        )
        mm_data = json.loads(_strip_markdown_fence(mm_completion.content))
        mm_supplier = InvoiceSupplier(**(mm_data.get("supplier") or {}))
        mm_meta = InvoiceMeta(**(mm_data.get("invoice_meta") or {}))
        # Выбираем что полнее — поле по полю.
        for fld in ["name", "inn", "kpp", "bank_account", "bik", "correspondent_account"]:
            if not getattr(supplier, fld) and getattr(mm_supplier, fld):
                setattr(supplier, fld, getattr(mm_supplier, fld))
        # Аналогично для meta.
        ...
    
    return supplier, meta
```

### 3. extract_invoice_rows в pdf_text.py

**Файл:** `recognition/app/services/pdf_text.py`.

Добавить invoice-specific header patterns **отдельным словарём**:

```python
_INVOICE_HEADER_MARKER_PATTERNS = {
    "pos": [r"^№$", r"^#$"],
    "name": [r"наименование", r"товар", r"товар\s*/\s*услуг", r"работ", r"услуг"],
    "unit": [r"^ед\.?$", r"ед\.?\s*изм"],
    "qty": [r"кол-?во", r"количество"],
    "price_unit": [r"^цена(?:,?\s*руб)?$"],
    "price_total": [r"^сумма(?:,?\s*руб)?$"],
    "vat_amount": [r"в\s*т\.?ч\.?\s*ндс", r"в\s*том\s*числе\s*ндс"],
    "lead_time": [r"^срок$", r"срок\s*постав"],
    "notes": [r"^примечание$", r"^комментарий$"],
    "supply_type": [r"^зт\*?$"],
}


def extract_invoice_rows(page: fitz.Page) -> list[TableRow]:
    """Аналогично extract_structured_rows, но с invoice-specific column patterns.
    
    Переиспользует _merge_multi_row_header, x-gap span-join, _is_stamp_cell.
    """
    ...
```

**Переиспользовать** общие утилиты из `extract_structured_rows`:
- `_merge_multi_row_header`
- Y-bucketing
- x-gap span join
- `_is_stamp_cell`

**Refactor предложение (если не ломает spec):** generalize `extract_structured_rows(page, marker_patterns)` → параметризуется. Spec и Invoice — два consumer'а. Но **dual-regression обязательна** — если spec recall падает даже на 1 item, rollback.

**Альтернатива (безопаснее):** полностью отдельный `extract_invoice_rows` с дублированием ~30% кода. Автор решает.

### 4. Разделение «27 шт.» на quantity + unit

**Файл:** `recognition/app/services/pdf_text.py` или в нормализаторе.

Добавить утилиту:

```python
_QTY_UNIT_COMBINED_RE = re.compile(
    r"^(?P<qty>\d+(?:[.,]\d+)?)\s*(?P<unit>[а-яА-Яa-zA-Z]+\.?)\s*$"
)


def split_qty_unit(value: str) -> tuple[str, str]:
    """«27 шт.» → ("27", "шт."). Если не split'ится — вся строка как qty, unit="".
    Используется когда header detection не нашёл отдельной колонки «Ед.изм.».
    """
    m = _QTY_UNIT_COMBINED_RE.match(value.strip())
    if not m:
        return value, ""
    return m.group("qty"), m.group("unit")
```

Применить в `extract_invoice_rows`: **если в bbox нет отдельной колонки `unit`** и `cells.qty` содержит «27 шт.» → split.

### 5. InvoiceParser переписать

**Файл:** `recognition/app/services/invoice_parser.py` — **полная замена**.

Старый Vision-only оставить в Vision fallback path (как в SpecParser) для случая когда text layer отсутствует.

```python
class InvoiceParser:
    async def parse(self, pdf_bytes: bytes, filename: str) -> InvoiceParseResponse:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            # Phase 0: title block
            page_1_text = doc[0].get_text() if len(doc) >= 1 else ""
            page_1_png = await run_in_threadpool(render_page_to_b64, doc, 0)
            supplier, meta = await extract_title_block(
                self.provider, page_1_text, 
                multimodal_fallback_image_b64=page_1_png,
            )
            
            # Phase 1-2: items через column-aware + multimodal retry
            items = await self._extract_items_column_aware(doc)
            
            # Fallback: Vision-only для страниц без text layer
            if not items and any(not has_usable_text_layer(p) for p in doc):
                items = await self._extract_items_vision_fallback(doc)
        finally:
            doc.close()
        
        return InvoiceParseResponse(
            status=...,
            items=items,
            supplier=supplier,
            invoice_meta=meta,
            ...
        )
```

`_extract_items_column_aware` — mirror `SpecParser._process_batch_column_aware`:
- extract_invoice_rows per page
- normalize_invoice_items_via_llm parallel batch
- compute_invoice_confidence
- multimodal retry conditional
- broker selection

### 6. normalize_invoice_items_via_llm

**Файл:** `recognition/app/services/invoice_normalizer.py` (новый).

Промпт аналогичен SpecNormalizer правилам 0-11, но с **invoice-специфичными полями**:

```python
NORMALIZE_INVOICE_PROMPT_TEMPLATE = """Ты обрабатываешь страницу счёта на оплату от поставщика.
extract_invoice_rows уже разложил таблицу items по bbox. Каждая row — dict с:
pos, name, unit, qty, price_unit, price_total, vat_amount, lead_time, notes, supply_type.

Задача: верни финальный JSON items страницы.

ПРАВИЛА:

0. КРИТИЧЕСКОЕ — маппинг cells → output 1:1. Не переставляй колонки.
   cells.name → items[].name
   cells.unit → items[].unit
   cells.qty → items[].quantity
   cells.price_unit → items[].price_unit
   cells.price_total → items[].price_total
   cells.vat_amount → items[].vat_amount
   cells.lead_time → items[].lead_time_days (после парсинга: «7 р.д.» → 7)
   cells.notes → items[].notes
   cells.supply_type → items[].supply_type

1. Ед. изм. внутри qty. Если cells.unit пустая, а cells.qty содержит «27 шт.» /
   «10 упак» — разделяй: quantity=27, unit="шт." Если qty = «7 р.д.» — это
   lead_time, не quantity; quantity пропусти (возьмётся из sticky или default=1),
   lead_time_days=7.

2. Multi-line name. Правило как в SpecParser: orphan-name row (только cells.name
   непустая) → continuation предыдущего item через пробел. Никогда не создавай
   отдельный item.

3. ЗТ* / supply_type: "Х" = заказной, пусто = в наличии. Класть в supply_type.

4. Lead_time parse: «7 р.д.» → 7; «30 дней» → 30; «2 нед.» → 14; «в наличии» → 0.
   Если не parse'ится — None.

5. price_unit / price_total — float; «6 687,50» → 6687.50; убирай пробелы и
   замени запятую на точку.

6. vat_amount per-item (инвойс-01) — абсолютное значение НДС. Если отсутствует
   (инвойс-02) — 0.0.

7. Фильтр. Не items: итоговые row «Итого, руб:», «в т.ч. НДС, руб:», «Всего к
   оплате», «Всего наименований N, на сумму M руб.», «Прописью: ...».

8. Не выдумывай позиции.

ВЫХОДНОЙ JSON (строго):
{"items": [{"name", "model_name", "brand", "unit", "quantity", "price_unit",
            "price_total", "vat_amount", "lead_time_days", "notes",
            "supply_type"}, ...]}

rows: __ROWS_JSON__
"""
```

### 7. compute_invoice_confidence

**Файл:** `recognition/app/services/invoice_normalizer.py`.

Метрики качества отличаются от spec (нет section, есть prices):

```python
def compute_invoice_confidence(norm: NormalizedInvoicePage, rows: list[TableRow]) -> float:
    if not norm.items:
        return 0.0
    
    # 1. Доля items с price_unit > 0.
    price_unit_ratio = sum(1 for it in norm.items if it.price_unit > 0) / len(norm.items)
    
    # 2. Доля items с price_total > 0 (обязательно для счёта).
    price_total_ratio = sum(1 for it in norm.items if it.price_total > 0) / len(norm.items)
    
    # 3. Доля items с quantity > 0.
    qty_ratio = sum(1 for it in norm.items if it.quantity > 0) / len(norm.items)
    
    # 4. items.count ≈ rows.count.
    row_count_ratio = len(norm.items) / max(len(rows), 1)
    count_score = 1.0 if 0.4 <= row_count_ratio <= 1.0 else 0.5
    
    return (price_unit_ratio * 0.30 +
            price_total_ratio * 0.30 +
            qty_ratio * 0.20 +
            count_score * 0.20)
```

### 8. Multimodal retry (переиспользует SpecParser инфраструктуру)

Используем **существующий** `provider.multimodal_complete` (добавлен в E15.05 it2). Промпт `NORMALIZE_INVOICE_PROMPT_TEMPLATE` + префикс:

```
У тебя есть JSON rows И PNG страницы. Текст бери из JSON (точный text layer),
картинку используй только для visual structure (column boundaries при путанице).
Никогда не бери цифры/слова из картинки — только из JSON.
```

### 9. Tests

**`recognition/tests/test_invoice_parser.py`** — unit-тесты на:
- `split_qty_unit("27 шт.")` → `("27", "шт.")`
- `extract_invoice_rows` на mock fixture.
- `normalize_invoice_items_via_llm` с mock provider — проверка column shift защиты, multi-line, lead_time parse.
- `compute_invoice_confidence` — 4 тест-кейса (all prices / no prices / mixed / empty).

**`recognition/tests/golden/test_invoice_01.py`** — ГалВент:
```python
assert len(result.items) == 4
assert result.supplier.name == 'ООО "Фабрика Вентиляции ГалВент"'  # или contains
assert result.supplier.inn == "7720605108"
assert result.supplier.kpp == "500101001"
assert result.supplier.bank_account == "40702810701300018012"
assert result.supplier.bik == "044525593"
assert result.supplier.correspondent_account == "30101810200000000593"
assert result.invoice_meta.number == "20047"
assert result.invoice_meta.date == "2026-03-02"
assert result.invoice_meta.total_amount == 16466.25
assert result.invoice_meta.vat_amount == 2969.33
assert result.invoice_meta.vat_rate == 22
assert "12/20-315" in result.invoice_meta.contract_ref
assert "Озеры 123 ДПУ" in result.invoice_meta.project_ref

# Items: Воздуховоды
for item in result.items:
    assert "Воздуховод" in item.name
    assert item.unit == "упак"
    assert item.price_unit > 0
    assert item.price_total > 0
    assert item.vat_amount > 0  # инвойс-01 имеет per-item НДС
assert result.items[0].quantity == 10.0  # первый: 10 упак
assert abs(result.items[0].price_total - 6687.50) < 0.01
```

**`recognition/tests/golden/test_invoice_02.py`** — ЛУИС+:
```python
assert len(result.items) == 15
assert "ЛУИС" in result.supplier.name
assert result.supplier.inn == "5040070405"
assert result.supplier.kpp == "772201001"
assert result.invoice_meta.number == "ЛП001556"
assert result.invoice_meta.date == "2026-03-06"
assert abs(result.invoice_meta.total_amount - 1714790.31) < 1.0
# Lead time для items 4, 7 (ПО модуль) = 7 р.д.
items_with_lead = [it for it in result.items if it.lead_time_days == 7]
assert len(items_with_lead) >= 2
# Unit из «27 шт.» разделён
item_ctrl = next(it for it in result.items if "Контроллер доступа ЛКД-КС-8000" in it.name)
assert item_ctrl.quantity == 27.0
assert item_ctrl.unit == "шт."
```

Маркер `@pytest.mark.golden_llm` + `skipif(not OPENAI_API_KEY)`.

### 10. Dual-regression на Spec goldens

**НЕ ЛОМАТЬ:**
- `pytest -m golden_llm` spec-ov2: items ≥ 140.
- spec-aov: 29/29.
- spec-tabs: ≥ 120 items, ≥ 4 sections, model% ≥ 80.

Запустить все golden_llm ПОСЛЕ всех изменений, убедиться что зелёные.

### 11. ISMeta integration

`ismeta/backend/apps/payments/services/recognition_client.py` — **проверить** что клиент принимает новые поля schema (`vat_rate`, `contract_ref`, `project_ref`, `lead_time_days`, `notes`, `supply_type`). Если payments-apply code parsed response использует только базовые поля — они продолжат работать (opt-out fields). Не трогать логику payments — только schema forward-compatibility.

**Test** в ISMeta backend: mock response с новыми полями → payments serialize работает. (Опционально — если есть тестовая обвязка.)

### 12. Docs

- **`recognition/README.md`** — секция Pipeline: добавить invoice-pipeline описание.
- **ADR-0026:** `ismeta/docs/adr/0026-invoice-hybrid-parser.md` — решение, золотые fixtures, метрики, Phase 0 title block rationale.
- **`ismeta/docs/DEV-BACKLOG.md`** — закрыть #18 полностью (multi-document hybrid).

### 13. Shared файл

`docker-compose.yml` — никаких новых env vars (переиспользуем `LLM_EXTRACT_MODEL`, `LLM_MULTIMODAL_MODEL`, `LLM_MULTIMODAL_RETRY_ENABLED`, `LLM_MULTIMODAL_RETRY_THRESHOLD` из E15.05 it2). Если **понадобится** Invoice-specific threshold — добавить с envsubst default + пинг AC Rating.

---

## Приёмочные критерии

### Функциональные

1. ✅ **invoice-01**: 4 items, supplier + meta все поля корректны (см. тест выше).
2. ✅ **invoice-02**: 15 items, 2 items с lead_time_days=7, все quantity разделены из «N шт.», supplier.inn корректен.
3. ✅ items[].price_unit / price_total / quantity — точность ±0.01 на golden.
4. ✅ НДС: vat_amount absolute correct, vat_rate=22 для обоих.

### Multimodal

5. ✅ Title block confidence: если supplier.inn или total=0 → multimodal retry на page 1. 
6. ✅ Items multimodal retry: confidence < 0.7 → triggers retry.

### Нефункциональные

7. ✅ pytest recognition: все зелёные (+unit-тесты invoice_parser).
8. ✅ `pytest -m golden_llm`: **5 тестов** passed (3 spec + 2 invoice).
9. ✅ Spec dual-regression: spec-ov2 ≥140, spec-aov 29, spec-tabs ≥120. **БЕЗ регрессий**.
10. ✅ ruff + mypy clean.
11. ✅ Время на invoice-02 (15 items, 2 стр): ≤ 60 с.

### Документация

12. ✅ ADR-0026 написан.
13. ✅ README pipeline обновлён для invoice.
14. ✅ openapi.yaml новые поля InvoiceItem / InvoiceSupplier / InvoiceMeta.

---

## Ограничения

- **НЕ ломать** SpecParser и его 3 golden (dual-regression строго!).
- **НЕ трогать** QuoteParser — это E16 **it2** (после мержа it1).
- **НЕ трогать** модели ERP payments — только Recognition schema расширяется.
- **НЕ трогать** shared файлы без пинга (docker-compose.yml — если не строго нужно).
- Generalize `extract_structured_rows` → `extract_rows(page, patterns)` — **ТОЛЬКО** если dual-regression проходит 100%. Иначе — дублируем `extract_invoice_rows` отдельной функцией.

---

## Формат отчёта

1. Ветка и hash.
2. Архитектура: какие утилиты переиспользованы, что продублировано.
3. Phase 0 title block — пример JSON для обоих invoice'ов.
4. Метрики на 3 spec + 2 invoice goldens (items count, supplier correctness, time, cost).
5. Confidence scores по страницам (таблица).
6. Сколько страниц потребовали multimodal retry на каждом golden.
7. Acceptance 14 критериев — ✅/❌.
8. ADR-0026 ссылка.
9. Известные ограничения → E16 it2 (Quote).
