# Поиск Исполнителей — Руководство разработчика

## Архитектура

```
backend/marketing/
├── models.py              10 моделей (ExecutorProfile, AvitoConfig, AvitoListing, ...)
├── serializers.py         ~15 сериализаторов (List/Detail/Create для каждой сущности)
├── views.py               8 ViewSets + 3 standalone views
├── urls.py                DRF router + 5 дополнительных путей
├── signals.py             pre_save/post_save для авто-публикации МП на Avito
├── tasks.py               5 Celery-задач
├── admin.py               Все модели в Django admin
├── clients/
│   ├── avito.py           AvitoAPIClient (OAuth2, rate limiting, retries)
│   └── unisender.py       UnisenderClient (email + SMS)
├── services/
│   ├── executor_service.py    Конвертация листингов, CRUD
│   ├── avito_publisher.py     Публикация МП на Avito
│   └── campaign_service.py    Рассылки (resolve recipients, execute, preview)
└── tests/                 8 тестовых файлов, 100+ тестов
```

## Ключевые модели

### ExecutorProfile (1:1 к Counterparty)
- `specializations` — `ArrayField(CharField)`, поддерживает `__overlap`
- `source` — manual / avito / telegram / referral
- `is_potential` — флаг потенциального исполнителя

### AvitoConfig / UnisenderConfig (singletons)
- `pk` всегда = 1, `save()` форсирует `self.pk = 1`
- `get()` использует `select_for_update() + get_or_create(pk=1)` — thread-safe

## API endpoints

Все под `/api/v1/marketing/`:

| Endpoint | Методы |
|---|---|
| `executor-profiles/` | CRUD + `contact-history/`, `add-contact/` |
| `avito/config/` | GET, PATCH |
| `avito/keywords/` | CRUD |
| `avito/listings/` | GET, POST + `update-status/`, `convert/` |
| `avito/published/` | GET + `refresh-stats/` |
| `avito/scan/` | POST |
| `avito/publish-mp/<mp_id>/` | POST |
| `campaigns/` | CRUD + `send/`, `preview/`, `recipients/` |
| `unisender/config/` | GET, PATCH |
| `sync-logs/` | GET |
| `dashboard/` | GET |

## Celery-задачи

| Задача | Расписание |
|---|---|
| `sync_avito_stats` | Пн 10:00 |
| `refresh_avito_token` | Каждые 12 часов |
| `cleanup_old_listings` | Вс 03:00 |
| `publish_mp_to_avito` | По событию (сигнал) |
| `execute_campaign_task` | По запросу |

## Сигнал авто-публикации

`signals.py` слушает `pre_save` + `post_save` на `MountingProposal`:
- `pre_save` кэширует старый статус в `instance._old_status`
- `post_save` проверяет: если статус изменился на `published` И `AvitoConfig.auto_publish_mp=True` → ставит задачу `publish_mp_to_avito.delay()`

## Тестирование

```bash
# Все тесты (требует PostgreSQL)
cd backend && DB_PORT=5432 python3 -m pytest marketing/ -v

# Только mock-тесты (без БД)
python3 -m pytest marketing/tests/test_tasks.py -v
```

### Фикстуры (conftest.py)
- `marketing_user` / `marketing_client` — пользователь + JWT клиент
- `counterparty_executor` / `executor_profile` — тестовый исполнитель
- `avito_config` / `unisender_config` — singletons
- `avito_listing` / `campaign` — тестовые данные

## Deploy

### Новые переменные окружения
```env
# Не обязательны при деплое — настраиваются через UI
AVITO_CLIENT_ID=
AVITO_CLIENT_SECRET=
UNISENDER_API_KEY=
```

### Миграции
```bash
python manage.py migrate marketing
```

Celery-задачи подхватываются автоматически через `autodiscover_tasks`.

## Frontend

```
frontend/components/erp/components/marketing/
├── ExecutorSearchPage.tsx       Главная с 5 табами
├── executors/
│   ├── ExecutorDatabaseTab.tsx  Таблица + фильтры + CRUD
│   ├── ExecutorProfileDialog.tsx Форма создания/редактирования
│   └── ExecutorDetailPanel.tsx  Детали + история контактов
├── avito/
│   ├── AvitoTab.tsx             Подвкладки входящие/наши
│   ├── AvitoIncomingTab.tsx     Входящие объявления
│   ├── AvitoPublishedTab.tsx    Наши публикации
│   └── AvitoKeywordManager.tsx  Управление ключевыми словами
├── campaigns/
│   ├── CampaignsTab.tsx         Список рассылок
│   └── CampaignEditor.tsx       Создание рассылки
├── ContactHistoryTab.tsx        История контактов + dashboard
└── settings/
    └── ExecutorSettingsTab.tsx   Avito + Unisender настройки
```

API-сервис: `frontend/lib/api/services/marketing.ts`
Типы: `frontend/lib/api/types/marketing.ts`
