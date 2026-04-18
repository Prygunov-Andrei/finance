# Фаза 2: Модели и миграции — отчёт

**Ветка:** `ac-rating/02-models` (от `main`, поверх Ф1)
**Дата:** 2026-04-18

**Коммиты** (`git log --oneline main..HEAD`):

- `d5abc02` feat(ac-rating): port models and clean initial migrations for 6 apps
- `7f27a6e` test(ac-rating): factory-boy + unit tests for ac_* models (45 tests)
- `78409d0` chore(ac-rating): include ac_* in pytest testpaths + criteria media dir
- (+ этот отчёт отдельным docs-коммитом)

## Что сделано

### Модели (14 штук)

| App | Модель | Источник | Особенности переноса |
|---|---|---|---|
| `ac_brands` | `BrandOriginClass` | `brands/models.py` | TimestampedModel |
| `ac_brands` | `Brand` | `brands/models.py` | `logo` upload_to → `ac_rating/brands/`, verbose_name «(рейтинг кондиционеров)» |
| `ac_methodology` | `MethodologyVersion` | `methodology/models.py` | `save()` сохраняет инвариант «единственная активная» |
| `ac_methodology` | `Criterion` | `methodology/models.py` | `photo` upload_to → `ac_rating/criteria/` |
| `ac_methodology` | `MethodologyCriterion` | `methodology/models.py` | `clean()` со всеми проверками min/median/max и совместимости value_type×scoring_type; `_INCOMPATIBLE_SCORING`; proxy-properties code/value_type/name_*/description_*/unit |
| `ac_catalog` | `EquipmentType` | `catalog/models.py` | без TimestampedModel (как у источника), verbose_name «(рейтинг кондиционеров)» |
| `ac_catalog` | `ACModel` | `catalog/models.py` | FK на `'ac_brands.Brand'` строкой; `save()`: `_normalize_unit_names()` (upper) + `_generate_slug()`; PublishStatus choices |
| `ac_catalog` | `ModelRegion` | `catalog/models.py` | UniqueConstraint `unique_acmodel_region` |
| `ac_catalog` | `ModelRawValue` | `catalog/models.py` | FK на `'ac_methodology.Criterion'` строкой; `save()`: автокопия `criterion_code`; два partial UniqueConstraint (с criterion и без); FK на user через `settings.AUTH_USER_MODEL` с `ac_entered_values` / `ac_approved_values` related_name |
| `ac_catalog` | `ACModelPhoto` | `catalog/models.py` | upload_to → `ac_rating/photos/` |
| `ac_catalog` | `ACModelSupplier` | `catalog/models.py` | без изменений |
| `ac_scoring` | `CalculationRun` | `scoring/models.py` | FK на `'ac_methodology.MethodologyVersion'` строкой; `triggered_by` → `settings.AUTH_USER_MODEL` |
| `ac_scoring` | `CalculationResult` | `scoring/models.py` | FK на ac_catalog/ac_methodology строкой; UniqueConstraint `unique_run_acmodel_criterion` |
| `ac_reviews` | `Review` | `reviews/models.py` | FK на `'ac_catalog.ACModel'` строкой; rating-валидаторы 1..5 |
| `ac_submissions` | `ACSubmission` | `submissions/models.py` | FK на `'ac_brands.Brand'` и `'ac_catalog.ACModel'` строкой; `save()`: `_compute_surface_areas()` — π × d × L × n / 1e6 для inner и outer теплообменников |
| `ac_submissions` | `SubmissionPhoto` | `submissions/models.py` | upload_to → `ac_rating/submissions/` |

Не переносится: `methodology.CriterionGroup` — deprecated в плане.

### Утилиты

- `backend/ac_catalog/utils.py` — транслитерация (RU→LAT) + `slugify_part` + `generate_acmodel_slug`. Поведение 1-в-1 с источником, включая нюанс многосимвольных замен (Ш→SH, при первом символе uppercase следующий остаётся уппер: «Шум» → «SHum»).

### Миграции

Чистые initial миграции, сгенерированы `manage.py makemigrations ac_brands ac_methodology ac_catalog ac_scoring ac_reviews ac_submissions`. Зависимости вычислены Django автоматически. Старые миграции Максима НЕ копировали (clean initial — по плану).

### Фабрики и тесты

В каждом app:
- `tests/factories.py` — фабрики на каждую модель, минимально-валидные дефолты
- `tests/test_models.py` — 45 тестов суммарно (3 + 13 + 16 + 3 + 3 + 7)

Покрытие тестами:
- `__str__()` каждой модели
- `ACModel.save()`: нормализация регистра, генерация и сохранение slug, drop пустого outer_unit
- `ACSubmission.save()`: формула площади на create и на update, fallback на custom_brand_name в `__str__`
- `MethodologyVersion.save()`: создание новой активной версии деактивирует старую, апдейт текущей активной её не трогает
- `MethodologyCriterion.clean()`: 7 веток валидации (min>max, median вне диапазона, негативный weight, несовместимый scoring_type для binary, обязательность min/max для MIN_MEDIAN_MAX, обязательность JSON для CUSTOM_SCALE и FORMULA)
- `MethodologyCriterion` proxy-properties (`code`, `value_type`, `name_ru/en`, `unit`)
- `ModelRawValue.save()`: автокопирование `criterion.code` в `criterion_code`, поведение orphan-кода когда criterion=None
- `Review` валидаторы rating 1..5
- `catalog.utils`: транслитерация (3 случая), slugify_part, generate_acmodel_slug

### Прочее

- `pytest.ini`: добавил 6 ac_* apps в `testpaths` — теперь дефолтный `pytest` собирает 1817 тестов (1772 базовых + 45 новых)
- `backend/media/ac_rating/criteria/.gitkeep` — каркас для Criterion.photo (photos/brands/submissions были созданы в фазе 1)

## Что НЕ сделано

- Админ-регистрации, сериализаторы, URL-роуты, signals, scoring engine, импорт данных — это фазы 3-5, осознанно не трогалось.
- `pytest --cov` для ac_* apps — coverage entries в pytest.ini не добавлял (по плану эти apps дойдут до coverage в фазе 4 вместе с views/serializers).

## Результаты проверок

| Проверка | Команда | Результат |
|---|---|---|
| `manage.py check` | `./venv/bin/python manage.py check` | ✅ `0 issues` |
| `makemigrations --dry-run` | `./venv/bin/python manage.py makemigrations --dry-run` | ✅ `No changes detected` (модели в синхронии с миграциями) |
| Создание initial миграций | `./venv/bin/python manage.py makemigrations ac_brands ac_methodology ac_catalog ac_scoring ac_reviews ac_submissions` | ✅ 6 файлов `0001_initial.py` создано (см. таблицу выше) |
| Применение миграций на чистой БД | автоматически через pytest-django (создаёт `test_finans_assistant`, гонит все миграции) | ✅ Миграции применились без ошибок (45 тестов, использующих БД, прошли) |
| Тесты ac_* | `pytest ac_brands ac_methodology ac_catalog ac_scoring ac_reviews ac_submissions --no-cov` | ✅ **45 passed**, 0 failed |
| `pytest --collect-only` | `pytest --collect-only --no-cov` | ✅ `1817 tests collected` (было 1772, +45) |
| Полный `pytest` ERP | `pytest --no-cov` | ⚠️ **1284 passed, 353 failed, 127 errors, 10 skipped**. **Не регрессия** — те же 353 failed + 127 errors воспроизводятся при `pytest --ignore=ac_brands --ignore=...` (то есть **без** моих новых тестов вообще). Проверены 2 случайные «failed» (`accounting/tests/test_models.py`, `fns/tests/test_views.py::TestFNSStatsView::test_not_configured`) — при запуске изолированно проходят. То есть это test-cross-contamination в локальной PG-базе (общая, не очищается между группами тестов), не связано с моими моделями.

**БД для прогона:** локальный Postgres `localhost:5432` (контейнер ERP-стенда), пользователь `postgres`, база `finans_assistant`. SSH-туннель к проду (`:15432`) не использовался — pytest-django создаёт собственную `test_finans_assistant` для тестов.

## Известные риски / предупреждения

1. **Test cross-contamination в полном прогоне ERP.** 353 failed + 127 errors существовали и до моих изменений. Это инфраструктурный baseline-риск, который стоит починить отдельно (вероятно, конфигурация `pytest --reuse-db` / state cleanup), но не блокирует фазу 2. Документирую факт: мои изменения не ухудшили ситуацию.
2. **`unique_methodology_criterion` имя без префикса `ac_`.** Constraint `models.UniqueConstraint(name='unique_methodology_criterion')` оставлен 1-в-1 с источника. Имена констрейнтов глобальны в Postgres только в пределах схемы — конфликта нет, но если в ERP когда-нибудь появится одноимённый constraint, нужно будет переименовать. Рекомендую для фазы 3-4 «причесать» именования к `unique_ac_methodology_criterion`. Не критично сейчас.
3. **`mc_weight_non_negative` (CheckConstraint).** Аналогично — без префикса `ac_`. Без действий сейчас.
4. **CheckConstraint API.** Django 4.2.7 принимает `check=`, не `condition=` (в Django 5 переименовали в `condition`). Сейчас работает, но при апгрейде Django до 5+ потребуется обратная замена.
5. **`ACModel.brand` через PROTECT.** Нельзя удалить бренд, если есть привязанные модели. Это поведение источника, не меняю. Стоит зафиксировать в админке Ф4 удобный UX «архивации» бренда вместо delete.
6. **`ModelRawValue.entered_by/approved_by` related_name.** Добавил префикс `ac_` (`ac_entered_values`, `ac_approved_values`) на случай потенциальных конфликтов с будущими ERP-моделями. У источника был `entered_values` / `approved_values`.
7. **EquipmentType / ModelRegion / CalculationRun / CalculationResult** — без TimestampedModel (как у источника). Если в ERP-конвенции хочется унифицировать — это решение фазы рефакторинга, не моя сейчас.
8. **`ACModelPhoto.image` — `upload_to='ac_rating/photos/'`.** Не `null=False/True` — поле обязательное (default Django). Источник такой же.
9. **`SubmissionPhoto` БЕЗ TimestampedModel в источнике.** Я наследую от TimestampedModel — у Максима тоже от TimestampMixin, который имеет `created_at/updated_at`. Совпадение.
10. **`MethodologyVersion.save()` без транзакции.** Деактивация других активных версий и сохранение текущей идут двумя SQL-запросами вне транзакции. У источника такая же реализация. Гонок в Django shell локально нет, но в проде под нагрузкой возможно окно. Документирую как known issue для фазы 8B (когда будет UI клонирования методик с транзакционной обёрткой).

## Ключевые файлы для ревью

- `backend/ac_methodology/models.py:223-265` — `MethodologyCriterion.clean()` со всеми ветками валидации
- `backend/ac_catalog/models.py:78-95` — `ACModel._normalize_unit_names()` и `_generate_slug()`
- `backend/ac_catalog/utils.py` — транслитерация и slug-генератор (особенно поведение многосимвольных замен)
- `backend/ac_submissions/models.py:134-154` — `_compute_surface_areas()` (формула π × d × L × n)
- `backend/ac_methodology/models.py:47-52` — инвариант «единственная активная методика»
- `backend/ac_catalog/models.py:194-205` — два partial UniqueConstraint (`criterion__isnull=True/False`)
- `backend/ac_*/migrations/0001_initial.py` — авто-сгенерированные миграции, имеет смысл скользящим взглядом убедиться, что граф зависимостей корректен (ac_methodology → ac_brands; ac_catalog → ac_brands + ac_methodology + AUTH_USER_MODEL; ac_scoring → ac_catalog + ac_methodology + AUTH_USER_MODEL; ac_reviews → ac_catalog; ac_submissions → ac_brands + ac_catalog)
- `backend/pytest.ini` — добавлены ac_* в testpaths
