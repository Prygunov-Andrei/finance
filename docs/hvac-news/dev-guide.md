# HVAC-новости: руководство разработчика

## Архитектура

### Frontend

| Файл | Назначение |
|------|-----------|
| `frontend/components/hvac/pages/NewsList.tsx` | Главная страница новостей. Фильтрация, массовое удаление, пагинация |
| `frontend/components/hvac/pages/NewsEditor.tsx` | Создание и редактирование (TipTap, auto-translate) |
| `frontend/components/hvac/pages/ScheduledPage.tsx` | Запланированные новости |
| `frontend/components/hvac/services/newsService.ts` | API-клиент для всех операций с новостями |
| `frontend/components/hvac/services/apiClient.ts` | Базовый HTTP-клиент (axios) |
| `frontend/app/api/hvac-admin/[...path]/route.ts` | Next.js прокси к Django backend |

### Backend

| Файл | Назначение |
|------|-----------|
| `backend/news/views.py` | DRF ViewSet: CRUD, drafts, scheduled endpoints |
| `backend/news/models.py` | NewsPost, SearchConfiguration, NewsDiscoveryRun, DiscoveryAPICall |
| `backend/news/urls.py` | Router: `/api/v1/hvac/public/news/` |
| `backend/news/discovery_service.py` | LLM-поиск новостей (Grok, OpenAI, Gemini, Anthropic) |
| `backend/news/services.py` | Import, translation |
| `backend/references/models.py` | NewsResource, Manufacturer, статистика |

## API Endpoints

Все через прокси `/api/hvac-admin/api/hvac/` -> backend `/api/v1/hvac/public/`.

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/news/` | Список новостей (пагинация) |
| GET | `/news/{id}/` | Одна новость |
| POST | `/news/` | Создать новость |
| PUT/PATCH | `/news/{id}/` | Обновить |
| DELETE | `/news/{id}/` | Удалить |
| GET | `/news/scheduled/` | Запланированные |
| POST | `/news/{id}/publish/` | Опубликовать |

Массовое удаление — фронтенд вызывает `Promise.all` по `DELETE /news/{id}/` для каждого ID.

## Discovery System

Автоматический поиск новостей через LLM с веб-поиском.

### Провайдеры (цепочка fallback)

1. **Grok (xAI)** — основной. Модель `grok-4-1-fast`, Responses API через OpenAI SDK
2. **OpenAI** — fallback. Модель `gpt-4o-search-preview`
3. **Gemini** — fallback. Модель `gemini-2.0-flash`

### Конфигурация

`SearchConfiguration` в Django Admin — primary provider, fallback chain, модели, таймауты, промпты.

### Management commands

```bash
# Тест одного источника
python manage.py test_discovery --resource-id 354 --set-date 2026-03-26

# Полный прогон
python manage.py discover_remaining_news --start-id 354 --start-date 2026-03-12

# Тест Grok
python manage.py test_grok --resource-id 354
```

### Ключевые модели

- `NewsResource` — источник новостей (URL, язык, тип: auto/manual/hybrid)
- `NewsPost` — найденная/созданная новость (draft → published)
- `SearchConfiguration` — настройки поиска (провайдер, модели, промпты)
- `NewsDiscoveryRun` — запуск поиска (метрики, стоимость)
- `DiscoveryAPICall` — детали каждого API-вызова
