# ADR-0026: Invoice hybrid parser — Phase 0 title block + bbox + multimodal retry

**Дата:** 2026-04-22
**Статус:** Принято
**Контекст:** E16 it1 (ветка `recognition/09-e16-it1-invoice-hybrid`)

## Проблема

До E16 распознавание счетов поставщиков (`/v1/parse/invoice`) было
полностью Vision-only: `CLASSIFY_PROMPT` + `EXTRACT_ITEMS_PROMPT` +
`EXTRACT_HEADER_PROMPT` на PNG каждой страницы с gpt-4o-mini. QA-прогон
PO показал recall < 50% на реальных счетах от поставщиков
(ГалВент, ЛУИС+ и др.) — Vision модель часто теряет строки, путает
колонки «Цена» / «Сумма» / «в т.ч. НДС», пропускает банковские
реквизиты в бухгалтерском блоке формата invoice-01.

Требование PO: **«Нам нужно практически 100% качество распознавания для
любых документов — не только Спецификаций. Модуль использовать также
для Счетов и КП от Поставщиков.»**

SpecParser (E15.04 + E15.05 it2) уже доказал, что гибридный подход
bbox + text-LLM + conditional multimodal retry даёт recall 93-100% на
3 golden spec-фикстурах. Задача E16 it1 — перенести ту же архитектуру
на invoice parser.

Дополнительное препятствие счетов vs спецификаций: реквизиты
поставщика и метаданные счёта (номер, дата, договор, итог, НДС) живут
**не в таблице**, а в шапке (бухгалтерский блок invoice-01) или в
списковом формате (invoice-02 ЛУИС+). Bbox-парсер для шапки
ненадёжен: слишком разные вёрстки между поставщиками.

## Решение

**5-фазный pipeline:**

### Phase 0 — Title block (новое по сравнению со SpecParser)

`invoice_title_block.extract_title_block`:

- Собирает text layer ВСЕХ страниц (до ~50k символов) и склеивает с
  разделителями `--- page N ---`. Это нужно, чтобы финальные значения
  («Итого, руб:», «в т.ч. НДС, руб:») с последней страницы таблицы
  (invoice-02) тоже попали в LLM-контекст.
- ОДИН text-only LLM call (gpt-4o full, temperature=0, response_format
  JSON) с промптом `TITLE_BLOCK_PROMPT_TEMPLATE`. Промпт требует
  явно игнорировать блок «Покупатель:» с ИНН 5032322673 (наша компания).
- Возвращает `InvoiceSupplier` + `InvoiceMeta` (все поля схемы E16).
- **Multimodal retry**: если `supplier.inn` пустой ИЛИ
  `total_amount == 0` — повторный вызов `multimodal_complete` с
  PNG первой страницы и тем же промптом (плюс префикс-инструкция
  «текст из JSON, картинку только для визуальной structure»).
- **Guard против buyer-leak**: если supplier.inn = 5032322673, чистим
  supplier полностью (LLM всё-таки перепутал).
- Field-wise merge primary+fallback: непустые поля primary имеют
  приоритет, чтобы multimodal не затер правильное text-only значение.

### Phase 1 — bbox extraction (reuse SpecParser утилит)

`pdf_text.extract_invoice_rows`:

- Алгоритм идентичен `extract_structured_rows` (E15.04): derotate spans
  → y-bucket → x-column detection → cell merge с x-gap awareness.
- Отличия:
  - `_INVOICE_HEADER_MARKER_PATTERNS` — invoice-специфичные колонки
    (pos / name / supply_type / lead_time / unit / qty / price_unit /
    vat_amount / price_total / notes).
  - `_detect_invoice_header` — заменяет `_merge_multi_row_header` для
    счетов. Ищет ПЕРВЫЙ y-bucket с ≥3 different column markers (шапка
    счёта плотная: всегда 5-8 маркеров в одной строке). Look-back /
    look-ahead до ±3 bucket'ов ограничены y-gap 11pt — защита от
    параграфов текста над таблицей («! Срок действия счета !»).
  - Фoller filter `_INVOICE_FOOTER_RE` дропает rows с «Итого:», «в т.ч.
    НДС:», «Всего к оплате:», «прописью» — чтобы не тратить LLM
    токены на footer.
  - Post-process cells: split «27 шт.» → qty+unit (ЛУИС+ случай где
    unit сидит внутри qty-колонки); split «813 591,00 в наличии» →
    price_total+notes (PyMuPDF склеил оба значения в один span);
    перенос «7 р.д.» из qty-колонки в lead_time если qty не парсится
    как число.
- Если детектировано < 4 колонок → возвращаем `[]` (multimodal/vision
  fallback отработает на картинке).
- Утилиты `split_qty_unit`, `parse_lead_time_days`,
  `_split_number_with_tail` — чистые функции с unit-тестами.

### Phase 2a — text normalize

`invoice_normalizer.normalize_invoice_items_via_llm`:

- Параллельный запуск для всех страниц с непустыми rows через
  `asyncio.gather`.
- Промпт `NORMALIZE_INVOICE_PROMPT_TEMPLATE` (10 правил):
  - Правило 0 — критическое маппинг cells → output 1:1 (не
    переставлять колонки).
  - Правило 1 — split qty+unit в нормализаторе как страховка
    extractor'а.
  - Правило 2 — multi-line name склейка (orphan-name continuation).
  - Правило 3 — удаление pos-префикса из cells.name.
  - Правило 4 — lead_time_days парсинг «7 р.д.» → 7 (усиленная
    формулировка после QA-регрессии на invoice-02: LLM ленится).
  - Правила 5-6 — float parsing цен и qty.
  - Правило 7 — vat_amount per-item (invoice-01) или 0.0 (УСН).
  - Правило 8 — supply_type «X» = заказной.
  - Правило 9 — footer filter (страховка).
  - Правило 10 — не выдумывать items.
- Возвращает `NormalizedInvoicePage` с `items: list[NormalizedInvoiceItem]`
  + warnings + token-метрики.

### Phase 2b — conditional multimodal retry

`compute_invoice_confidence`:

```
price_unit_ratio * 0.30 + price_total_ratio * 0.30
  + qty_ratio * 0.20 + count_score * 0.20
```

Threshold `settings.llm_multimodal_retry_threshold` (по умолчанию 0.7,
разделяется со SpecParser). Retry через `multimodal_complete` с PNG +
JSON rows. Broker-selection: P2 принимаем только если
`confidence(P2) > confidence(P1)`.

### Vision fallback (legacy path)

Для страниц без text layer (scan) — старые `CLASSIFY_PROMPT` +
`EXTRACT_ITEMS_PROMPT` + `EXTRACT_HEADER_PROMPT` на PNG. Используется
также как safety-net когда провайдер не реализует `text_complete`
(тестовые stubs).

## Schema расширение (backward-compat)

- `InvoiceItem` +`vat_amount`, `lead_time_days`, `notes`, `supply_type`,
  `tech_specs`.
- `InvoiceSupplier` (=алиас `SupplierInfo`) +`address`, `bank_name`,
  `phone`.
- `InvoiceMeta` +`vat_rate`, `contract_ref`, `project_ref`.

Все новые поля имеют default (`""`, `0.0`, `None`) — старые клиенты
(`backend/payments/services/recognition_client.py`,
`ismeta/backend/apps/integration/recognition_client.py`) читают
response через `.get()` и не ломаются.

## Golden fixtures

`ismeta/tests/fixtures/golden/`:

- **invoice-01.pdf** (ГалВент, 4 items, 16 466,25 ₽) — бухгалтерский
  блок банка сверху, per-item «в т.ч. НДС», проектная привязка «Озеры
  123 ДПУ» в примечании.
- **invoice-02.pdf** (ЛУИС+, 15 items, 1 714 790,31 ₽) — списковый
  формат шапки, «ЗТ*» колонка, «Срок» колонка с «7 р.д.» для 2 items,
  ед.изм. ВНУТРИ qty-колонки («27 шт.»), итог и НДС на странице 2.

## Dual-regression на spec goldens

Требование ТЗ: **НЕ ломать** SpecParser на 3 существующих фикстурах
(spec-ov2 ≥140, spec-aov 29, spec-tabs ≥120 items). Поэтому:

- `_merge_multi_row_header` и `_match_column_from_merged_text` получили
  **опциональный** параметр `patterns` (default — существующие
  `_HEADER_MARKER_PATTERNS` для ЕСКД). SpecParser вызывает без
  параметра → поведение идентично.
- `_detect_invoice_header` — отдельная функция, spec parser её не
  использует.
- Общие утилиты (`_collect_spans`, `_bucket_by_y`, `_assign_column`,
  `_join_column_spans_with_gap`, `is_stamp_text`, `is_stamp_cell`,
  `_is_title_block_bucket`) переиспользуются без изменений.

Верификация на unit-уровне (158+31 test): все зелёные. Dual-regression
на golden_llm — см. отчёт в ответе к задаче.

## Результаты

**invoice-01 (golden_llm):** 4 items, все supplier поля корректны,
contract_ref и project_ref заполнены, per-item vat_amount парсится,
время ≤ 30s. Multimodal retry не потребовался (confidence 1.0).

**invoice-02 (golden_llm):** 15 items, 2 с lead_time_days=7, «27 шт.»
корректно разделено на qty+unit, supplier ЛУИС+ с полным address /
bank_name / phone, contract_ref = «ЛП2024/0416-2 от 16.04.2024».
vat_amount и vat_rate с page 2 подхватываются после fix — передаём
текст ВСЕХ страниц в Phase 0. Время ≤ 50s.

## Альтернативы, которые отвергнуты

1. **Generalize `extract_structured_rows(page, patterns)` → один
   парсер на spec + invoice.** Сделал бы код на ~30% короче, но
   рисков регрессии на spec-goldens слишком много (invoice header
   detection требует другой логики look-back/y-tolerance). Принято:
   дублируем `extract_invoice_rows` отдельно, общие утилиты
   переиспользуются.

2. **Один большой Vision call на документ.** Отвергнуто: та же
   проблема что и текущий invoice_parser.py — recall <50% и стоимость
   >$0.05/doc. Гибрид даёт >95% recall при $0.01-0.02/doc.

3. **Phase 0 только на page 1.** Отвергнуто после QA на invoice-02:
   vat_amount/vat_rate сидят на page 2 после items-таблицы. Передаём
   text всех страниц до 50k символов — токены недорогие.

## Следующие шаги

- **E16 it2 (QuoteParser)** — перенести ту же архитектуру на парсер КП
  от поставщиков. QuoteParser сейчас наследует от InvoiceParser
  какую-то часть логики; потребует отдельного ТЗ.
- **Payments integration** — `recognition_client.py` (backend +
  ismeta) читает новые поля через `.get()` и может их мапить в
  `backend/payments/models.py` после согласования схемы БД.
