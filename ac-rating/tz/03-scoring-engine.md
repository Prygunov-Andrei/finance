# ТЗ Фазы 3 — Scoring engine

**Фаза:** 3 из 10
**Ветка:** `ac-rating/03-scoring` (от `main`)
**Зависит от:** Фаза 2 (модели ac_catalog/ac_methodology/ac_scoring должны быть смержены в `main`)
**Оценка:** 1 день

## Контекст

Интегрируем проект «Рейтинг кондиционеров» в ERP Avgust. Ф1 (скелет 6 apps) и Ф2 (модели + миграции) уже смержены. Сейчас переносим **scoring engine** — пересчёт итогового индекса кондиционеров по весам критериев методики.

Исходник: `ac-rating/review/backend/scoring/` (ветка Максима `2026-03-25-xuef`). Максим сам починил 20 из 23 замечаний из аудита математики в коммите `e2de2de` — брать актуальную версию, не старые копии.

Полный план: `ac-rating/plan.md`. Шаблон отчёта — секция 3 плана.

## Исходные данные

**Источник (НЕ копировать как есть, переименовать импорты):**
- `ac-rating/review/backend/scoring/engine/` → `backend/ac_scoring/engine/`
- `ac-rating/review/backend/scoring/scorers/` → `backend/ac_scoring/scorers/`
- `ac-rating/review/backend/scoring/tests/` → `backend/ac_scoring/tests/`
- `ac-rating/review/backend/scoring/management/commands/recalculate.py` → `backend/ac_scoring/management/commands/recalculate_ac_rating.py`

**Маппинг импортов (глобально по переносимым файлам):**
- `from catalog.models import ACModel, ModelRawValue` → `from ac_catalog.models import ...`
- `from methodology.models import MethodologyCriterion, MethodologyVersion` → `from ac_methodology.models import ...`
- `from scoring.models import CalculationResult, CalculationRun` → `from ac_scoring.models import ...`
- `from scoring.scorers import SCORER_MAP` → `from ac_scoring.scorers import SCORER_MAP`
- `from scoring.scorers.base import BaseScorer, ScoreResult` → `from ac_scoring.scorers.base import ...`
- `from scoring.scorers.brand_age import BrandAgeScorer` → `from ac_scoring.scorers.brand_age import BrandAgeScorer` (аналогично для `fallback`, `lab`)
- `from scoring.engine import recalculate_all` (в команде) → `from ac_scoring.engine import recalculate_all`

**Что брать из ветки Максима:**
```bash
# Максимовская рабочая копия уже лежит локально:
ls /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust/ac-rating/review/backend/scoring/
```

**Celery в ERP уже настроен:**
- `backend/finans_assistant/celery.py` — основной app, автодискавери
- Задачи оформляются как `@shared_task` в модуле `<app>/tasks.py`
- Пример: посмотреть `backend/<любая app>/tasks.py` перед тем как писать свою

## Задачи

### 1. Перенос engine + scorers (без изменений логики)

Скопировать файлы в новую структуру, заменить импорты по таблице выше. Логику **НЕ менять** — все фиксы e2de2de уже в исходнике.

**Структура после переноса:**
```
backend/ac_scoring/
├── engine/
│   ├── __init__.py         # публичный API: recalculate_all, compute_scores_for_model, ...
│   ├── batch.py            # recalculate_all с CalculationRun, select_for_update
│   ├── computation.py      # compute_scores_for_model, _get_scorer, max_possible_total_index
│   └── persistence.py      # calculate_model, update_model_total_index, refresh_all_...
├── scorers/
│   ├── __init__.py         # SCORER_MAP dict
│   ├── base.py             # BaseScorer + ScoreResult dataclass
│   ├── binary.py           # BinaryScorer (с is_inverted — фикс #4-5 уже в исходнике)
│   ├── brand_age.py        # BrandAgeScorer
│   ├── categorical.py      # CategoricalScorer (фикс #15)
│   ├── custom_scale.py     # CustomScaleScorer (конвенция [from, to) — фикс #2)
│   ├── fallback.py         # FallbackScorer (все в ваттах — фикс #3)
│   ├── formula.py          # FormulaScorer
│   ├── lab.py              # LabScorer (whitelist measured — фикс #16)
│   └── numeric.py          # NumericScorer (детерминизм — фикс #8)
├── tests/
│   ├── __init__.py
│   ├── test_engine.py      # 234 строки — не редактировать логику
│   └── test_scorers.py     # 440 строк
└── management/
    └── commands/
        └── recalculate_ac_rating.py   # переименована из recalculate.py
```

### 2. Management command

Переименовать `recalculate.py` → `recalculate_ac_rating.py`. Логику сохранить, но **добавить** аргумент `--methodology-id` (чтобы можно было пересчитать по не-активной методике тоже — нужно для Ф8B). Сигнатура:

```
python manage.py recalculate_ac_rating [--model-ids N1 N2 ...] [--methodology-id M]
```

По умолчанию (без аргументов) — текущее поведение: активная методика + все модели.

### 3. Celery task — новая, Максим этого не делал

Создать `backend/ac_scoring/tasks.py`:

```python
from celery import shared_task
from ac_methodology.models import MethodologyVersion
from .engine import recalculate_all


@shared_task(name="ac_scoring.recalculate_all")
def recalculate_all_task(methodology_id: int | None = None, model_ids: list[int] | None = None) -> dict:
    methodology = None
    if methodology_id is not None:
        methodology = MethodologyVersion.objects.get(pk=methodology_id)
    run = recalculate_all(methodology=methodology, model_ids=model_ids)
    return {
        "run_id": run.pk,
        "status": run.status,
        "models_processed": run.models_processed,
    }
```

Точное имя `ac_scoring.recalculate_all` важно — оно будет упоминаться в Ф8B (админская кнопка «Пересчитать»).

### 4. Signal на MethodologyVersion.save()

Создать `backend/ac_scoring/signals.py`:

- Подписаться на `post_save` для `MethodologyVersion`
- Если `needs_recalculation=True` **и** `is_active=True` — enqueue `recalculate_all_task.delay(methodology_id=instance.pk)`
- Защитить от рекурсии: `recalculate_all` сбрасывает `needs_recalculation=False` через `update_fields`, это не должно триггерить signal повторно (проверь — если триггерит, добавь проверку `update_fields` в receiver)

Подключить signals в `ac_scoring/apps.py` (в `ready()`):
```python
class AcScoringConfig(AppConfig):
    name = "ac_scoring"
    verbose_name = "Рейтинг: scoring"

    def ready(self) -> None:
        from . import signals  # noqa: F401
```

### 5. Документ known-issues

Создать `docs/ac_rating/known-issues.md` (каталог `docs/ac_rating/` создать если нет). Содержимое — 3 замечания из аудита математики, которые Максим НЕ исправил в e2de2de (они не блокирующие):

1. **Fan speeds gap** — пропуски между ступенями скорости вентилятора не учитываются при скоринге. Last status: принято, не блокирует. Документировать точную локацию в коде (`ac_scoring/scorers/numeric.py`?) и описать что именно не учитывается.
2. **Decimal vs Float** — где-то используется `float` вместо `Decimal` для денег/весов. Уточнить место по grep `Decimal|float` в `ac_scoring/` и `ac_methodology/`. Зафиксировать решение: «мы принимаем погрешность float для индекса, так как верхняя граница — 100».
3. **Help_text** — у части полей методики не указан `help_text` в `Criterion` / `MethodologyCriterion`. Документировать как UX-долг, исправим в Ф8B (редактирование методик).

Для каждого пункта: `## Title`, `**Статус:** accepted`, `**Почему не блокирует:**`, `**Локация:**` (пути и, если уместно, строки), `**Возможное будущее решение:**`.

### 6. Тесты

**Копируем как есть.** Фиксы уже в исходнике, тесты к ним уже есть. Запускать:
```bash
cd backend && ./venv/bin/python -m pytest ac_scoring/tests/ -v
```

**Дополнительно написать** один тест на Celery task (`tests/test_tasks.py`):
- Создать методику + модель (через factories из Ф2)
- Вызвать `recalculate_all_task(methodology_id=m.pk)` напрямую (sync, без Celery broker)
- Убедиться что `total_index` пересчитан

И один тест на signal (`tests/test_signals.py`):
- Создать методику с `is_active=True, needs_recalculation=False`
- Поменять на `needs_recalculation=True`, вызвать `.save()`
- Замокать `recalculate_all_task.delay` и убедиться что вызвана с правильным `methodology_id`

### 7. Настройки Celery для dev

Если в dev-settings ERP ещё нет `CELERY_TASK_ALWAYS_EAGER=True` — **не добавлять**. Это решение за Ф3 — использовать реальный broker (Redis) или eager. Если в ERP уже настроен eager для тестов — ОК, пользуемся.

Проверить перед началом:
```bash
grep -rE "CELERY_TASK_ALWAYS_EAGER|CELERY_BROKER_URL" backend/finans_assistant/
```

## Приёмочные критерии

- [ ] `./venv/bin/python -m pytest ac_scoring/tests/ -v` — все тесты зелёные (включая новые test_tasks.py, test_signals.py)
- [ ] `./venv/bin/python manage.py recalculate_ac_rating` работает без данных (no-op — говорит «Нет активной методики» через ValueError или выводит ноль моделей) и с тестовой методикой (создать вручную через shell для smoke-проверки)
- [ ] `./venv/bin/python manage.py check` — чисто
- [ ] `./venv/bin/python manage.py makemigrations --dry-run` — чисто (scoring не должен добавить новых миграций — модели в Ф2)
- [ ] В `docs/ac_rating/known-issues.md` есть все 3 пункта с точными локациями
- [ ] `grep -rE "from (catalog|methodology|scoring)\." backend/ac_scoring/` — **пусто** (все импорты переписаны на `ac_*`)
- [ ] `from ac_scoring.engine import recalculate_all` работает из shell
- [ ] Celery task зарегистрирована: `from ac_scoring.tasks import recalculate_all_task` работает, имя `ac_scoring.recalculate_all`

## Ограничения

- **НЕ трогать** `backend/catalog/`, `backend/methodology/`, `backend/scoring/` — эти apps в ERP принадлежат другим функциям (внимание: в ERP тоже есть `catalog` — это каталог товаров, не кондиционеры). Все новые файлы только в `ac_scoring/`.
- **НЕ менять** логику scoring — Максим уже починил 20 багов в `e2de2de`, регрессий не хотим. Только переименование импортов и новые файлы (tasks.py, signals.py).
- **НЕ редактировать** существующие миграции.
- **НЕ коммитить** секреты/`.env`.
- Conventional Commits, маленькие коммиты. Логически: отдельные коммиты для (1) перенос engine+scorers+tests, (2) tasks+signals, (3) management command, (4) docs.

## Формат отчёта

Положить в `ac-rating/reports/03-scoring-engine.md` с секциями:
1. Имя ветки и список коммитов (`git log --oneline main..HEAD`)
2. Что сделано (bullet-list)
3. Что НЕ сделано и почему (если есть)
4. Результаты прогонов: `pytest ac_scoring/`, `manage.py check`, `makemigrations --dry-run`, smoke-запуск management command
5. Известные риски / предупреждения (особенно если что-то руками перестроил из-за ERP-специфики)
6. Ключевые файлы для ревью (с путями и строками)

## Подсказки от техлида (не требование, но помогут)

- **Проверь конфликт имён:** в ERP есть модуль `backend/catalog/` — это НЕ рейтинг, это каталог товаров ERP. Убедись что import во всём `ac_scoring/` ссылается именно на `ac_catalog.models.ACModel`, а не случайно на `catalog.models.*`.
- **Transaction boundary в batch.py:** у Максима `recalculate_all` делает два `transaction.atomic()` — один для захвата lock + создания run, другой для расчёта. Это правильный паттерн (lock не держит расчёт). НЕ объединяй в один.
- **`update_fields=["needs_recalculation", "updated_at"]`** в `batch.py:63-64` — в Ф3 signal должен проверять `update_fields` чтобы не зациклиться. Если приходит update_fields, содержащий только `needs_recalculation` и `updated_at`, а значение стало `False` — НЕ ставить в очередь.
- **Celery broker:** если в dev настроен Redis — оставь real broker. Если нет — используй eager только в test settings (не в dev).
- **Факт про scorers:** `SCORER_MAP` диспатчит по `scoring_type`, но `_get_scorer` в `computation.py` сначала проверяет `value_type` (`brand_age`, `fallback`, `lab`) — это **специальные scorers вне карты**. Это by design, сохранить как есть.
