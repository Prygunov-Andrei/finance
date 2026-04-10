# Подбор работ — Документация разработчика

## Архитектура

Двухпроходный pipeline подбора расценок для строк сметы. Работает в фоне через Celery + Redis.

### Структура файлов

```
backend/estimates/services/work_matching/
    __init__.py          → exports WorkMatchingService
    service.py           → Оркестратор (Redis-сессии, start/cancel/apply)
    pipeline.py          → Контекст + match_single_item() / match_single_item_fast()
    tiers.py             → 8 уровней подбора (классы Tier0-Tier7)
    knowledge.py         → Накопление знаний в ProductKnowledge + .md
    man_hours.py         → Расчёт человеко-часов

backend/estimates/tasks_work_matching.py  → Celery task + crash recovery
backend/estimates/apps.py                → ready() для регистрации задач

data/knowledge/products/                  → .md файлы базы знаний
```

### Регистрация Celery-задач

`tasks_work_matching.py` имеет нестандартное имя (не `tasks.py`), поэтому Celery не обнаруживает его через `autodiscover_tasks()`. Регистрация обеспечивается через `EstimatesConfig.ready()` в `apps.py`:

```python
def ready(self):
    import estimates.tasks_work_matching  # noqa: F401
```

Если убрать этот импорт, Celery worker не сможет выполнять задачи подбора работ.

### 8 уровней подбора

| # | Уровень | Source | Confidence | Условие |
|---|---------|--------|-----------|---------|
| 0 | Default (Product.default_work_item) | `default` | 1.0 | Есть product с расценкой |
| 1 | History (ProductWorkMapping) | `history` | 0.6-0.95 | Есть product, usage >= 2 (или 1 для MANUAL) |
| 2 | PriceList-scoped fuzzy | `pricelist` | score × 0.9 | Есть estimate.price_list |
| 3 | Knowledge base (ProductKnowledge) | `knowledge` | × 0.9-1.1 | Есть запись в базе знаний |
| 4 | Category/Section rules | `category` | score × 0.8 | Есть product.category |
| 5 | Full catalog fuzzy | `fuzzy` | score × 0.7 | Всегда |
| 6 | LLM semantic match (batch) | `llm` | llm_conf × 0.85 | LLM доступен |
| 7 | LLM + Web Search | `web` | web_conf × 0.75 | LLM с web search доступен |

### Двухпроходная архитектура

```
Pass 1 (быстрый): Тиры 0-5 (CPU/memory, ~0.01 сек/строка)
  → Все строки сметы проходят последовательно
  → 70-90% строк обычно подбираются на этом этапе
  → Прогресс-бар двигается быстро

Pass 2 (медленный): Тиры 6-7 (LLM API)
  → Только unmatched строки из Pass 1
  → Tier 6: LLM batch по 5 позиций (один запрос = 5 строк)
  → Tier 7: Web Search по одному (для оставшихся)
```

### Data flow

```
POST /estimate-items/start-work-matching/
  → WorkMatchingService.start_matching()
    → Redis lock по estimate_id (try/except → lock cleanup)
    → Redis session work_match:{session_id}
    → Celery task: process_work_matching(session_id)
      → MatchingContext (pre-load WorkItems + PriceListItems + History + Knowledge)
      → Pass 1: match_single_item_fast() для каждой строки (тиры 0-5)
      → Pass 2: Tier6LLM.match_batch() + Tier7WebSearch.match() для unmatched
      → Batch-update knowledge usage counts
      → status = 'completed'

GET /estimate-items/work-matching-progress/{session_id}/
  → Лёгкий ответ (~200 байт): stats, current_item, current_tier
  → ?include_results=true — полный ответ с результатами (для финала)

POST /estimate-items/apply-work-matching/
  → WorkMatchingService.apply_results()
    → bulk update EstimateItem.work_item + work_unit_price
    → ProductWorkMapping upsert
    → Knowledge verify
    → calculate_man_hours()
```

### Redis session structure

Основная сессия — Redis HASH:

Key: `work_match:{uuid16}`

| Field | Type | Description |
|-------|------|-------------|
| status | string | processing/completed/error/cancelled |
| estimate_id | string | ID сметы |
| total_items | string | Всего строк |
| current_item | string | Текущая строка |
| current_tier | string | pass1/pass2_llm/pass2_web/source name |
| current_item_name | string | Название текущей строки (до 100 символов) |
| stats | JSON | Счётчики по уровням |
| errors | JSON | Массив ошибок |
| started_at | string | Unix timestamp |

Результаты — Redis LIST (O(1) per item):

Key: `work_match:{uuid16}:results`

Каждый элемент — JSON-сериализованный dict с результатом одной строки.

### Prefetch-кэши в MatchingContext

При создании `MatchingContext(estimate, items=[...])` загружаются:

| Кэш | Содержимое | Используется в |
|------|-----------|---------------|
| `work_items_cache` | Все WorkItem (is_current=True) | Tier 2, 4, 5, 7 |
| `pricelist_items_cache` | PriceListItems для прайса сметы | Tier 2 |
| `history_cache` | ProductWorkMapping по product_id | Tier 1 |
| `knowledge_cache` | ProductKnowledge по normalized name | Tier 3 |

Если `items` не передан (unit-тесты), тиры 1 и 3 делают fallback на DB-запрос.

### Crash Recovery

- `recover_stuck_work_matching` Celery beat task (каждые 5 мин)
- Если session в `processing` > 15 мин → помечается `error`
- Частичные результаты сохраняются и доступны для применения
- Lock снимается при любом завершении (finally)

### LLM Task Config

Модель `LLMTaskConfig` позволяет назначить разным задачам разные LLM-провайдеры:

```python
provider = LLMTaskConfig.get_provider_for_task('work_matching_semantic')
```

Если конфигурация не задана — fallback на `LLMProvider.get_default()`.

### Как добавить новый уровень

1. Создать класс в `tiers.py`: `class TierXNewLevel:`
   - Атрибут `THRESHOLD: float`
   - Метод `match(self, item, ctx) -> Optional[MatchResult]`
2. Добавить в `ALL_TIERS` и `TIER_NAMES` (и `FAST_TIERS` если быстрый)
3. Добавить source в фронтенд (`SOURCE_CONFIG` в WorkMatchingResults.tsx, `SOURCE_LABELS` в WorkMatchingProgress.tsx)
4. Добавить тесты

### Knowledge Base

Двойное хранение:
- **БД**: `ProductKnowledge` модель (быстрый поиск)
- **.md файлы**: `data/knowledge/products/` (ручное редактирование)

Синхронизация:
```bash
python manage.py sync_knowledge_md           # .md → БД
python manage.py sync_knowledge_md --export  # БД → .md
```

### Troubleshooting

**Задача не запускается / висит на 0%:**
```bash
# Проверить что задача зарегистрирована
celery -A finans_assistant inspect registered | grep work_matching

# Проверить логи Celery worker (не Django!)
# dev-local.sh запускает worker в фоне — смотреть его stdout
```

**"Подбор уже запущен" (lock повис):**
```bash
redis-cli DEL work_match_lock:{estimate_id}
```

**Celery beat задачи:**

Все beat-задачи определены в `finans_assistant/celery.py` (единый источник). НЕ дублировать в `settings.py`.

### Разрешение «то же» / «так же»

Модуль `estimates/services/ditto_resolver.py` обрабатывает строки типа "То же 800х300 δ=0,8 мм", подставляя базовое имя из предыдущей строки.

**Два сценария:**
- **A (размеры в name):** "То же 800х300" → извлекает base_name из предыдущей строки (до размеров) + суффикс
- **B (размеры в model):** "То же" → подставляет полное имя предыдущей строки

**Где используется:**
- При импорте Excel (`estimate_import_service.py`)
- При импорте PDF (`tasks.py` + `_parse_llm_response`)
- Fallback в подборе работ (`tasks_work_matching.py`) для старых смет

Паттерны: `То же`, `То-же`, `Тоже`, `Так же`, `Также`, все варианты регистра (ТО-ЖЕ, то-Же, и т.д.).
