# ADR 0024 — Column-aware parser + LLM normalization (Recognition E15.04)

**Статус:** accepted
**Дата:** 2026-04-21
**Контекст:** QA-сессия 2 на golden `spec-ov2-152items.pdf` (см.
`ismeta/docs/QA-FINDINGS-2026-04-21.md` #4–#25) выявила 22 активных бага
парсера спецификации — 8 из них упираются в корневую проблему **R1**: line-based
text-layer reader не отличает перенос внутри ячейки от перехода в соседнюю
строку таблицы. Цель E15.04 — recall ≥95% на реальных ЕСКД ОВиК PDF (форма 1а
ГОСТ 21.110).

## Решение

3-уровневый pipeline в `recognition/app/services/spec_parser.py`:

1. **Column-aware text-layer extraction** — `extract_structured_rows(page)` в
   `pdf_text.py`:
   - `page.rotation_matrix` → derotation в landscape display-space.
   - `page.get_text("dict")` → span'ы с bbox + font size + flags.
   - Y-bucketing (±5.5pt tolerance) → визуальные строки таблицы.
   - Column mapping по `_DEFAULT_COLUMN_BOUNDS` (форма 1а) + shift-калибровка
     по обнаруженным header-маркерам (exact-match set).
   - Фильтр: exact stamp keywords + title-block zone (правый-нижний угол).
   - Multi-line section heading склейка.
   - Результат: `list[TableRow]` с полями cells (pos/name/model/brand/unit/qty/
     mass/comments), raw_blocks, is_section_heading.

2. **LLM normalization** — `normalize_via_llm` в `spec_normalizer.py`:
   - Один `gpt-4o-mini` call на страницу (temperature=0, response_format=json_object).
   - Промпт-правила: склейка multi-line name, sticky parent, артикульные
     варианты, префикс-колонка ПВ-ИТП, фильтр шапки/штампа/сносок.
   - Возвращает `NormalizedPage(items, new_section, new_sticky, tokens,
     warnings)`.
   - Защита от галлюцинаций: warning при `items_count > rows_count * 2`.
   - 2-фазный batch (sync extract + asyncio.gather LLM calls) — на 9-стр PDF
     177s → 27s.
   - Best-effort carry-over sticky/section: берём последние ненулевые name /
     section_heading из rows предыдущих страниц до LLM call'а.

3. **Fallback** — если `provider.text_complete` raises `NotImplementedError`
   (тестовые Noop/Inert провайдеры) или LLM вернул битый JSON — легаси
   line-based `parse_page_items` (pre-E15.04 эвристика unit-anchor). Если и там
   пусто — Vision на page image (скан).

## Альтернативы

**Вариант A** — pure text-layer + расширенные эвристики (bbox-aware regex,
column snap, sticky). Отклонено: упирается в потолок recall ≈85% на реальных
ЕСКД-таблицах с многострочными ячейками, артикулами, префикс-колонками.
Слишком много edge cases под ручную эвристику.

**Вариант C** — pure Vision (gpt-4o-mini на page image). Отклонено:
~5с/страница × 9 страниц = 45с, recall на живом ОВ2 PDF всего ~4% без
специального prompt'а и даже с ним нестабилен (LLM путается в многостраничных
таблицах ЕСКД). Плюс стоимость × 6–10 vs text-only.

**Вариант B (выбран)** — text-layer даёт структуру (rows + columns + bbox),
LLM делает только NLP-задачи (склейка имён, sticky, секции, фильтр штампа).
LLM работает по тексту, не картинке → быстрее и дешевле. Recall 93–94% на
golden сейчас, целевая планка 95% достижима prompt-тюнингом.

## Последствия

**Плюсы:**
- Pipeline перестаёт быть эвристикой — LLM берёт на себя ambiguous cases.
- Новое поле `SpecItem.comments` поддерживает колонку «Примечание» из ЕСКД
  (ранее терялась). UI-04 уже читает `tech_specs.comments`.
- Параллельные LLM calls укладываются в бюджет ≤30с на 9-стр A3 на gpt-4o-mini.
  (С переходом на gpt-5.2 в ADR-0025 бюджет вырос до ~75с; приемлемо.)
- Стоимость исходно ~$0.01/документ (gpt-4o-mini, 28K in / 11K out). После
  gpt-5.2 + caching — ~$0.28/документ (см. TD-04 refresh ниже).

**Минусы / tech debt:**
- **Recall 93–94%**, не 95%. LLM иногда пропускает 2–3 variant-строки на
  странице. Решается в E15.05 prompt-тюнингом + few-shot примерами.
- **LLM-variance на temperature=0** — ±1–3 items между прогонами.
  В golden_llm CI порог снижен до 135, чтобы тест не флакал.
- **Зависимость от OPENAI_API_KEY** в recognition (новый env var контракт
  для deploy; fallback сохраняет старое поведение).
- Колонка `pos` в ЕСКД содержит индекс системы (ВД1, ПВ-ИТП), а не позицию
  в спецификации. Склейка с name через `-` — решение PO, может меняться.

**Контракт:**
- API `/v1/parse/spec` обратно совместимый: новое поле `comments` в `SpecItem`
  с default `""`, старые клиенты не ломаются.
- Settings `llm_normalize_enabled: bool = True` — kill switch для rollback без
  деплоя кода (выставить False в .env → вернуться на legacy text-layer путь).

## Живые метрики (golden-прогон `spec-ov2-152items.pdf`, 9 стр A3)

> Блок обновлён в TD-04 (2026-04-24) после switch `gpt-4o-mini → gpt-5.2` и
> включения prompt caching. Архитектурные решения выше не меняются — только
> cost/recall/tokens.

- items: **153/152** (101% — dedup отключён, одинаковые из разных секций
  отдельно; исторически 143 с gpt-4o-mini).
- recall: 3/3 curl-прогона стабильно 153; `LLM_MIN_ITEMS` поднят 140→142
  (TD-04 #2).
- время: ~75с на 9-стр A3 (gpt-5.2 медленнее mini, приемлемо).
- LLM Phase 1 (9 calls): prompt_tokens ≈ 65 113, completion_tokens ≈ 17 007,
  cached_tokens ≈ 59 008 (cache-hit ~90.6% после прогрева; non-cached input
  ≈ 6 105).
- LLM Phase 2 multimodal (1–2 retries / 9 pages): prompt ≈ 12 288,
  completion ≈ 941, cached ≈ 9 216.
- **Cost (gpt-5.2 @ 2026-04-24: $1.75/1M in, $0.175/1M cached, $14/1M out):**
  - Phase 1: 6 105×$1.75 + 59 008×$0.175 + 17 007×$14 = $0.011 + $0.010 + $0.238 = **$0.259**.
  - Phase 2: ≈ **$0.020**.
  - Итого: **≈ $0.28 / документ** (~25× от старой оценки gpt-4o-mini $0.011).
- sections: 7–8 корректных (Жилая часть, МОП+Коммерческие, Противодымная,
  Клапаны 1эт, Клапаны кровля, Воздуховоды приточной, Воздуховоды вытяжной,
  + Огнезащитные).
- specific: Дефлектор Цаги = 2, Выбросной колпак variants = 6, Kleber в 2+
  секциях, 31 item с comments «+10%».

## Связанные артефакты

- `ismeta/docs/QA-FINDINGS-2026-04-21.md` — исходные 22 бага.
- `ismeta/docs/agent-tasks/E15-04-column-aware-llm-normalization-petya.md` — ТЗ.
- `recognition/app/services/pdf_text.py::extract_structured_rows` — извлечение.
- `recognition/app/services/spec_normalizer.py` — NORMALIZE_PROMPT + нормализатор.
- `recognition/app/services/spec_parser.py::_process_batch_column_aware` — wire-up.
