# Фаза 3: Scoring engine — отчёт

**Ветка:** `ac-rating/03-scoring` (от `main`, поверх Ф2)
**Дата:** 2026-04-18

**Коммиты** (`git log --oneline main..HEAD`):

- `f37d24c` feat(ac-rating): port scoring engine + scorers + tests (фаза 3)
- `0190cf9` feat(ac-rating): Celery task, signal, management command (фаза 3)
- `e3357c4` docs(ac-rating): known-issues с 3 не-блокирующими замечаниями (фаза 3)
- (+ этот отчёт отдельным docs-коммитом)

## Что сделано

### 1. Engine + scorers + tests (1-в-1 с источника)

Перенесены 14 файлов из `ac-rating/review/backend/scoring/` в `backend/ac_scoring/`. Логика **не менялась** — все фиксы Максима из `e2de2de` уже в исходнике. Заменены только импорты:

| Было (источник) | Стало (ERP) |
|---|---|
| `from catalog.models import ...` | `from ac_catalog.models import ...` |
| `from methodology.models import ...` | `from ac_methodology.models import ...` |
| `from scoring.models import ...` | `from ac_scoring.models import ...` |
| `from scoring.scorers import SCORER_MAP` | `from ac_scoring.scorers import SCORER_MAP` |
| `from scoring.scorers.* import *` | `from ac_scoring.scorers.* import *` |
| `from scoring.engine import recalculate_all` | `from ac_scoring.engine import recalculate_all` |
| `from brands.models import Brand` | `from ac_brands.models import Brand` |

**Структура:**
```
backend/ac_scoring/
├── engine/
│   ├── __init__.py        # публичный API (recalculate_all, …)
│   ├── batch.py           # recalculate_all с CalculationRun + select_for_update
│   ├── computation.py     # compute_scores_for_model, _get_scorer, max_possible_total_index
│   └── persistence.py     # calculate_model, update_model_total_index, refresh_all_…
├── scorers/
│   ├── __init__.py        # SCORER_MAP
│   ├── base.py            # BaseScorer + ScoreResult
│   ├── binary.py          # respect is_inverted (audit fix #4-5)
│   ├── brand_age.py       # инверсия by design
│   ├── categorical.py     # custom_scale выключает QUALITY_KEYWORDS (fix #15)
│   ├── custom_scale.py    # [from, to) (fix #2)
│   ├── fallback.py        # всё в ваттах (fix #3); fallback_score из brand origin
│   ├── formula.py         # interval scale через formula_json
│   ├── lab.py             # whitelist measured (fix #16)
│   └── numeric.py         # детерминированный pick медианы (fix #8)
├── tests/
│   ├── test_engine.py     # 15 тестов — happy path + edge cases
│   └── test_scorers.py    # 53 теста (включая parametrize)
├── management/commands/
│   └── recalculate_ac_rating.py   # переименована из recalculate.py + --methodology-id
├── tasks.py               # @shared_task ac_scoring.recalculate_all
└── signals.py             # post_save MethodologyVersion → enqueue
```

### 2. Side-effect: ac_catalog/sync_brand_age.py + ac_catalog/signals.py

Тест `test_sync_brand_age_for_model_updates_raw_value` зависит от утилиты `sync_brand_age_for_model` и сигнала `Brand.post_save`, которые в источнике лежат в `catalog/`, а не в `scoring/`. Эти файлы перенесены в **ac_catalog/** (а не ac_scoring/), так как они принадлежат каталогу:

- `backend/ac_catalog/sync_brand_age.py` — функции `sync_brand_age_for_model/_for_brand`, `flag_active_methodology_recalc`. Импорты переписаны на ac_*.
- `backend/ac_catalog/signals.py` + `apps.AcCatalogConfig.ready()` — `post_save` Brand с условием по `update_fields ⊆ {sales_start_year_ru, origin_class_id}`; запускает `sync_brand_age_for_brand` + `update_model_total_index` для всех моделей бренда.

ТЗ это явно не требовало, но без этих файлов scoring-тесты Максима не пройдут (они уже опираются на сигнал). Перенос трактую как «Часть домена ac_catalog, которая нужна для прохождения переносимых тестов scoring».

### 3. Management command

`backend/ac_scoring/management/commands/recalculate_ac_rating.py`:
- Сохранена логика источника (`recalculate.py`).
- **Новый аргумент** `--methodology-id N` — по умолчанию None → активная методика; если указан, `MethodologyVersion.objects.get(pk=N)` (CommandError при отсутствии). Пригодится Ф8B для предпросмотра пересчёта по неактивной методике.
- Сигнатура: `manage.py recalculate_ac_rating [--model-ids N1 N2 …] [--methodology-id M]`.

### 4. Celery task — `ac_scoring.tasks.recalculate_all_task`

`@shared_task(name="ac_scoring.recalculate_all")` — точное имя по ТЗ (для будущей админской кнопки в Ф8B). Сигнатура `(methodology_id=None, model_ids=None) → dict{run_id, status, models_processed}`. Тонкая обёртка над `engine.recalculate_all`. Celery в ERP уже настроен (`finans_assistant/celery.py` autodiscover), отдельная регистрация не нужна.

### 5. Signal MethodologyVersion → enqueue

`backend/ac_scoring/signals.py`:
- `post_save(MethodologyVersion)` с `dispatch_uid="ac_scoring.enqueue_recalc"`.
- Условие: `is_active=True AND needs_recalculation=True` → `recalculate_all_task.delay(methodology_id=instance.pk)`.
- **Защита от рекурсии:** если `update_fields` пришёл и **полностью** входит в `{"needs_recalculation", "updated_at"}` (это набор, который сам движок сбрасывает в `batch.py:64`), сигнал ничего не делает. Покрыто тестом `test_signal_recursion_guard_on_engine_reset_update_fields`.
- Подключено через `AcScoringConfig.ready()`.

### 6. Тесты

| Файл | Тестов | Источник |
|---|---|---|
| `tests/test_engine.py` | 15 | Перенесены 1-в-1, импорты переписаны. |
| `tests/test_scorers.py` | 53 (parametrize) | Перенесены 1-в-1. |
| `tests/test_tasks.py` | 3 | **Новые** — sync-вызов task: возвращает summary с `run_id/status/models_processed`, использует активную методику без `methodology_id`, фильтрует по `model_ids`. |
| `tests/test_signals.py` | 4 | **Новые** — `delay()` вызывается только при `is_active=True & needs_recalculation=True`; не вызывается при `is_active=False`, при сохранении без `needs_recalculation`, и при «движковом» `update_fields={needs_recalculation, updated_at}`. |
| `tests/test_models.py` | 3 | Из Ф2, без изменений. |
| **Всего ac_scoring** | **78** (по `pytest -v`) | |

### 7. Известно про Celery dev-настройки

В `backend/finans_assistant/settings.py` уже есть:
- `CELERY_BROKER_URL` (default `redis://localhost:6379/0`)
- `CELERY_TASK_ALWAYS_EAGER` (env-overridable, default `false`)

Для тестов Celery не запускался реально — `recalculate_all_task` вызывается напрямую как функция; для signal-теста `recalculate_all_task.delay` мокается. Production-режим — реальный Redis-брокер; eager-mode — только для тестов через env (не в settings.py хардкодится).

## Что НЕ сделано

- API/сериализаторы/views для CalculationRun/CalculationResult — это Ф4.
- Periodic Celery beat для регулярного пересчёта — не было в ТЗ.
- Health-check команда «есть ли стейл методики» — не было в ТЗ.
- Не трогал `backend/scoring/`, `backend/catalog/`, `backend/methodology/` — этих app в ERP нет (ERP-шный `catalog/` — это каталог товаров, не модели кондиционеров; не путать).

## Результаты проверок

| Проверка | Команда | Результат |
|---|---|---|
| `manage.py check` | `./venv/bin/python manage.py check` | ✅ `0 issues` |
| `makemigrations --dry-run` | `./venv/bin/python manage.py makemigrations --dry-run` | ✅ `No changes detected` (моделей не добавлял) |
| Чистота импортов | `grep -rE "from (catalog\|methodology\|scoring\|brands\|reviews\|submissions)\." backend/ac_scoring/` | ✅ пусто (все импорты на `ac_*`) |
| Импорт engine из shell | `from ac_scoring.engine import recalculate_all` | ✅ |
| Celery task зарегистрирована | `recalculate_all_task.name == "ac_scoring.recalculate_all"` | ✅ |
| `pytest ac_scoring/tests/` | `pytest ac_scoring/tests/ --no-cov` | ✅ **78 passed** |
| `pytest ac_*/tests/` (Ф2 + Ф3) | весь блок ac_brands/methodology/catalog/scoring/reviews/submissions | ✅ **120 passed** (45 моделей + 75 scoring/signals/tasks) |
| Smoke command (no methodology) | `manage.py recalculate_ac_rating` без активной методики | ✅ `ValueError: Нет активной методики` (как требует ТЗ) |
| Smoke command (с методикой) | через shell создал MethodologyVersion+Criterion+ACModel+raw_value, затем `recalculate_ac_rating` | ✅ `Расчёт #1 завершён: 1 моделей, статус: Завершён`, `total_index = 100.0` |
| Smoke command (с аргументами) | `recalculate_ac_rating --methodology-id 1 --model-ids 1` | ✅ `Расчёт #2 завершён: 1 моделей` |
| `--help` | `recalculate_ac_rating --help` | ✅ показывает оба аргумента |

Прогон проводился на локальном PostgreSQL (`localhost:5432`, БД `finans_assistant`), миграции `ac_*` применены через `manage.py migrate ac_brands … ac_submissions`. Smoke-данные после проверки удалены.

## Известные риски / предупреждения

1. **`ac_catalog/signals.py` тоже подключён в `ready()` — теперь Brand.save() триггерит синк raw_value + пересчёт total_index у всех моделей бренда.** Это поведение источника (Максим так делал); если ERP-сторона начнёт массово править бренды (например, импорт), это может вызвать всплеск нагрузки на пересчёт. Митигация — фильтр `update_fields ⊆ {sales_start_year_ru, origin_class_id}` уже стоит. Но если кто-то вызовет `brand.save()` без `update_fields` (типичный pattern), сигнал отработает на полную. Зафиксировано как side-effect.
2. **`update_model_total_index` в сигнале гоняется синхронно для каждой модели бренда.** На большом каталоге (>500 моделей одного бренда) это блокирующий сабж в `Brand.save()`. Для прода — рассмотреть перенос в Celery (через тот же `recalculate_all_task` с `model_ids`); пока не делал, чтобы остаться 1-в-1 с поведением Максима.
3. **`CELERY_TASK_ALWAYS_EAGER` не выставлен глобально для тестов.** Тестам `test_tasks.py` и `test_signals.py` не нужно реальное eager — мы либо вызываем task синхронно через `()`, либо мокаем `.delay`. В test settings (если появятся отдельные dev/test) `CELERY_TASK_ALWAYS_EAGER=True` выставлять не стал — ТЗ запретило менять settings.
4. **`needs_recalculation` reset через `update_fields=["needs_recalculation","updated_at"]`** в `engine/batch.py:64`. Защита в сигнале опирается на это _точное_ множество. Если кто-то поменяет порядок/состав этих полей в batch.py — рекурсия вернётся. Зафиксировано в комментарии в `signals.py` (`_ENGINE_RESET_FIELDS`); `test_signals.py` тестирует именно это множество.
5. **PG2-тесты Ф2 не сломаны:** все 45 тестов `ac_brands/methodology/catalog/reviews/submissions` зелёные (часть теста `test_models.py` ac_scoring тоже из Ф2 — 3 шт, проверены вместе).
6. **Полный ERP `pytest`** (с baseline-cross-contamination, описанным в Ф2) — не прогонял отдельно, так как ТЗ Ф3 этого не требует, а cross-contamination не связан с моими изменениями (ac_* добавляются аддитивно).
7. **Был эпизод:** при коммите по ошибке оказался на `main` (видимо, я где-то набрал `git checkout main` для проверки и не вернулся). Откатил `main` к `6acffe6` через `git update-ref` (commit `f37d24c` остался на ветке `ac-rating/03-scoring` без потерь). Не критично — ничего не было запушено.

## Ключевые файлы для ревью

- `backend/ac_scoring/engine/batch.py` — `recalculate_all`: два `transaction.atomic()` (lock + расчёт), сброс `needs_recalculation` через `update_fields=["needs_recalculation","updated_at"]` (строка 64).
- `backend/ac_scoring/engine/computation.py:24-40` — `_get_scorer`: специальные scorers (`brand_age`, `fallback`, `lab`) **вне** `SCORER_MAP`, диспатч сначала по `value_type`, потом по `scoring_type`.
- `backend/ac_scoring/signals.py` — receiver + `_ENGINE_RESET_FIELDS` для recursion-guard. Особое внимание на `dispatch_uid`.
- `backend/ac_scoring/tasks.py` — точное имя `ac_scoring.recalculate_all` (важно для Ф8B).
- `backend/ac_scoring/management/commands/recalculate_ac_rating.py` — добавлен `--methodology-id` (CommandError если pk не найден).
- `backend/ac_catalog/signals.py` + `backend/ac_catalog/sync_brand_age.py` — перенесены из источника как side-effect (нужны для test_engine).
- `backend/ac_catalog/apps.py` + `backend/ac_scoring/apps.py` — оба содержат `ready()` с импортом `signals`.
- `docs/ac_rating/known-issues.md` — 3 не-блокирующих пункта аудита с локациями и решением.
