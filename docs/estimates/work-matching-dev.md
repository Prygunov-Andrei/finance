# Подбор работ — Документация разработчика

## Архитектура

8-уровневый pipeline подбора расценок для строк сметы. Работает в фоне через Celery + Redis.

### Структура файлов

```
backend/estimates/services/work_matching/
    __init__.py          → exports WorkMatchingService
    service.py           → Оркестратор (Redis-сессии, start/cancel/apply)
    pipeline.py          → Контекст + match_single_item()
    tiers.py             → 8 уровней подбора (классы Tier0-Tier7)
    knowledge.py         → Накопление знаний в ProductKnowledge + .md
    man_hours.py         → Расчёт человеко-часов

backend/estimates/tasks_work_matching.py  → Celery task + crash recovery

data/knowledge/products/                  → .md файлы базы знаний
```

### 8 уровней подбора

| # | Уровень | Source | Confidence | Условие |
|---|---------|--------|-----------|---------|
| 0 | Default (Product.default_work_item) | `default` | 1.0 | Есть product с расценкой |
| 1 | History (ProductWorkMapping) | `history` | 0.6-0.95 | Есть product, usage >= 2 (или 1 для MANUAL) |
| 2 | PriceList-scoped fuzzy | `pricelist` | score × 0.9 | Есть estimate.price_list |
| 3 | Knowledge base (ProductKnowledge) | `knowledge` | × 0.9-1.1 | Есть запись в базе знаний |
| 4 | Category/Section rules | `category` | score × 0.8 | Есть product.category |
| 5 | Full catalog fuzzy | `fuzzy` | score × 0.7 | Всегда |
| 6 | LLM semantic match | `llm` | llm_conf × 0.85 | LLM доступен |
| 7 | LLM + Web Search | `web` | web_conf × 0.75 | LLM с web search доступен |

### Data flow

```
POST /estimate-items/start-work-matching/
  → WorkMatchingService.start_matching()
    → Redis lock по estimate_id
    → Redis session work_match:{session_id}
    → Celery task: process_work_matching(session_id)
      → MatchingContext (pre-load all WorkItems + PriceListItems)
      → For each EstimateItem:
        → match_single_item(item, ctx) → тиры 0-7 последовательно
        → Redis update (results, stats, current_item)
      → status = 'completed'

GET /estimate-items/work-matching-progress/{session_id}/
  → Redis hgetall → JSON

POST /estimate-items/apply-work-matching/
  → WorkMatchingService.apply_results()
    → bulk update EstimateItem.work_item + work_unit_price
    → ProductWorkMapping upsert
    → Knowledge verify
    → calculate_man_hours()
```

### Redis session structure

Key: `work_match:{uuid16}`

| Field | Type | Description |
|-------|------|-------------|
| status | string | processing/completed/error/cancelled |
| estimate_id | string | ID сметы |
| total_items | string | Всего строк |
| current_item | string | Текущая строка |
| current_tier | string | Текущий уровень |
| results | JSON | Массив per-item результатов |
| stats | JSON | Счётчики по уровням |
| errors | JSON | Массив ошибок |
| started_at | string | Unix timestamp |

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
2. Добавить в `ALL_TIERS` и `TIER_NAMES`
3. Добавить source в фронтенд (`SOURCE_CONFIG` в WorkMatchingResults.tsx)
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
