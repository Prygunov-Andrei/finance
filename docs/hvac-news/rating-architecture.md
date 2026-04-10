# AI-рейтинг новостей HVAC — Архитектура

## Обзор

Автоматическая система оценки HVAC-новостей по шкале 0-5 звёзд. LLM анализирует черновики по настраиваемым критериям, обнаруживает дубликаты и группирует новости.

## Шкала рейтинга

| Звёзды | Описание | Правило |
|--------|----------|---------|
| 0 | Не классифицировано | Ни один критерий не сработал |
| 1 | Новостей не найдено | `is_no_news_found=True` (автоматически) |
| 2 | Не по теме | Не HVAC: канализация, водоснабжение, отопление |
| 3 | Не интересно | Персоны, партнёрства (не КМП), выставочные стенды, зелёный переход и т.д. |
| 4 | Ограниченно интересно | КМП, новые продукты, технологии, дубликаты, правительство |
| 5 | Интересно | Российский рынок/компании |

## Архитектура

### Модели данных

- **NewsPost** — дополнен: `star_rating`, `rating_explanation`, `matched_criteria`, `duplicate_group`
- **RatingCriterion** — настраиваемые критерии (двухуровневые: parent → child с override)
- **RatingConfiguration** — конфигурация LLM (аналог SearchConfiguration)
- **RatingRun** — история запусков с метриками
- **NewsDuplicateGroup** — группы дубликатов
- **Manufacturer.is_kmp** — флаг крупного мирового производителя

### Сервисы

**`rating_service.py`** — основной сервис:
1. `rate_unrated_news()` — оценка всех неоценённых
2. `detect_duplicates()` — обнаружение дубликатов (difflib + LLM merge)
3. `analyze_published_news()` — анализ опубликованных для выявления паттернов

### Быстрые правила (без LLM)

Применяются ДО LLM-рейтинга:
- `is_no_news_found=True` → 1★
- `manufacturer.is_kmp=True` → минимум 4★
- `source_language='ru'` → 5★

### Pipeline

```
Discovery → finish_discovery_run() → rate_news_task.delay()
                                          ↓
                                   RatingService.rate_unrated_news()
                                          ↓
                                   1. Быстрые правила
                                   2. Батч-рейтинг через LLM
                                          ↓
                                   detect_duplicates_task.delay()
```

### Celery задачи

- `discover_news_for_resource_task` — поиск для одного ресурса
- `discover_all_resources_task` — поиск по всем ресурсам
- `discover_all_manufacturers_task` — поиск по всем производителям
- `rate_news_task` — AI-рейтинг (запускается автоматически после discovery)
- `detect_duplicates_task` — обнаружение дубликатов
- `analyze_published_news_task` — анализ опубликованных

### API эндпоинты

```
GET/POST  /api/hvac/rating-criteria/        — CRUD критериев
GET/POST  /api/hvac/rating-config/          — CRUD конфигураций
GET       /api/hvac/rating-config/active/   — активная конфигурация
GET       /api/hvac/rating-runs/            — история запусков
POST      /api/hvac/news/rate-all-unrated/  — запуск рейтинга
POST      /api/hvac/news/rate-batch/        — рейтинг выбранных
POST      /api/hvac/news/{id}/set-rating/   — ручная установка
GET       /api/hvac/news/?star_rating=5,4   — фильтр по рейтингу
GET       /api/hvac/news/?region=Russia     — фильтр по региону
GET       /api/hvac/news/?month=2026-03     — фильтр по месяцу
```

### Frontend страницы

- `/erp/hvac/rating-settings` — настройки рейтинга
- `/erp/hvac/rating-criteria` — редактор критериев
- `/erp/hvac/news` — список с фильтром по звёздам и badge рейтинга
- `/` (публичный) — фильтры: звёзды, регион, месяц

## Management commands

```bash
# Начальное заполнение КМП
python manage.py populate_kmp
python manage.py populate_kmp --dry-run

# Анализ опубликованных новостей
python manage.py analyze_published_news
python manage.py analyze_published_news --limit 50
```

## Настройка критериев

Критерии хранятся в БД и редактируются через UI без изменения кода:
- Каждый критерий привязан к уровню звёзд (0-5)
- Содержит: имя, описание (для промпта LLM), ключевые слова
- Можно перемещать между уровнями
- Двухуровневые: дочерний критерий с `override_star_rating` повышает рейтинг
