# ERP Avgust — Project Conventions

## Architecture

Monorepo with 5 services:
- `frontend/` — Next.js 16, единая точка входа (ERP + HVAC портал)
- `backend/` — Django 5 + DRF, единый ERP + HVAC API контур
- `bot/` — Telegram бот (aiogram 3.x)
- `mini-app/` — Vite React, мобильный worklog (независимый API client — intentional, не шарить с frontend)

## Critical Rules

### Database Safety
- **НЕ изменять модели и миграции** без отдельного решения и тестового прогона на копии базы
- Перед любыми изменениями моделей: бэкап → тестовый прогон миграций на копии → smoke-check API → план отката
- НЕ редактировать старые миграции (особенно RunPython data migrations)

### Sensitive Files (handle with care)
- `backend/finans_assistant/settings.py` — secrets, JWT keys, S3 config
- `bot/services/db.py` — прямой asyncpg доступ к ERP DB (оптимизирован: retry, timeout, cache)
- `backend/api_public/migrations/0001_initial.py` — hardcoded defaults
- `.env`, `.env.example` — credentials

## Development

```bash
# Backend tests
cd backend && pytest

# Frontend type check + tests
cd frontend && npx tsc --noEmit && npm test

# Bot tests
cd bot && pytest

# Full stack
./dev-local.sh    # start
./dev-stop.sh     # stop
```

### Media-файлы при локальной разработке
- БД подключена к проду (SSH-туннель), но медиа-файлы новостей (HVAC) физически на прод-сервере
- `frontend/.env.local` содержит `PROD_MEDIA_URL=http://216.57.110.41` — Next.js проксирует `/media/news/`, `/hvac-media/`, `/hvac-static/` на прод
- Остальные медиа (`/media/product_images/`, `/media/projects/` и т.д.) берутся с локального backend
- **На продакшне** `PROD_MEDIA_URL` **НЕ задаётся** — всё идёт через `BACKEND_API_URL` (по умолчанию `http://backend:8000`)

## Code Patterns

### Backend
- Services pattern: бизнес-логика в `app/services/`, views только для HTTP orchestration
- Apps с services/: accounting, banking, catalog, contracts, estimates, llm_services, objects, payments, personnel, pricelists, proposals, supplier_integrations, supply
- Status transitions: через `core/state_machine.py` (декларативный валидатор)
- Text normalization: через `core/text_utils.py` (единственная копия)
- Kanban permissions: через `core/kanban_permissions.py` (KanbanRolePermissionMixin)
- Views >500 LOC разбиты на packages: payments/views/, estimates/views/, contracts/views/
- URL prefix: `/api/v1/` для ERP, `/api/public/v1/` для портала, `/api/hvac/` для HVAC
- Markup system: трёхуровневые наценки (смета → раздел → строка), сервис пересчёта в `estimates/services/markup_service.py`, три режима (percent/fixed_price/fixed_amount). Документация: `docs/estimates/markup-architecture.md`
- Work matching: async 8-уровневый pipeline подбора расценок работ (default → history → pricelist → knowledge → category → fuzzy → LLM → web), сервис в `estimates/services/work_matching/`, Celery + Redis сессии, самообучение через ProductKnowledge + .md файлы. Документация: `docs/estimates/work-matching-dev.md`
- LLM task config: настройка провайдера для каждой задачи через `LLMTaskConfig`, поддержка локальных LLM. Никакие провайдеры не хардкодятся

### Frontend
- UI primitives: `@/components/ui/` (shadcn/ui) — единственная копия
- API client: `@/lib/api/client.ts` (transport + domain services в `@/lib/api/services/`)
- API types: `@/lib/api/types/` — 12 доменных файлов
- HVAC API: `@/lib/hvac-api.ts`
- Constants: `@/constants/index.ts` — единственная копия
- Кастомные hooks: `@/hooks/` (useAsyncAction, useDialogState, useListFilters, useFormData и др.)
- Компоненты >1000 строк разбиты на подкомпоненты в поддиректориях (settings/, tkp/, estimate-detail/, work-journal/, personnel/, price-list-detail/)
- Path aliases: `@/*` → `./frontend/*`

### Known Tech Debt
- `finans_assistant` — внутреннее имя Django project (переименование нецелесообразно, 200+ миграций)
- `bot/services/db.py` — прямой SQL к ERP DB (изолирован, миграция на API — отдельный проект)
- HVAC discovery_service.py — threading вместо Celery (планируется миграция на Celery/отдельный worker)

## Deploy
- Production: 216.57.110.41, `/opt/finans_assistant`
- Deploy docs: `deploy/README.md`, `deploy/QUICKSTART.md`
- CI: `.github/workflows/ci.yml` — frontend, backend, bot, mini-app
