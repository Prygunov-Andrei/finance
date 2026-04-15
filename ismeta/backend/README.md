# ISMeta backend

Django 5 приложение ISMeta. Скелет создан в эпике E1, наполняется по эпикам E2, E4, E5, E6, E7, E8, E17, E18, E19.

## Быстрый старт

```bash
# Из корня ismeta/
make ismeta-backend-install
make ismeta-db-migrate
make ismeta-seed
make ismeta-backend-run
```

Сервер поднимется на `http://localhost:8001`.

## Структура (целевая, собирается по эпикам)

```
backend/
├── manage.py
├── pyproject.toml
├── requirements.txt
├── .env.example
├── ismeta/                     # Django project
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   ├── wsgi.py
│   ├── asgi.py
│   └── celery.py
├── workspace/                  # E2: Workspace, WorkspaceMember
│   ├── models.py
│   ├── serializers.py
│   ├── views.py
│   └── apps.py
├── estimate/                   # E4, E5, E6, E7
│   ├── models.py               # Folder, Estimate, Section, Subsection, Item, ...
│   ├── serializers.py
│   ├── views.py
│   ├── services/
│   │   ├── markup_service.py
│   │   └── version_service.py
│   ├── matching/               # E5
│   │   ├── pipeline.py
│   │   ├── tiers.py
│   │   ├── service.py
│   │   └── tasks.py
│   ├── knowledge/              # E19
│   │   ├── models.py           # ProductKnowledge, ProductWorkMapping
│   │   ├── service.py
│   │   └── tasks.py
│   ├── excel/                  # E6, E7
│   │   ├── exporter.py
│   │   └── importer.py
│   └── apps.py
├── agent/                      # E8
│   ├── prompts/
│   │   └── system_v1.md
│   ├── tools.py
│   ├── service.py
│   ├── views.py
│   └── apps.py
├── integration/                # E17, E18
│   ├── erp/
│   │   ├── client.py           # httpx-клиент к ERP
│   │   └── tasks.py
│   ├── webhooks/
│   │   ├── receiver.py
│   │   └── handlers.py
│   └── transmission/
│       ├── service.py
│       └── tasks.py
├── common/
│   ├── redis_session.py
│   ├── idempotency.py
│   └── utils.py
├── docs/
│   └── openapi/                # auto-generated через drf-spectacular
│       └── v1.yaml
└── tests/
    ├── conftest.py
    ├── fixtures/
    ├── cassettes/              # LLM cassette-tests
    │   └── golden/
    ├── pacts/
    └── golden/                 # E20
```

## Dev-заметки

- Мы используем Python 3.12 (такую же версию, что и ERP).
- Зависимости — через `pip-tools` (compile + sync).
- Линтер — `ruff`, форматер — `ruff format`.
- Тесты — `pytest`.
- API-схема — `drf-spectacular` (генерирует OpenAPI из DRF).
- Celery — с Redis (БД 2 и 3).

## Ссылки

- [`../specs/01-data-model.md`](../specs/01-data-model.md) — схемы всех таблиц.
- [`../specs/02-api-contracts.md`](../specs/02-api-contracts.md) — API-границы.
- [`../specs/09-dev-setup.md`](../specs/09-dev-setup.md) — настройка локальной разработки.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — правила контрибьюции.
