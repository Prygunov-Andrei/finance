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

### 16. spec_parser._process_page — except Exception без traceback

**Контекст:** `recognition/app/services/spec_parser.py:_process_page` ловит `Exception` на уровне страницы и пишет `logger.warning(...)` со `str(e)`. Traceback теряется — регрессию в `parse_page_items` (например падение на edge-case строк) поймаем только по items, не по stack.

**Решение:** Заменить на `logger.exception("spec_parse page error", extra={...})` — добавит traceback в JSON log. Либо сохранять traceback в `state.errors` для диагностики.

**Исполнитель:** IS-Петя.
**Файл:** `recognition/app/services/spec_parser.py:_process_page` (последний `except`).

---

## Записано
- 2026-04-20: #1 seed_dev_data tech_specs (UI-03, Федя)
- 2026-04-21: #2–5 (UI-PDF-verify, Федя)
- 2026-04-21: #6–7 (E-SEED-01, Федя — TechSpecs schema drift, respx env)
- 2026-04-21: #8–9 (E-MAT-01 минорные, Петя — apply_matches raw SQL, match_item top-3)
- 2026-04-21: #10 (Live PDF-прогон Claude — Recognition JSON parsing BLOCKER)
- 2026-04-21: #11–12 (Вопрос Андрея «что будет с отдельными столбцами Модель/Наименование» — UI-редактирование и Excel round-trip gaps)
- 2026-04-21: #13–16 (E15.03 review минорные — sticky на Vision-пути, хрупкие стампы, SECTION_RE coverage, except без traceback)
