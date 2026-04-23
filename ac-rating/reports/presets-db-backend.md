# Polish-3 backend: пресеты «Своего рейтинга» в БД

**Агент:** AC-Петя
**Ветка:** `ac-rating/presets-db-backend` (worktree `ERP_Avgust_ac_petya_presets_db`)
**База:** `origin/main @ ad575f3`
**ТЗ:** `ac-rating/tz/polish-3-presets-db.md` (секция Backend)

## Что сделано

1. **Модель `RatingPreset`** (`backend/ac_methodology/models.py`).
   Поля: `slug` (unique), `label`, `order`, `is_active`, `description`, M2M `criteria` → `Criterion`, boolean `is_all_selected`. Meta: ordering `['order', 'label']`.

2. **Миграции** (`backend/ac_methodology/migrations/`):
   - `0004_ratingpreset.py` — CreateModel, автогенерация (`makemigrations`).
     Создаёт две таблицы: `ac_methodology_ratingpreset` + M2M join `ac_methodology_ratingpreset_criteria`.
     `sqlmigrate` показывает чистый DDL без `ALTER` существующих колонок.
   - `0005_seed_initial_presets.py` — `RunPython(seed, unseed)`, создаёт 6 стартовых пресетов. Идемпотентная: `update_or_create` по `slug`, повторный запуск не создаёт дублей.
     - `avgust` → `is_all_selected=True`, M2M очищается.
     - `silence` / `cold` / `house` / `allergy` → include-substring эвристика по `code` + `name_ru`.
     - `budget` → exclude-substring (всё, кроме премиум-опций).

3. **Django Admin** (`backend/ac_methodology/admin/rating_preset.py`):
   `RatingPresetAdmin` с `filter_horizontal=('criteria',)` для двухпанельного выбора критериев, `list_display` с `criteria_count` (возвращает `«ВСЕ»` для is_all_selected, иначе число). Зарегистрирован в `admin/__init__.py`.

4. **Serializer** (`backend/ac_catalog/serializers.py`):
   - `RatingPresetSerializer` — shape `{id, slug, label, order, description, is_all_selected, criteria_codes}`.
   - `MethodologySerializer.get_presets()` — один запрос с `prefetch_related('criteria')`, прокидывает в context список кодов активных критериев (для is_all_selected-пресетов). Inactive пресеты (`is_active=False`) исключены.
   - Поле `presets` добавлено в `MethodologySerializer.Meta.fields`.

5. **Тесты** (`backend/ac_methodology/tests/test_rating_preset.py` + дополнения в `backend/ac_catalog/tests/test_api.py`):
   - 4 теста модели (str, ordering, unique slug, M2M, default flag).
   - 4 теста админа (ВСЕ vs count, registration).
   - 8 тестов seed-миграции (6 пресетов есть, avgust.is_all_selected, M2M пустой у all_selected, идемпотентность, реальные substring-фильтры для silence/budget, edge case пустой name_ru).
   - 3 теста serializer (regular/all_selected через context/без context).
   - 4 теста публичного API `/methodology/` (presets в ответе, shape, avgust-пресет возвращает все active codes, is_active=False пресеты исключены).

   **Итого 20 новых тестов**, все зелёные. Полный `pytest ac_methodology ac_catalog` — **136 pass**.

6. **Factory** (`backend/ac_methodology/tests/factories.py`): добавлен `RatingPresetFactory`.

## Коммиты

См. `git log main..HEAD`. Структура из 6 коммитов (model / schema-migration / data-migration / admin / serializer / tests).

## Прогоны

- `sqlmigrate ac_methodology 0004` → чистый CREATE TABLE + M2M join + индексы (никаких ALTER существующих таблиц).
- `sqlmigrate ac_methodology 0005` → `-- THIS OPERATION CANNOT BE WRITTEN AS SQL` (RunPython, без schema changes).
- `migrate --plan` → 2 операции подряд, ничего лишнего.
- `migrate ac_methodology` на локальной dev-БД (34 реальных критерия из дампа Максима) — **OK**. Проверка через shell:
  ```
  0. avgust     is_all_selected=True  criteria=0   (пустой M2M, как и задумано)
  1. silence    is_all_selected=False criteria=4   [noise, inverter, fan_speed_outdoor, fan_speeds_indoor]
  2. cold       is_all_selected=False criteria=4   [heating_capability, evi, drain_pan_heater, standby_heating]
  3. budget     is_all_selected=False criteria=26  (exclude wifi/ionizer/uv/alice/sensor/sterilization/aromat)
  4. house      is_all_selected=False criteria=9   [heat_exchanger_*, compressor_power, evi, heating_capability, ...]
  5. allergy    is_all_selected=False criteria=11  [fine_filters, ionizer_type, uv_lamp, fresh_air, ...]
  ```
- Сериализатор через shell: активная методика (30 активных критериев из 34) возвращает 6 пресетов. `avgust.criteria_codes` имеет длину 30 (= все активные); остальные — выборки 4/4/26/9/11. ✓

## Скриншоты админки

- `presets-db-backend-screens/admin-list.png` — changelist с 6 пресетами (сортировка по `order`, колонка «Критериев» = «ВСЕ» для avgust, числа для остальных).
- `presets-db-backend-screens/admin-detail.png` — change form для «Тишина» с двухпанельным `filter_horizontal` (слева доступные 30 критериев с фильтром, справа 4 выбранных: Inverter / Noise / Fan speed outdoor / Fan speeds indoor).

## Acceptance

- [x] Миграция применяется чисто, 6 пресетов в БД после seed.
- [x] Admin: список пресетов, редактирование через `filter_horizontal` работает.
- [x] API `/methodology/` возвращает `presets` с корректными `criteria_codes`.
- [x] 20 новых тестов зелёные, весь `pytest ac_methodology ac_catalog` 136 pass.
- [x] Прогон на dev-БД (34 реальных критерия) → 6 пресетов, выборки соответствуют ожиданиям.
- [x] Отчёт + скриншоты админки.

## Blockers / заметки для техлида

- **Нет.** Схема простая, миграция чистая (только INSERT/UPDATE), сериализатор backward-compatible (поле `presets` добавлено — не сломает старых клиентов).
- Федя сможет начать после merge моей ветки. Его контракт: `methodology.presets[].criteria_codes: string[]` — уже работает, проверено через serializer + API-тест.
- **Shared файл `backend/finans_assistant/settings.py`** — не трогал.
- **Shared файл `backend/ac_catalog/serializers.py`** — изменил (добавил импорт RatingPreset + RatingPresetSerializer + поле `presets` в MethodologySerializer). Это файл в территории AC Rating, не требует пинга другой команды.

## Установленная зависимость

В `.venv` корневого ERP_Avgust установлен пакет `django-ratelimit==4.1.0` (требовался для `ac_reviews.views`, отсутствовал). Это venv-only изменение, не затрагивает `requirements.txt` (зависимость уже должна быть там — команда проверит).
