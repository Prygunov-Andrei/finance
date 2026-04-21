# ТЗ: E15.04 — Column-aware parser + LLM normalization (IS-Петя)

**Команда:** IS-Петя.
**Ветка:** `recognition/06-column-aware-llm-normalization`.
**Worktree:** `ERP_Avgust_is_petya_e15_04`.
**Приоритет:** 🔴 blocker качества (без этого Recognition не тянет реальные ОВиК PDF — см. QA-FINDINGS).
**Срок:** 2–3 дня.

---

## Контекст

QA-сессия 2 на golden `spec-ov2-152items.pdf` (см. `ismeta/docs/QA-FINDINGS-2026-04-21.md` #4–#25) выявила **22 активных бага** парсера, корни сводятся к **9 root causes**. 8 багов упираются в **R1 — no column-aware parsing**: парсер читает `page.get_text()` в reading order без учёта bbox ячеек → переносы внутри ячейки не отличаются от перехода в соседнюю row, column detection отсутствует, multi-line name разрывается.

**Решение PO:** **Вариант B** — text-layer extraction + LLM normalization.

**Почему B:**
- Pure text-layer + heuristics (вариант A) упирается в потолок 85% recall на реальных ЕСКД-таблицах (слишком много вариативности).
- Pure Vision слишком медленный (5с/стр) и даёт 4% recall без нового подхода.
- Text-layer структурирует данные (rows + columns + bbox), **LLM делает только NLP** (склейка переносов, детекция секций, фильтрация штампа). Работает по тексту, не картинке → 2–4с/стр вместо 10.

**Целевые метрики** (см. запрос Андрея):
- Recall ≥ **95%** на golden (142 → ≥145 из 152).
- Время: ≤ 30 с на 20-страничный PDF.
- Стоимость: ~$0.005/документ (gpt-4o-mini).
- Пропустить ручную проверку: «проверять 10000 строк — не вариант» — парсер должен быть **reliable enough**, чтобы пользователь доверял результату.

---

## Архитектура решения

### Новый pipeline

```
PDF (text layer)
  ↓
pdf_text.extract_structured_rows(page) → list[TableRow]
  ↓ (bbox-aware: y-buckets = rows, x-ranges = columns)
spec_parser.normalize_via_llm(rows) → list[SpecItem]
  ↓ (gpt-4o-mini, промпт по тексту)
SpecParseResponse
```

Если text layer отсутствует (`has_usable_text_layer=False`) → fallback на существующий Vision путь (без изменений).

### Модуль `recognition/app/services/pdf_text.py`

**Новая функция:**

```python
from dataclasses import dataclass

@dataclass
class TableRow:
    """Структурированная строка таблицы спецификации.

    Значения — «как есть» из PDF (raw text), нормализация — на стороне LLM.
    """
    page_number: int           # 1-based
    y_mid: float               # Y-координата центра row (для sticky-cross-page ordering)
    row_index: int             # внутри страницы, 0-based
    cells: dict[str, str]      # column_key -> cell text (может быть пустая строка)
                               # column_key ∈ {"pos", "name", "model", "brand",
                               #               "unit", "qty", "mass", "comments"}
    raw_blocks: list[str]      # все текст-блоки строки в порядке чтения
                               # (для LLM-контекста если cells пустоваты)


def extract_structured_rows(page: fitz.Page) -> list[TableRow]:
    """Извлечь строки таблицы из страницы PDF по bbox.

    Алгоритм:
    1. page.set_rotation(0) — нормализация к стандартному landscape.
    2. page.get_text("dict") → blocks → lines → spans.
    3. Фильтр штампа ЕСКД:
       - bbox в зонах штампа (нижние 15% + правые 12%),
       - span.dir != (1, 0) (сервисный текст повёрнут),
       - span.text ∈ известных маркеров (см. _STAMP_EXACT).
    4. Column header detection: найти row с ≥3 совпадениями из списка
       ["Поз.", "Наименование", "Тип", "марка", "Код", "Ед.", "Кол", "Масса", "Примечание"].
       Его x-координаты (bbox.x0) → x-ranges колонок.
    5. Y-bucketing: span'ы группируются в row по y-координате (±5px tolerance).
    6. Per-row cell extraction: для каждого span внутри row определить
       колонку по x-координате его bbox.x0 (берём ту, чей x-range включает середину span).
    7. Multi-line cells: если у одной колонки одной row несколько span'ов
       (разные y но тот же x-range) — склеить через пробел.
    8. Section heading detection: отдельно пометить строки где бо́льшая часть
       текста попадает в одну колонку «Наименование» (без model/qty), с большим
       font-size или bold-weight — это секционный заголовок.
    """
    ...


def is_header_row(row_cells: dict[str, str]) -> bool:
    """True если row совпадает с шапкой таблицы (column headers)."""
    ...
```

**Ключевые тесты:**
- `test_extract_structured_rows_basic` — 1 row с name+model+unit+qty → корректный dict.
- `test_multi_line_name_cell` — name занимает 2 y-позиции → склеен через пробел.
- `test_column_header_detection` — ищет шапку «Поз. | Наименование | ...».
- `test_stamp_filtered` — штамп ЕСКД не попадает в rows.
- `test_section_heading_detected` — заголовок раздела помечен отдельно.
- `test_rotated_page_normalized` — `page.rotation=90` → rows в правильном порядке.

### Модуль `recognition/app/services/spec_parser.py`

**Новый pipeline в `_process_page`:**

```python
async def _process_page(self, doc, page_num):
    state = self.state
    try:
        page = doc[page_num]
        if has_usable_text_layer(page):
            rows = await run_in_threadpool(extract_structured_rows, page)
            if rows:
                parsed = await self._normalize_via_llm(
                    rows,
                    current_section=state.current_section,
                    sticky_parent_name=state.sticky_parent_name,
                )
                state.current_section = parsed.new_section
                state.sticky_parent_name = parsed.new_sticky
                for item_data in parsed.items:
                    state.sort_order += 1
                    state.items.append(
                        SpecItem(
                            name=item_data.name[:500],  # defensive, parallel to hotfix
                            model_name=item_data.model_name,
                            brand=item_data.brand,
                            unit=item_data.unit,
                            quantity=item_data.quantity,
                            tech_specs={  # E15.04: поддержка Примечания + system prefix
                                "comments": item_data.comments,
                                "system": item_data.system_prefix,
                            } if (item_data.comments or item_data.system_prefix) else "",
                            section_name=parsed.new_section,
                            page_number=page_num + 1,
                            sort_order=state.sort_order,
                        )
                    )
                state.pages_processed += 1
                return
            state.pages_skipped += 1
            return

        # Vision fallback — без изменений
        await self._process_page_vision(doc, page_num)
    except Exception as e:
        ...
```

**Новый метод `_normalize_via_llm`:**

```python
@dataclass
class NormalizedPage:
    items: list[SpecItem]
    new_section: str
    new_sticky: str


async def _normalize_via_llm(
    self,
    rows: list[TableRow],
    current_section: str,
    sticky_parent_name: str,
) -> NormalizedPage:
    """LLM-нормализация структурированных rows → финальные items.

    Вызывает provider.text_complete(prompt) (НОВЫЙ метод BaseLLMProvider —
    см. ниже). На gpt-4o-mini batch всех rows одной страницы = 1 call.
    """
    prompt = NORMALIZE_PROMPT.format(
        current_section=current_section,
        sticky_parent_name=sticky_parent_name,
        rows_json=json.dumps([asdict(r) for r in rows], ensure_ascii=False),
    )
    response = await self.provider.text_complete(prompt)
    parsed = json.loads(_strip_markdown_fence(response))
    # ... валидация структуры, сборка NormalizedPage
    return NormalizedPage(items=..., new_section=..., new_sticky=...)
```

**Промпт `NORMALIZE_PROMPT` (структура):**

```
Ты получаешь список строк таблицы спецификации ОВиК (в проекционной PDF),
уже извлечённых по bbox из text-layer. Каждая строка = dict с колонками:
pos, name, model, brand, unit, qty, mass, comments. Плюс raw_blocks.

Твоя задача:
1. Определить секционные заголовки — строки где name непуст, а model/unit/qty пусты,
   и name выглядит как раздел: «Система ...», «Клапаны ...», «Фасонные изделия ...»,
   «Противодымная ...» и т.п. Эти строки — НЕ items, они обновляют section_name.
2. Склеить переносы имён: если name короткий/обрывается и следующая row имеет
   только хвост («покрытие - нормированная фольга»), а model/unit/qty пусты —
   это продолжение предыдущего name.
3. Применить sticky parent name: если name пустой, а model/unit/qty заполнены —
   наследовать name от предыдущего item в том же разделе (или от sticky_parent_name
   на входе страницы).
4. Обработать артикульные варианты: «Выбросной колпак» (name) + 6 строк без name
   с model «РЭД-ВВШ-SP-XXX-YY» → 6 items с name=«Выбросной колпак», model=код.
5. Обработать префикс-колонку «Система» (pos может содержать «ПВ-ИТП»):
   положить в system_prefix, НЕ склеивать с name.
6. Фильтр: строки-header («Поз.», «Наименование», ...), штампы («Формат А3»,
   «Изм.», «Подп.» и т.п.), шифры документа (NNN-NN/YYYY-XX...) — НЕ включать.
7. comments: извлечь как есть, не дописывать.
8. НЕ ИЗОБРЕТАТЬ позиции. Если данных в row нет — не заполнять. Если name
   нельзя восстановить из контекста — оставить raw из row.

На выходе верни JSON:
{
  "new_section": "...",  // секция по окончании страницы (если была смена)
  "new_sticky": "...",   // sticky parent name по окончании страницы
  "items": [
    {
      "name": "...",
      "model_name": "...",
      "brand": "...",
      "unit": "шт",
      "quantity": 58.0,
      "comments": "...",
      "system_prefix": "ПВ-ИТП"  // если была префикс-колонка; иначе ""
    },
    ...
  ]
}

Входные данные:
current_section: "{current_section}"
sticky_parent_name: "{sticky_parent_name}"
rows: {rows_json}
```

### Обновление `BaseLLMProvider` — новый метод `text_complete`

**Файл:** `recognition/app/providers/base.py`.

```python
async def text_complete(self, prompt: str, *, max_tokens: int | None = None) -> str:
    """Text-in → text-out LLM completion. Для normalize структурированных данных."""
    raise NotImplementedError
```

**Файл:** `recognition/app/providers/openai.py` (или как у Пети называется).

- Реализация через `chat.completions.create` с `model=settings.llm_model` (по умолчанию `gpt-4o-mini`).
- `response_format={"type": "json_object"}`.
- `max_tokens` по умолчанию 8000 (или из `settings.llm_max_tokens`).

### Обновление схемы `SpecItem`

**Файл:** `recognition/app/schemas/spec.py`.

- Поле `tech_specs: str = ""` остаётся как было.
- `SpecParser` теперь может класть в `tech_specs` сериализованный JSON с `comments` и `system` (как в коде выше).
- Либо: расширить схему `SpecItem.comments: str = ""` напрямую (proper Pydantic field).

**Рекомендация:** добавить `SpecItem.comments: str = ""` явным полем (чище для контракта). Если добавляем — обновить:
- `recognition/openapi.yaml` — добавить `comments` в schema.
- `ismeta/backend/apps/estimate/services/pdf_import_service.py` — читать `item.get("comments")` → класть в `tech_specs["comments"]` (т.к. в ISMeta модели нет колонки `comments`, а миграции мы не трогаем).

---

## R2 — section detection

После bbox-extraction у нас есть x-ranges колонок. Секционный заголовок = **row, где**:
- Ненулевой text **только** в колонке «Наименование» (все остальные cells пустые).
- Либо font-size (из span'ов) > среднего по странице на 20%+.
- Либо font-weight = bold (fitz возвращает в span'е).

Эти строки помечаем в `TableRow.cells["_type"] = "section_heading"` (специальный маркер). LLM-промпт видит флаг и обновляет `new_section`.

Для ловли **многострочных секционных** заголовков (#11 — «Система общеобменной вытяжной вентиляции. МОП и Коммерческие помещения» на двух строках) — детектор смотрит на последовательные section-heading rows и **склеивает** их в одну секцию (строки с близкой y, одинаковый font, только колонка name).

**Альтернатива (если font detection нестабилен):** полагаться только на «только name, другие cells пусты» + расширенный regex `_SECTION_RE`. LLM-промпт дополнительно верифицирует.

---

## R4 — variant regex расширение

**Файл:** `recognition/app/services/pdf_text.py`, `_VARIANT_RE`.

После bbox-extraction variant-детекция упрощается: если строка имеет **только колонку model** (name пуст, model заполнен, unit/qty тоже заполнены) → это variant при sticky parent. Нужно расширить detection на:
- «РЭД-ВВШ-SP-1000х550-10» — артикульный код.
- «диаметр 500» — словесное обозначение диаметра.
- «ВД1,2,3» — системный индекс.

Но так как **LLM-промпт уже делает sticky-inheritance**, regex теперь используется только как **подсказка в промпте** (LLM видит column «model» без «name» и применяет sticky сам). Однако оставить regex как эвристику-гард для снижения LLM-ошибок.

---

## R7 — префикс-колонка «ПВ-ИТП»

Определяется через column detection: если column header «Поз.» (или unnamed) содержит короткий повторяющийся код «ПВ-ИТП» на нескольких rows подряд — это системный префикс, кладётся в `system_prefix` отдельно от name.

**Решение Андрея:** если клиент хочет — склеить к name через `-` (но в модель сметы склеенный вариант). Делаем склейку на стороне LLM по флагу промпта (можно параметризовать, но сейчас — всегда через `-`):

```
name_final = f"{system_prefix}-{name}" if system_prefix else name
```

Пример: `"ПВ-ИТП-Вентилятор канальный (системы В-НС-1)"`.

---

## Приёмочные критерии

### Функциональные

1. ✅ Recall на golden `spec-ov2-152items.pdf` ≥ **145/152 (95%)**, целевой 150+.
2. ✅ Секционные заголовки распознаются (все 8-9 секций golden):
   - «Система общеобменной вентиляции. Жилая часть»
   - «Система общеобменной вытяжной вентиляции. МОП и Коммерческие помещения»
   - «Противодымная вентиляция» 
   - «Фасонные изделия к вентиляторам ПДВ»
   - и остальные 4-5 подгрупп.
3. ✅ «Дефлектор Цаги на узле прохода УП1» — **2 позиции** (не 4), с корректным multi-line name.
4. ✅ «Выбросной колпак» + 6 моделей РЭД-ВВШ-SP — **7 позиций с одинаковым name, разными model**.
5. ✅ «Воздуховоды приточной противодымной вентиляции (не менее 0.8мм)» — sticky parent работает для 13 позиций диаметров.
6. ✅ «Огнезащитная клеящая смесь Kleber» (140 и 40) — **2 отдельные позиции в разных секциях** (без dedup'а это уже работает из hotfix).
7. ✅ Количества читаются корректно (1,5 а не 1246,5; 4900 а не 5010).
8. ✅ Колонка «Примечание» извлекается в `tech_specs.comments`.
9. ✅ Префикс «ПВ-ИТП» склеен к name через `-`.

### Нефункциональные

10. ✅ Время parse на 19-стр PDF: ≤ **30 с**.
11. ✅ Vision fallback не сломался (existing tests green).
12. ✅ `pytest -q` recognition — все зелёные.
13. ✅ `pytest -m golden` — MIN_ITEMS поднять до **145** (или что покажет прогон, но не ниже).
14. ✅ `ruff` + `mypy` clean.
15. ✅ OpenAI API тоже получает proper API-key — `settings.OPENAI_API_KEY` без hardcoded fallback.

### Документация

16. ✅ `recognition/README.md` — новая секция «Pipeline: text-layer extraction + LLM normalization».
17. ✅ `recognition/openapi.yaml` — `SpecItem.comments` добавлено (если менял схему).
18. ✅ ADR: `ismeta/docs/adr/0024-column-aware-llm-normalization.md` — архитектурное решение Вариант B.

---

## Ограничения

- **НЕ менять** модель `EstimateItem` (миграции — отдельное решение).
- **НЕ менять** внешний контракт `/v1/parse/spec` — добавлять новые поля в SpecItem можно, удалять/переименовывать старые нельзя.
- Fallback в Vision **обязателен** — если text layer отсутствует / битый, не падать.
- **НЕ делать** HTTP-обёртки между Recognition и LLM — прямой OpenAI client (memory `feedback_no_wrappers.md`).
- LLM-temperature = 0 (детерминизм для golden test).
- Все promt'ы хранить в отдельных константах в модуле, не inline.

---

## Тесты (новые обязательные)

### `recognition/tests/test_pdf_text.py`
- Column header detection (шапка ЕСКД).
- Multi-line name cell склейка.
- Section heading detection (font-bold + единственная колонка name).
- Фильтр штампа ЕСКД по bbox + dir + keyword.
- extract_structured_rows на голден-фикстуре 1 страницы.

### `recognition/tests/test_normalize_llm.py` (новый файл)
- Mock `provider.text_complete` → валидный JSON → проверка SpecItem конверсии.
- Промпт с sticky → результат корректный sticky-inheritance.
- Промпт с section heading row → new_section обновлён, row НЕ в items.
- Error: LLM вернул не-JSON → fallback (какой? решить в PR).
- Error: LLM hallucinate новые позиции не из rows → детектор (если количества items > row-count без sticky — сигнал к warning'у).

### `recognition/tests/golden/test_spec_ov2.py`
- MIN_ITEMS → 145 (или фактический результат).
- Новые assert'ы: «Дефлектор Цаги на узле прохода УП1» = 2 items, «Выбросной колпак» + 6 моделей, «Kleber» = 2 items в разных секциях.

### `ismeta/backend/apps/estimate/tests/test_pdf_import.py`
- `tech_specs.comments` читается из Recognition response → в `EstimateItem.tech_specs`.
- `tech_specs.system` аналогично (если делаем).

---

## Формат отчёта

1. Ветка и hash последнего коммита.
2. Архитектура: короткое описание pipeline (что нового, что оставили).
3. Прогоны:
   - `pytest -q` recognition — N passed.
   - `pytest -m golden` — recall items_count/152.
   - `pytest -q` ismeta/backend — N passed.
   - Live-прогон на golden: время, stdout json, сравнение с прошлым (93% → %).
4. Метрики LLM: tokens in/out, cost per document.
5. Новые ADR / доки.
6. Известные ограничения (что не успели, tech debt).
