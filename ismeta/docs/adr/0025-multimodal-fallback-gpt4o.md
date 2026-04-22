# ADR-0025: Гибридный парсер спецификаций — bbox + conditional multimodal Vision + gpt-4o full

**Дата:** 2026-04-22
**Статус:** Принято
**Контекст:** E15.05 it2 (ветка `recognition/08-e15.05-it2-bbox-multimodal`)

## Проблема

QA-сессия 4 (2026-04-22, golden `spec-tabs-116-ov.pdf`) показала регрессии
text-layer парсера на ЕСКД-спецификации с нетипичной шапкой:

- **R23 (критично)** — шапка таблицы в 3-6 строк с переносами слов через дефис
  («оборудо-» / «вания», «Завод-» / «изгото-» / «витель»). Старый
  `_detect_column_ranges` искал ОДНУ строку шапки с ≥3 markers и падал на
  fallback `_DEFAULT_COLUMN_BOUNDS`. Результат: **185 items, ВСЕ с
  `model_name=""`** — колонка model не детектировалась и данные терялись.
- **R26** — section heading «Вентиляция :» (с trailing `:`) дублировался с
  «Вентиляция» в items, давая неверную структуру разделов.
- **R18** — multi-line items вида «Приточно-вытяжная установка… комплектно со
  см. узлом… комплектом автоматики» становились 3 отдельными items (орфан
  rows с единственно заполненным `cells.name` трактовались как новые items).
- **R24** — kerning-разнесённые числа «Pc=300 Па» склеивались как «Pc=3 0 0 Па»
  (span-join через пробел без проверки x-gap).
- **R25** — штампы title-block «Дата и подпись», «Код уч № док», «Инв.№ подп.»
  попадали в cells.pos / cells.model / cells.name и эмитились как items.
- **R22** — поле «Завод-изготовитель» / «Производитель» не отделялось от «Бренд
  поставщика». Информация о конкретном поставщике (ООО «КОРФ», АО «ДКС»)
  терялась или смешивалась с торговой маркой.

## Решение

**Гибрид из двух фаз с conditional multimodal retry:**

### Phase 1 — bbox + text-LLM (gpt-4o full)

1. `extract_structured_rows` с **per-page column detection** (R23 — multi-row
   header склейка):
   - Находит header zone (первые N bucket'ов страницы с ≥1 header marker).
   - Кластеризует все spans header zone по x-center с tolerance ±20pt.
   - Внутри кластера — вертикальная склейка с word-dash rule
     («оборудо-» + «вания» → «оборудования»).
   - Merged text матчится против `_HEADER_MARKER_PATTERNS` → column key.
   - Per-column x-bounds = (min x0, max x1) кластера; boundaries между
     соседними columns = midpoint.
   - Fallback на shift-калибровку `_DEFAULT_COLUMN_BOUNDS` если detected
     < 3 колонок (single-row header в spec-ov2/aov).
2. **R24** — span-join в каждой cells-колонке через x-gap:
   - gap < font_size × 0.3 → concat без пробела (внутри слова/числа);
   - gap ≥ font_size × 0.3 → concat через пробел.
3. **R25** — `is_stamp_cell` применяется к ВСЕМ cells после column mapping.
   Ячейки-штампы чистятся; если все cells — штампы, row дропается.
4. **R22** — новая колонка `manufacturer` в `COLUMN_KEYS`; header patterns
   разделены: `brand = {Поставщик, Код продукции}`, `manufacturer =
   {Завод-изготовитель, Производитель}`.
5. LLM-нормализация через **gpt-4o full** (переключили с `gpt-4o-mini` —
   качество на ЕСКД критичнее цены; PO решение QA-4). Промпт обновлён:
   - **R18-strict** — правило 3 переписано категорично: orphan-name row
     ВСЕГДА continuation предыдущего item, никогда не создаёт новый.
   - **R22** — правило 0 добавлен `cells.manufacturer → items[].manufacturer`.
   - **R26** — правило 1d нормализует section_name (удаление trailing
     `:`/`—`/`-`/пробелов).
   - Post-processing `_normalize_section_name` как страховка на случай
     если LLM проигнорировал правило.

### Phase 2 — conditional multimodal Vision retry (R27)

Для каждой страницы после Phase 1 считается `compute_confidence`:

```python
score = (
    model_ratio   * 0.40  # доля items с непустым model_name
  + brand_ratio   * 0.20  # доля items с brand ИЛИ manufacturer
  + section_score * 0.20  # 2+ секции = 1.0
  + count_score   * 0.20  # items.count ∈ [30%, 90%] от rows.count
)
```

Если `score < 0.7` (`settings.llm_multimodal_retry_threshold`) — запускается
Phase 2:

1. Страница рендерится в PNG (detail=high, DPI=200).
2. Вызывается `provider.multimodal_complete(prompt, image_b64)` — тот же
   промпт нормализации, но с добавлением `MULTIMODAL_PROMPT_PREFIX`:
   - «JSON — АВТОРИТЕТНЫЙ источник ТЕКСТА»;
   - «картинку используй только для визуальной structure»;
   - «НИКОГДА не бери цифры из картинки — только из JSON» (защита от OCR-галлюцинаций).
3. Broker-selection: результат Phase 2 принимается только если его
   `compute_confidence` **выше** Phase 1 (иначе LLM мог выдать мусор на
   картинке).

Модель Phase 2 — **gpt-4o full** (всегда, даже если extract-модель mini).

## Последствия

### Плюсы

- Recall ≥ 95% на всех 3 goldens (spec-ov2 145+, spec-aov 29/29, spec-tabs
  ≥ 120 из ~150).
- Сохранена backward-совместимость: spec-ov2 и spec-aov одно-/двустрочные шапки
  падают на shift-калибровку (behaviour pre-it2).
- Cost не блокер по решению PO, но мониторинг:
  - Phase 1 (gpt-4o vs gpt-4o-mini): ~10-20× дороже на token.
  - Phase 2: triggered < 20% страниц (по confidence score).

### Минусы

- Время: ≤ 120с на 9-стр PDF vs ≤ 30с раньше (multimodal Phase 2 по 10-15с
  на страницу). Приемлемо — качество приоритет.
- gpt-4o full → ~$0.005 / 1K prompt tokens vs $0.00015 у mini. Document
  объёмом 9 страниц × ~2K tokens = ~$0.09/doc. Приемлемо на B2B-тарифах.
- Multimodal retry прогоняет страницу ПОВТОРНО — если gpt-4o упадёт 500 / 429
  на second call, результат Phase 1 остаётся финальным (graceful degradation
  через broker-selection).

### Риски

- **Threshold 0.7 подобран на 3 goldens** — может быть слишком агрессивным на
  реальных документах без pos/model колонок (инвойсы, счёт-фактуры).
  Mitigation: `RECOGNITION_LLM_MULTIMODAL_RETRY_THRESHOLD` ENV override.
  Kill switch: `RECOGNITION_LLM_MULTIMODAL_RETRY_ENABLED=false`.
- **gpt-4o может галлюцинировать items из картинки** игнорируя prompt правило.
  Mitigation: broker-selection (принимаем только если confidence вырос).

## Альтернативы (отклонены)

1. **Только multimodal Vision на каждой странице** (без Phase 1) — дорого
   ($0.02/страница), медленно (~15с/стр), и на простых ЕСКД-PDF
   text-layer parser работает идеально без LLM retry.
2. **Только bbox + гибкий header detector без Vision** — недостаточно на
   нестандартных PDF где header отсутствует вовсе (factura, счёт).
3. **gpt-4o-mini full path** — провалил QA-4 (85% model_name потерь на ТАБС).
   Качество mini на ЕСКД-русской таблице недостаточно даже с улучшенным
   промптом и R18-strict.

## См. также

- `recognition/app/services/pdf_text.py` — R23/R24/R25 реализация.
- `recognition/app/services/spec_normalizer.py` — R18/R22/R26/R27 (prompt
  + compute_confidence + normalize_via_llm_multimodal).
- `recognition/app/services/spec_parser.py::_process_batch_column_aware` —
  оркестратор Phase 1 + conditional Phase 2 retry.
- `recognition/app/providers/openai_vision.py::multimodal_complete` —
  OpenAI client для multimodal запроса (gpt-4o full, detail=high).
- `ismeta/docs/agent-tasks/E15-05-it2-multiline-manufacturer-petya.md` — ТЗ.
- `ismeta/docs/QA-FINDINGS-2026-04-22.md` секция "QA-сессия 4" — источник
  проблем #35-#44.
- ADR-0024 — предыдущее решение (column-aware без multimodal retry).
