# DEV Backlog — задачи для улучшения dev-ergonomics

Не бизнес-фичи — боль разработчиков/агентов при локальной работе.

## Средний приоритет

### 1. seed_dev_data: обогатить tech_specs
- Сейчас `seed_dev_data` создаёт items с `tech_specs={}` у всех 5 позиций.
- Из-за этого ручную проверку UI-02 (brand/model/подстроки) нельзя сделать сразу после `make ismeta-seed` — нужно вручную лезть в БД и UPDATE.
- Что доделать: в команде `seed_dev_data` добавить для 3–5 items в тестовую смету разные комбинации:
  - оба поля: `{"brand": "MOB", "model_name": "MOB2600/45-3a", "flow": "2600 м³/ч"}`
  - только model: `{"model_name": "500x400"}`
  - только brand: `{"brand": "ExtraLink"}`
  - пустой (для контроля негативного кейса): `{}`
- Один item — с дополнительными произвольными полями (flow/power/class/cooling) — чтобы tooltip tech_specs тоже было чем тестировать.
- Реализация: `backend/apps/estimates/management/commands/seed_dev_data.py` — в цикле создания items прописать `tech_specs=...`.

## Средний приоритет

### 2. PDF import end-to-end с реальным Recognition

- UI-PDF-verify проверен через Playwright MCP + `window.fetch` override (unit-level). Реальный запуск Recognition Service требует `OPENAI_API_KEY` — в dev-среде Феди ключа не было.
- Нужна верификация на stand (prod-like): смета → загрузка реального PDF → Recognition → items с `tech_specs.brand/model_name` → UI-02 подстроки.
- Исполнитель: Андрей (на prod) или любой агент при наличии ключа.

### 3. Унификация контракта ImportResult (Excel vs PDF)

- Сейчас Excel отдаёт `{created, updated, errors}`, PDF через Recognition — `{created, sections, errors, pages_total, pages_processed}`.
- MVP-решение: `updated?: number` optional в общем `ImportResult` type.
- Tech debt: разделить на два type — `ExcelImportResult` и `PdfImportResult`. Разные операции, разные смыслы, общий type вносит путаницу.
- Реализация: `ismeta/frontend/lib/api/types.ts` + соответствующие mappers в `ExcelImportDialog` / `PdfImportDialog`.

## Низкий приоритет

### 4. Playwright MCP screenshot зависание с Radix Dialog

- Стабильно «waiting for fonts to load» после нескольких взаимодействий с открытым Radix Dialog.
- Workaround для ручных верификаций: закрывать Dialog перед `browser_take_screenshot`.
- Долгосрочное решение: прямые Playwright-скрипты (без MCP) для тяжёлых UI-проверок. Или PR в Playwright MCP.

### 5. Mid-session 400 на GET /api/v1/estimates/{id}/ в dev ISMeta backend

- После сотен запросов в одной dev-сессии endpoint детали сметы начинает отвечать 400 Bad Request, хотя endpoint списка возвращает смету с тем же id.
- Возможные причины: workspace-middleware, session state, connection pool exhaustion, cache drift.
- Исполнитель: backend (Петя). Расследовать — нужны логи с момента 400, state middleware, БД-сессии.

## Высокий приоритет

### 6. TechSpecs Pydantic schema drift

- **Контракт schema** (`ismeta/backend/apps/estimate/schemas.py::TechSpecs`): whitelist `manufacturer / model / power_kw / weight_kg / dimensions`.
- **Runtime данные** (Recognition + pdf_import_service + UI-02): `brand / model_name / flow / cooling / source_page / ...` произвольные ключи.
- Сейчас spared только тем, что Pydantic v2 по default делает `extra="ignore"` — но поле `CONTRIBUTING §10.1` декларирует whitelist как контракт, хотя он не соблюдается. Любая смена на `extra="forbid"` или явный `.model_dump()` после `.model_validate()` сломает всё.
- **Решение:**
  - (a) Обновить TechSpecs под реальные поля Recognition (brand, model_name, flow, cooling, power, class, section, material, manufacturer как alias ...) + explicit `model_config = ConfigDict(extra="allow")` для будущих расширений.
  - (b) Или удалить schema если она не даёт ценности (всё равно dict JSONB).
- **Исполнитель:** IS-Петя (backend). Проверить использование `.model_validate` — возможно `.clean()` не вызывается при save через ORM и это мёртвая валидация.

### 7. respx в dev venv пропадает

- При повторных reset/make ismeta-setup пакет `respx>=0.21` в requirements.txt не устанавливается в главный venv (проявлялось у Феди в worktree `ERP_Avgust_is_fedya_seed`).
- Причина неясна — возможно Makefile ismeta-setup использует старый lock или разные venvs в worktrees.
- **Решение:** поправить Makefile / requirements lock, чтобы `make ismeta-backend-install` надёжно тянул все test deps.

### 8. MaterialMatchingService.apply_matches — на ORM + transaction.atomic()

- Сейчас `apps/estimate/matching/materials.py::MaterialMatchingService.apply_matches`
  делает raw `UPDATE estimate_item ... WHERE id = %s` по одному запросу в цикле.
- Для MVP ок (подборов мало, workflow ручной), но при массовом apply появятся
  N+1 roundtrips и нет единой транзакции.
- Что доделать: `EstimateItem.objects.filter(id__in=[...]).update(...)` в
  `transaction.atomic()`, либо `bulk_update(items, ["material_price", "version"])`
  по пачкам; сохранить инкремент `version` (optimistic lock consistent с
  остальным API).
- Исполнитель: backend (Петя), когда будет >100 apply per click.

### 9. match_item → возвращать top-3 для yellow-бакета

- Сейчас `matching/materials.py::match_item` возвращает только топ-1
  кандидат. Для green (≥0.90) это ок — матч уверенный.
- Для yellow (0.70–0.90) оператор в UI должен видеть 2–3 похожих
  материала и выбирать сам. Сейчас если top-1 угадан неверно, оператор
  не знает что ниже по рейтингу было что-то лучше.
- Что доделать: `match_item → match_item_candidates(item, n=3) -> list[MaterialMatch]`.
  В endpoint `/match-materials/` для green сохраняем 1 (auto-apply),
  для yellow отдаём всю тройку с флагом `needs_review=True`.
  Frontend UI (Федя): выпадающий список с вариантами для yellow.
- Исполнитель: backend (Петя), когда Федя начнёт делать UI подтверждения.

### 10. 🔥 Recognition: gpt-4o-mini возвращает JSON в markdown wrapper — классификация страниц всегда падает

- **Симптом:** на live-прогоне (2026-04-21) PDF-import 4-страничной спецификации через OpenAI → pages_processed=0, 8 classify_failed в логах: `Expecting value: line 1 column 1 (char 0)`.
- **Причина:** gpt-4o-mini игнорирует инструкцию «Ответь строго JSON (без markdown)» и оборачивает ответ в ` ```json\n{...}\n``` `. `json.loads` на таком ответе падает.
- **Почему не заметили в тестах:** unit-тесты используют `MockProvider` который возвращает чистый `json.dumps({...})`. На живом LLM поведение другое.
- **Решение (любое из):**
  - (a) В `recognition/app/providers/openai_vision.py` добавить `response_format={"type": "json_object"}` в `payload` — OpenAI JSON mode гарантирует валидный JSON без markdown.
  - (b) В `_common.py::vision_json` перед `json.loads` делать strip:
    ```python
    response = response.strip()
    if response.startswith("```"):
        response = response.strip("`").removeprefix("json").strip()
    ```
    (защита и для других провайдеров, которые могут так же оборачивать).
  - Обе одновременно — идеально. (a) — primary, (b) — defensive.
- **Приоритет:** 🔥 **критический** — блокер демо PDF-import с реальным OpenAI. Без фикса весь Recognition флоу неработоспособен вне моков.
- **Исполнитель:** IS-Петя. Задача: `E-MAT-UI-02` или `recognition/fix-json-parsing`.

### 11. UI inline-edit для `tech_specs.model_name` и `tech_specs.brand` — GAP редактирования

**Контекст (вопрос Андрея 2026-04-21):**
> «Что будет если в смете будет отдельно Наименование (один столбец) и Модель (другой столбец)?»

Сегодня в редакторе (`items-table.tsx`) есть `EditableCell` для `name`, `unit`, `quantity`, `equipment_price`, `material_price`, `work_price`. Но `tech_specs.model_name` и `tech_specs.brand` — **только отображаются** (UI-02 подстрокой `Korf · WNK 100/1`), отредактировать через UI нельзя. Пользователь:
- видит подстроку,
- хочет поправить «MOB 2600/45-3а» на «MOB 2600/45-3b»,
- не может — нужно идти в админку, SQL, или Excel импорт.

**Решение (вариант A — минимальный UX, рекомендуется):**
- Новый компонент `components/estimate/tech-specs-editor.tsx`:
  - Клик по подстроке `{brand} · {model_name}` → превращается в два inline-input'а (brand + model_name).
  - Blur / Enter → PATCH item с обновлённым `tech_specs` (merge, не replace — остальные ключи сохраняем).
  - Escape → cancel.
- Интеграция в `items-table.tsx`: заменить статический рендер подстроки на `<TechSpecsEditor>` с теми же пропсами (value, onCommit).
- Если оба поля пустые и клик — показать placeholder-форму: `brand: ___ model: ___`.
- API: существующий `PATCH /items/{id}/` принимает `tech_specs` dict — backend сливает с существующим (проверить `EstimateItem.serializer` что не replace а merge; если replace — исправить или использовать специальный patch endpoint).

**Решение (вариант B — полная tech_specs модалка, на будущее):**
- Клик → модалка с формой: `brand / model_name / + все произвольные ключи из tech_specs как key-value table`.
- Даёт править flow / cooling / power и другие произвольные поля.
- **Пока не делаем** — когда пользователь захочет править произвольные ТТХ, тогда добавим.

**Решение (вариант C — отдельные колонки Модель/Бренд):**
- Добавить опциональные колонки «Модель» и «Бренд» в `items-table` через column visibility toggle.
- Более громоздко, но явно для пользователя. **Не делаем MVP** — подписи под именем достаточно.

**Acceptance:**
- Клик по подстроке → inline редактирование работает.
- PATCH отправляет merge, не теряет произвольные ключи `tech_specs`.
- Пустые brand/model → плейсхолдер, но клик работает.
- Тесты: render существующих значений → редактирование → PATCH → UI обновился; отмена Escape не вызывает PATCH; стресс на специфические символы (кириллица, слэши, скобки в модели).

**Исполнитель:** IS-Федя (UI) + IS-Петя (проверить merge-поведение сериализатора backend).
**Файлы:**
- `ismeta/frontend/components/estimate/tech-specs-editor.tsx` (новый)
- `ismeta/frontend/components/estimate/items-table.tsx` (подстроки → редактор)
- `ismeta/frontend/components/estimate/matching-review.tsx` (там тоже подстрока, можно оставить read-only)
- `ismeta/backend/apps/estimate/serializers.py` (проверить merge для tech_specs)

---

### 12. Excel import — маппинг колонок «Модель / Марка / Бренд» в `tech_specs` — GAP двустороннего round-trip

**Контекст:**
Сейчас `ismeta/backend/apps/estimate/excel/importer.py` **не парсит** колонки «Модель», «Марка», «Артикул», «Бренд», «Производитель». Всё что в этих колонках — игнорируется или склеивается в `name`. Последствие:
- Пользователь экспортирует смету в Excel (колонки есть).
- Правит в Excel «Модель» на «RQ-71BV-A1».
- Импортирует обратно → колонка игнорируется → правка потеряна.

Плюс если в исходном Excel от поставщика/проектировщика отдельные колонки «Модель» и «Марка» (типично для ОВиК-спецификаций) — они тоже не попадут в `tech_specs.model_name`.

**Что проверить первым:**
- `excel/exporter.py` — действительно ли tech_specs.model_name / brand экспортируются отдельными колонками или их вообще нет в экспорте? Если нет в экспорте — round-trip ломается с обеих сторон.

**Решение (importer.py):**
1. Распознавание колонок — расширить header-matcher (регулярки + нормализация):
   - `model_name` ← колонки с заголовками `Модель`, `Model`, `Марка`, `Артикул`, `Обозначение документа`, `Тип`, `SKU` (несколько вариантов ИБО в РФ спецификациях много разных заголовков).
   - `brand` ← `Бренд`, `Brand`, `Производитель`, `Поставщик`, `Изготовитель`, `Вендор`.
   - Нормализация: lowercase, strip пробелов и точек, ё→е.
2. Если нашли соответствующую колонку → значение в `tech_specs.model_name` / `tech_specs.brand`.
3. Если в одной строке и `Модель`, и `Марка` одновременно (бывает) → `model_name` = первое непустое, второе → в `tech_specs.marking` как доп. поле (через `extra="allow"` schema).
4. Fallback при отсутствии — текущее поведение (всё в `name`). No regression.

**Решение (exporter.py):**
- Добавить колонки «Модель» (`tech_specs.model_name`) и «Бренд» (`tech_specs.brand`) в экспорт. Скрывать пустые? Нет — всегда показывать, чтобы пользователь мог заполнить в Excel.
- Остальные произвольные ключи `tech_specs` — пока не экспортируем (они в tooltip UI-02 — достаточно для просмотра).

**Acceptance:**
- Excel с колонкой «Модель» → после импорта `tech_specs.model_name` заполнено.
- Excel с колонками «Марка» + «Бренд» → обе попадают (model_name + brand).
- Excel без этих колонок → no regression, существующие тесты зелёные.
- Round-trip: export смету → edit в Excel → import обратно → model_name и brand сохранились.
- 5+ новых тестов, включая edge cases (оба столбца есть, только один, пустые ячейки, кириллица с дефисами «ВВГнг-LS»).

**Исполнитель:** IS-Петя.
**Файлы:**
- `ismeta/backend/apps/estimate/excel/importer.py`
- `ismeta/backend/apps/estimate/excel/exporter.py`
- `ismeta/backend/apps/estimate/tests/test_excel_import.py` (или как он называется)
- `ismeta/backend/apps/estimate/tests/test_excel_export.py`
- Обновить `ismeta/specs/05-excel-schema.md` если есть (документ Excel-контракта).

---

### 13. SpecParser Vision path не применяет sticky_parent_name

**Контекст:** E15.03 добавил sticky parent name в text-layer путь (`pdf_text.parse_page_items`). Vision fallback (`spec_parser._process_page` при `has_usable_text_layer=False`) создаёт `SpecItem` напрямую из LLM response — `state.sticky_parent_name` игнорируется.

**Последствие:** Mixed PDF (native pages + scan pages). Native страница устанавливает sticky="Воздуховод", следующая страница — скан, уходит в Vision. LLM вернёт items без осознания parent-context → bridge рвётся.

**Решение:** В Vision-пути после получения items от LLM, проверить если item.name пустое/variant-like и есть state.sticky_parent_name — применить. Либо передать sticky в prompt как подсказку.

**Исполнитель:** IS-Петя.
**Файл:** `recognition/app/services/spec_parser.py:_process_page` (Vision branch).
**Приоритет:** низкий (редкий кейс mixed PDF).

---

### 14. _STAMP_EXACT содержит короткие токены (хрупко на не-ГОСТ форматах)

**Контекст:** `recognition/app/services/pdf_text.py:_STAMP_EXACT` включает "А3", "А4", "Р", "Лист", "ГИП", "во", "ния" — exact-match после strip, но короткие токены могут конфликтовать с реальными item-именами в нестандартных PDF (например «Р — резервный» или «Лист изоляции»).

**На голден ОВ2 регрессии нет**, но:
**Решение:** Добавить в docstring модуля disclaimer про ГОСТ-ориентированный набор и риск на экзотических форматах. При первом regression — переход на pattern-based (pattern + context) вместо exact.

**Исполнитель:** IS-Петя.
**Файл:** `recognition/app/services/pdf_text.py` (docstring + опциональная pattern-based альтернатива).

---

### 15. _SECTION_RE покрывает только ОВиК-разделы

**Контекст:** Regex в `pdf_text.py` ловит только:
`Система | Клапаны | Противодымная | Общеобменн | Воздуховоды | Воздуховод приточной | Слаботочн | Отопление | Кондиционирован | Дымоудален | Приточная | Вытяжная`.

**Не покрыто:** «Холодоснабжение», «Электроснабжение», «Силовое», «Автоматика», «Водоснабжение», «Канализация», «ВКТ», «ОВВК», «ТС», «ГС» и т.п.

**Последствие:** На не-ОВиК спецификациях раздел не распознаётся, все items уйдут под один section_name (последний из fallback или пустая строка).

**Решение:** Расширить regex при появлении реальных примеров non-ОВиК PDF. Альтернативно — LLM классификатор раздела как опциональный шаг над text-layer items (гибридный hybrid).

**Исполнитель:** IS-Петя.
**Файл:** `recognition/app/services/pdf_text.py:_SECTION_RE`.

---

### 17. dedup убран — E15.03-hotfix (2026-04-21)

Контекст: бизнес-правило «смета = точная копия PDF». Раньше `_deduplicate` суммировал
одинаковые (name, model, brand) из разных секций → неверные количества в итоге (golden
QA-сессия 2: Kleber 140кг Общеобменная + 40кг Противодымная сливались в 180кг).

Решение: `SpecParser._deduplicate` удалён. Вызовы из `parse` и `build_partial`
убраны. Defensive truncate name >500 символов в `apply_parsed_items` — предотвращает
500 при багнутом multi-line name из парсера (до E15.04).

Если в будущем понадобится опциональная дедупликация — делать на UI-уровне с явным
UX (конфликт позиций) + section_name в ключе.

---

### 16. spec_parser._process_page — except Exception без traceback

**Контекст:** `recognition/app/services/spec_parser.py:_process_page` ловит `Exception` на уровне страницы и пишет `logger.warning(...)` со `str(e)`. Traceback теряется — регрессию в `parse_page_items` (например падение на edge-case строк) поймаем только по items, не по stack.

**Решение:** Заменить на `logger.exception("spec_parse page error", extra={...})` — добавит traceback в JSON log. Либо сохранять traceback в `state.errors` для диагностики.

**Исполнитель:** IS-Петя.
**Файл:** `recognition/app/services/spec_parser.py:_process_page` (последний `except`).

---

### 18. ~~E15.05 prompt-тюнинг — recall 96.7% → 99%~~ ✅ _(закрыто E15.05 it2, 2026-04-22)_

**Контекст:** E15.04 live-QA на golden показал 147/152 (96.7%). Цель ТЗ ≥95% достигнута, но 5 позиций всё ещё теряются (в т.ч. частично #7 «Дефлектор Цаги на узле прохода УП1» — укорочено до «Дефлектор Цаги»).

**Статус 2026-04-22 (E15.05 it2):** закрыто. Итерация it2 добавила R18-strict (orphan-name ВСЕГДА continuation), R23 multi-row header detection, R27 conditional multimodal Vision retry. Recall spec-ov2 baseline — LLM_MIN_ITEMS поднят до 145 (95% от 152). См. ADR-0025.

**Файл:** `recognition/app/services/spec_normalizer.py:NORMALIZE_PROMPT_TEMPLATE`.

---

### 19. ~~Section МОП склеена с «Общеобменной вытяжной вентиляции»~~ ✅ _(закрыто TD-01, 2026-04-23)_

**Контекст:** E15.04 live-QA показал 7 секций вместо 8-9. Multi-line section heading «Система общеобменной вытяжной вентиляции. МОП и Коммерческие помещения» склеивается в одну строку без разделителя — теряется граница подсистем.

**Решение:** в NORMALIZE_PROMPT уточнить правило: если multi-line heading содержит точку в конце первой строки, использовать `. ` как разделитель, иначе — два отдельных section. Либо: heuristic на стороне `extract_structured_rows` — разделять heading rows по `is_section_heading` с разной y-bucket группой.

**Статус 2026-04-23 (TD-01):** закрыто — R26 section normalize расширен на `.` и `,`, убирает trailing punctuation вроде «Жилая часть.» которая давала дубль секции. Golden-тест на `_normalize_section_name("Жилая часть.") == "Жилая часть"` + `"Bar,." == "Bar"` зелёный.

**Исполнитель:** IS-Петя.
**Файлы:** `recognition/app/services/spec_normalizer.py` + `recognition/app/services/pdf_text.py`.

---

### 20. LLM_MIN_ITEMS 135 → 142 после стабилизации промпта _(TD-01: оставлен 140 — see ниже)_

**Контекст:** `recognition/tests/golden/test_spec_ov2.py:LLM_MIN_ITEMS = 135` — слишком слабая защита (32 позиции запаса от фактических 147). Regression escape-зона: prompt может деградировать до 89% recall и golden_llm тест пропустит.

**Решение:** после #18 (stabilize prompt) поднять `LLM_MIN_ITEMS` до 142 или 144. При прогонах в CI отслеживать флакость.

**Статус 2026-04-22:** E15.05 it1 поднял до **140** (фактический прогон — 161). Финальный подъём до 150+ после E15.05 it2 (multiline name) — оставляем запас для LLM variance.

**Статус 2026-04-23 (TD-01):** попытка поднять до 142 — фактический live-прогон на spec-ov2 дал ровно 140 items. Порог 142 даёт false failures. Откатили на 140 (equal to observed baseline). Переписать комментарий в тесте: поднимать дальше только при нескольких прогонах со стабильным ≥142. Считаем #20 **on-hold** (нет запаса для безопасного подъёма).

**Исполнитель:** IS-Петя.
**Файл:** `recognition/tests/golden/test_spec_ov2.py`.

---

### 21. ~~Cost E15.04 $0.011/doc → $0.005~~ ✅ _(частично закрыто TD-01 prompt caching, 2026-04-23)_

**Контекст:** ТЗ E15.04 ожидал ~$0.005/документ, факт — $0.011 (9 стр × ~4400 tokens prompt). Длинный `rows_json` — основной driver стоимости.

**Статус 2026-04-22 (E15.05 it2):** снято с требований. PO-решение: качество на любых документах приоритет № 1, cost/speed не блокеры (см. ADR-0025). Переход extract на gpt-4o full + conditional multimodal retry увеличил стоимость до ~$0.09/документ (9 стр × ~2000 prompt tokens × $0.005/1K + multimodal retry на пограничных страницах). Приемлемо на B2B-тарифах.

**Статус 2026-04-23 (TD-01):** ✅ OpenAI prompt caching включён. INSTRUCTIONS_BLOCK (правила 0-11 + схема output) вынесен в отдельное `role=system` сообщение — идентичный между всеми 9 страничными LLM-calls. Фактические метрики на spec-ov2 live:
- RUN1 (cache cold): 31744 cached / 45351 prompt = **70% cache hit**
- RUN2 (cache warm, сразу после RUN1): 36864 cached / 45351 prompt = **81% cache hit**
- Эффективная стоимость prompt tokens × (0.3 + 0.7 × 0.5) = **65%** от baseline → ~**−35% cost** (gpt-4o cached tarif × 0.5).
- Аналогичные изменения применены к invoice_normalizer + invoice_title_block (один и тот же pattern).

**Файл:** `recognition/app/services/spec_normalizer.py`, `invoice_normalizer.py`, `invoice_title_block.py`, `providers/openai_vision.py`.

---

### 22. ~~Time 34 с cold-start → стабильно ≤30 с~~ ✅ _(закрыто TD-01, 2026-04-23)_

**Контекст:** E15.04 live-QA показал 34 с end-to-end на cold-start OpenAI client, 27 с на прогретом. ТЗ требовал ≤30 с — на cold-start не попадаем.

**Статус 2026-04-22 (E15.05 it2):** снято с требований. Новая планка — ≤120 с на 9-стр PDF с multimodal retry (см. ТЗ E15.05 it2 §3.11). Решение PO: качество приоритет над скоростью. Если скорость снова станет блокером, вернёмся к: connection pool warming, streaming response, уменьшение prompt через prompt caching.

**Статус 2026-04-23 (TD-01):** ✅ сделано всё что планировалось:
1. `httpx.AsyncClient(http2=True, limits=Limits(max_keepalive_connections=5, keepalive_expiry=300))` — HTTP/2 + persistent connection pool;
2. `OpenAIVisionProvider.warm_up()` делает GET `/v1/models` в lifespan startup (0.6-1.0 с) — прогревает TCP+TLS+HTTP/2 negotiation до первого реального запроса;
3. Prompt caching (см. #21) на всех последующих страницах.

**Live-прогон spec-ov2 после TD-01 (sequential 2 раза):**
- Warm-up: 0.68 с
- RUN1 (сразу после warm-up): **29.58 с** (9 stranic, 9 LLM calls) — укладывается в 30с
- RUN2 (cache warm): **26.20 с**

Cold-start проблема решена.

**Файл:** `recognition/app/providers/openai_vision.py` + `recognition/app/main.py` lifespan.

---

### 24. UI-06 merge rows — atomic backend endpoint

**Контекст:** UI-06 (2026-04-22) объединяет строки с клиента через 1 PATCH + N-1 DELETE последовательно. При падении одного из DELETE пользователь увидит смешанное состояние (name/model уже слиты, но лишняя строка осталась); это решается повторным запуском. Для MVP приемлемо.

**Решение:** backend endpoint `POST /api/v1/estimates/{id}/items/bulk-merge/` — принимает `{ first_id, other_ids[], merged: { name, tech_specs } }`, выполняет PATCH + DELETE в рамках одной транзакции. На клиенте заменяет цикл в `items-table.tsx` на одиночный вызов.

**Исполнитель:** IS-Петя (backend) + IS-Федя (клиент). Делать по прямому запросу пользователя (сейчас MVP-вариант устраивает).

**Файл:** `ismeta/backend/apps/estimate/` (новый ViewSet action) + `ismeta/frontend/components/estimate/items-table.tsx` (замена mergeRows mutation).

---

### 24. #56 — kerning «Защитныйкозырек» (слитые слова без пробела)

**Контекст:** заход 1/10 QA-цикла, spec-ov2 строки 111-113. В наименовании «ПД1,2,3-Защитныйкозырек с сеткой» потерян пробел между «Защитный» и «козырек» — это два слова. Root cause — гистограмма kerning (R24) ставит gap-join threshold `gap < font_size * 0.3`, иногда склеивает слова.

**Решение:** post-process через словарь «общие русские компаунды» — если detected токен matches pattern ([прилагательное]+[существительное]) без пробела, и прилагательное ∈ словарь {«защитный», «противопожарный», «морозостойкий», «теплоизоляционный», ...} — вставить пробел.

Альтернатива: повысить threshold до 0.35 и посмотреть регрессию на spec-aov / spec-tabs.

**Приоритет:** 🟡 низкий — ручная правка строки 1 раз в PDF.

### 25. #57 — pos/name разделитель непоследовательный

**Контекст:** заход 1/10 QA-цикла. Система то сцепляет pos+name через пробел («ВД1 Воздуховод»), то через дефис («ВД1-Воздуховод»). Источник зависит от разделителя в PDF.

**Решение:** в промпте единое правило — использовать дефис без пробелов ИЛИ пробел (PO выберет). Нужно `ask PO preference first`.

**Приоритет:** 🟡 низкий — косметика.

### 26. UI-10 — показ suspicious pages в result-диалоге PDF-import

**Контекст:** E15-06 task 3 добавит `pages_summary` в SpecParseResponse с полем `suspicious: boolean` (True если LLM expected_count > parsed_count + retry не закрыл gap). Frontend сейчас это поле не отображает.

**Решение:** в `pdf-import-dialog.tsx` stage=result — если `pages_summary.some(p => p.suspicious)` — добавить предупреждение «Возможно пропущены позиции на страницах: …».

**Исполнитель:** Федя.
**Приоритет:** 🟡 follow-up к E15-06 (после мержа).

**TD-02 (2026-04-24, backend):** `pages_summary` теперь пробрасывается из
`Recognition.parse_spec` → `POST /api/v1/estimates/:id/import/pdf/` response
(контракт: `pages_summary: list[{page, expected_count, expected_count_vision,
parsed_count, retried, suspicious}]`). Ключ присутствует в обеих ветках
(happy + no-items). Блокер UI-10 снят — Федя может приступать.

### 27. UI-11 — стриминг прогресса PDF-import (живой прогресс по страницам)

**Запрос PO (QA-цикл заход 1/10, 2026-04-23):**
> «Сейчас просто крутится по кругу одни и те же слова, прогресс-бар давно вышел и ничего не происходит. Может пусть отдаёт частями?»

**Контекст:** после E15-06 it3 + semaphore 3 парсинг 19-страничного PDF занимает 60-90 с. Текущий UX (`pdf-import-dialog.tsx`):
- progress-bar на `estimated_seconds` из probe — после истечения заливается 100% и стоит
- hints (`HINTS_TEXT`) циклически меняются каждые 2.5 с, раздражают
- нет индикации «обработано N из M страниц» или «найдено K позиций»

**Решение:**

1. **Backend streaming** — варианты:
   - SSE (Server-Sent Events) endpoint `GET /api/v1/estimates/:id/import/pdf/stream`, принимающий PDF и эмитящий события `page_parsed {n, total, found_items}` / `retry_started {page}` / `done {total_items}`.
   - polling endpoint `GET /api/v1/estimates/:id/import/pdf/status/:job_id` возвращающий `{stage, page_current, page_total, items_so_far}`.

2. **Recognition** должен публиковать прогресс — например через Redis pub/sub (Redis уже есть в ismeta-compose) или через callback URL от backend.

3. **Frontend (`pdf-import-dialog.tsx`)** — заменить цикл hints на реальный прогресс:
   - «Страница 5 / 19 — найдено 42 позиции»
   - индикатор retry если suspicious page
   - estimated seconds пересчитывается по среднему per-page

4. **Живая вставка items в таблицу** (идея PO, 2026-04-23):
   > «Получать всё-таки частями и сразу вставлять — чтобы было прям наглядно. Как идея.»

   Вариант реализации: по мере того как стрим эмитит `page_parsed` с items — сразу batch-вставлять их через `sectionApi.create` + `itemApi.bulkCreate` в текущую смету. PO видит как позиции **появляются в таблице** во время парсинга, а не после. Диалог прогресса можно закрывать раньше — user уже видит промежуточный результат.

   Нюансы:
   - transaction atomicity: если парсинг упадёт на 5-й странице, первые 4 уже в смете. Нужна ручка «откатить импорт» либо stage-таблица.
   - порядок sort_order по мере прибытия (не задним числом).
   - React Query invalidate per page vs batched — per-page может быть шумно, но наглядно.

**Исполнитель:** Петя (backend + recognition stream) + Федя (frontend).
**Приоритет:** 🟡 major UX — не блокер для функциональности, но раздражает на больших PDF. Сделать после закрытия QA-цикла 10-заходов.

### 28. ~~Excel экспорт — столбец Модель не формируется~~ ✅ _(закрыто TD-02, 2026-04-24, backend-часть)_

**Запрос PO (QA-цикл заход 1/10, 2026-04-23):**
> «При скачивании Эксель файла — столбец Модель не формируется, только наименование.»

**Контекст:** UI-04 добавил колонку «Модель» в таблицу сметы (`tech_specs.model_name`). Парсер PDF заполняет её (см. items 5-10 Воздуховод с model="ф100/150х100/..."). В UI видно. Но при `GET /api/v1/estimates/:id/export.xlsx` в скачанном .xlsx колонка `model_name` отсутствует — только `name`.

**Root cause (гипотеза):** `ismeta/backend/apps/estimate/excel/exporter.py` не читает `tech_specs.model_name` в отдельный столбец.

**Решение:** в exporter добавить column «Модель» между «Наименование» и «Ед. изм.» — значение из `item.tech_specs.get("model_name", "")`. Если при excel-импорте (UI-03?) колонка существует, симметрично читать её в tech_specs.

**Исполнитель:** IS-Петя (backend exporter) или IS-Федя если там frontend-логика.
**Приоритет:** 🟡 minor — не блокер, но раздражает при ручной правке сметы.

**TD-02 (2026-04-24):** exporter + importer расширены полями UI-04
(Модель / Производитель / Бренд / Система / Примечание из `tech_specs`).
Importer делает merge с существующим `tech_specs` при update по `row_id` —
ключи, которых нет в Excel (power_kw, flow, dimensions…), сохраняются.
Тесты: 10 новых на export/import round-trip + cyrillic edge-case
«ВВГнг-LS-3x2.5». Закрывает также DEV-BACKLOG #12 (importer GAP).

### 29. ~~Свободная заметка к смете (стикер)~~ ⏳ _(backend закрыт TD-02, 2026-04-24; frontend — отдельная задача IS-Федя)_

**Запрос PO (QA-цикл заход 1/10, 2026-04-23):**
> «При смете нужны какие-то минимальные заметки, буквально одно текстовое поле, которое сохраняется и свободно редактируется — никакой истории — просто заметка (можно для красоты сделать жёлтым листочком, типа стикера).»

**Scope:**

- **Backend:** `Estimate.note: TextField(blank=True, default="")`. Миграция добавляет поле. PATCH `/api/v1/estimates/:id/` уже поддерживает partial — только whitelist serializer расширить на `note`.
- **Frontend:** компонент `<EstimateNote>` — textarea с autosave-debounce (500ms) через `estimateApi.update({note})`. Стилизация как жёлтый стикер (background `bg-yellow-100`, лёгкая тень, font `sans` обычный). Разместить в `EstimateHeader` справа либо свёрнуто (иконка → expand).
- **Никакой истории** — value перезаписывается, snapshot не делаем.
- **Лимит:** 5000 символов (разумный cap, чтобы не злоупотребляли).

**Исполнитель:** IS-Петя (backend + migration) + IS-Федя (frontend component + integration).
**Приоритет:** 🟡 minor nice-to-have. Не срочно, после закрытия QA-цикла.

**TD-02 (2026-04-24, backend):**
- `Estimate.note: TextField(blank=True, default="")` добавлено в модель.
- Миграция `0005_estimate_note.py`.
- `EstimateDetailSerializer` расширен `note` + валидация ≤5000 символов.
- PATCH `/api/v1/estimates/:id/` теперь принимает `note` — partial update, overwrite без истории.
- 6 новых тестов (default empty, persist, overwrite-no-history, clear to empty, cap 5000+1, boundary 5000 OK).

### 23. CI валидация golden_llm через GitHub Actions secrets

**Контекст:** `pytest -m golden_llm` пропускается без `OPENAI_API_KEY` в env (skipif). Значит в CI регрессии recall после mergе промпта/парсера не ловятся — видны только при локальном прогоне.

**Решение:** добавить `OPENAI_API_KEY` в GitHub Actions secrets + отдельный workflow `recognition-golden-llm.yml` который запускает `pytest -m golden_llm` (раз в сутки или на PR в `recognition/`). Учесть стоимость (~$0.01 за прогон × N).

**Исполнитель:** IS-Петя + DevOps.
**Файл:** `.github/workflows/recognition-golden-llm.yml` (новый).

---

## Записано
- 2026-04-20: #1 seed_dev_data tech_specs (UI-03, Федя)
- 2026-04-21: #2–5 (UI-PDF-verify, Федя)
- 2026-04-21: #6–7 (E-SEED-01, Федя — TechSpecs schema drift, respx env)
- 2026-04-21: #8–9 (E-MAT-01 минорные, Петя — apply_matches raw SQL, match_item top-3)
- 2026-04-21: #10 (Live PDF-прогон Claude — Recognition JSON parsing BLOCKER)
- 2026-04-21: #11–12 (Вопрос Андрея «что будет с отдельными столбцами Модель/Наименование» — UI-редактирование и Excel round-trip gaps)
- 2026-04-21: #13–16 (E15.03 review минорные — sticky на Vision-пути, хрупкие стампы, SECTION_RE coverage, except без traceback)
- 2026-04-21: #17 (E15.03-hotfix — dedup убран, varchar truncate)
- 2026-04-21: #18–23 (E15.05 — prompt recall 99%, section МОП split, LLM_MIN_ITEMS 142, cost, time, CI golden_llm)
- 2026-04-22: #24 (UI-06 merge rows — atomic bulk-merge endpoint, follow-up к client-side merge)
- 2026-04-22: E16 it1 — **Invoice hybrid parser** (ADR-0026). InvoiceParser
  переписан на SpecParser-паттерн: Phase 0 title block + bbox + multimodal
  retry. Schema расширена (InvoiceItem.lead_time_days/notes/supply_type/
  vat_amount; InvoiceSupplier.address/bank_name/phone; InvoiceMeta.vat_rate/
  contract_ref/project_ref). 2 invoice goldens (ГалВент 4 items, ЛУИС+
  15 items) оба green; dual-regression 3/3 spec goldens не задеты. ТЗ
  «распознавание практически 100% для любых документов» — invoice закрыт,
  следующая итерация E16 it2 (QuoteParser).
