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

## Multi-agent collaboration

На `main` одновременно работают **две параллельные команды**. Обе пушат напрямую в main; долгоживущая integration-ветка не используется.

### Команды и их территории

Не заходить на чужую территорию без согласования.

**ISMeta + Recognition** (Claude tech lead + Петя backend + Федя frontend):
- `recognition/` — standalone FastAPI микросервис (порт 8003)
- `ismeta/` — весь поддиректорий (`ismeta/backend`, `ismeta/frontend`, `ismeta/docs`, `ismeta/specs`, `ismeta/deploy`)
- `backend/payments/services/invoice_service.py`, `backend/payments/services/recognition_client.py`
- `backend/llm_services/services/specification_parser.py`, `backend/llm_services/services/document_parser.py` — **deprecated**, удаление в E28 (предупредить AC Rating до удаления)
- `docs/ismeta/`
- Префикс веток: `recognition/*`, `ismeta/*`

**AC Rating** (публичная часть — рейтинг кондиционеров + HVAC-новости):
- `backend/ac_brands`, `backend/ac_catalog`, `backend/ac_methodology`, `backend/ac_scoring`, `backend/ac_reviews`, `backend/ac_submissions`
- `frontend/app/ratings/`
- `frontend/lib/api/types/rating.ts`, `frontend/lib/api/services/rating.ts`
- `frontend/app/news/` — будет редизайн в Ф7, предупредить отдельно
- `ac-rating/`, `docs/ac_rating/`
- Префикс веток: `ac-rating/*`

### Shared файлы (требуют пинга ДО правки)

- `backend/finans_assistant/settings.py` — AC Rating добавили ratelimit/middleware (M1); ISMeta добавит `RECOGNITION_URL`, `RECOGNITION_API_KEY` (E15.02b)
- `backend/finans_assistant/urls.py` — AC Rating подключили `/api/public/v1/rating/` и `/api/hvac/rating/`; ISMeta НЕ планирует трогать
- `docker-compose.yml` (корневой) и `docker-compose.prod.yml` — ISMeta добавила сервис `recognition` на порт 8003
- `.env.example`
- `frontend/app/globals.css` — shadcn tokens, **НИКТО не трогает** (AC Rating использует scoped `.rating-scope`)
- `frontend/app/layout.tsx` (корневой) — **НИКТО не трогает**
- `CLAUDE.md` (этот файл)

### Agent-идентификаторы

По 2 агента в каждой команде, симметрично. Префикс используется в worktree-именах, Co-authored-by, именах задач и ссылках в отчётах:
- **IS-Петя** (ISMeta+Recognition, backend), **IS-Федя** (ISMeta+Recognition, frontend)
- **AC-Петя** (AC Rating, backend), **AC-Федя** (AC Rating, frontend)

В чате/переписке префикс можно опускать, если контекст ясен; в git/worktree — обязателен.

### Процесс для всех агентов

1. **Один агент + одна задача = один git worktree.** Запрещено параллельно работать двум агентам в одном checkout — приводит к cross-contamination коммитов.
2. **Naming convention:** `ERP_Avgust_<team>_<agent>_<task>` (team ∈ {is, ac}, agent ∈ {petya, fedya}, task — короткий слаг).
   ```bash
   git fetch origin
   git worktree add -b <team>/<task-slug> ../ERP_Avgust_<team>_<agent>_<task> origin/main
   # примеры:
   #   ../ERP_Avgust_is_petya_e15_02b
   #   ../ERP_Avgust_ac_fedya_f1_design
   ```
   После мержа задачи — `git worktree remove ../ERP_Avgust_<team>_<agent>_<task>`.
3. **Перед push** — всегда `git fetch origin && git rebase origin/main`. Main движется быстро (обе команды пушат напрямую).
4. **При правке shared файла** — пинг в общий чат ДО коммита: «собираюсь добавить X в backend/finans_assistant/settings.py».
5. **После merge в main** — пинг в общий чат: «смержил X, pull origin».
6. **Force-push в main запрещён.** Всегда обычный push после rebase.
7. **Перед мержем** — убедиться что `git log main..HEAD` содержит только твои коммиты (чужие, попавшие через parallel checkout, вычистить через `rebase --onto`).
8. **Merge strategy:** `--no-ff` с осмысленным сообщением о scope (какой эпик / какие коммиты влились).

### Общий чат для пингов

Канал координации: [TBD — согласовать формат: Telegram / GitHub issue / Slack]. До согласования — пинг через Андрея (PO).

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
- Apps с services/: accounting, banking, catalog, contracts, estimates, llm_services, marketing, objects, payments, personnel, pricelists, proposals, supplier_integrations, supply
- Status transitions: через `core/state_machine.py` (декларативный валидатор)
- Text normalization: через `core/text_utils.py` (единственная копия)
- Kanban permissions: через `core/kanban_permissions.py` (KanbanRolePermissionMixin)
- Views >500 LOC разбиты на packages: payments/views/, estimates/views/, contracts/views/
- URL prefix: `/api/v1/` для ERP, `/api/public/v1/` для портала, `/api/hvac/` для HVAC
- Markup system: трёхуровневые наценки (смета → раздел → строка), сервис пересчёта в `estimates/services/markup_service.py`, три режима (percent/fixed_price/fixed_amount). Документация: `docs/estimates/markup-architecture.md`
- Work matching: async 8-уровневый pipeline подбора расценок работ (default → history → pricelist → knowledge → category → fuzzy → LLM → web), сервис в `estimates/services/work_matching/`, Celery + Redis сессии, самообучение через ProductKnowledge + .md файлы. Документация: `docs/estimates/work-matching-dev.md`
- LLM task config: настройка провайдера для каждой задачи через `LLMTaskConfig`, поддержка локальных LLM. Никакие провайдеры не хардкодятся
- Marketing: поиск исполнителей + Avito-интеграция в `marketing/`. ExecutorProfile — 1:1 расширение Counterparty (НЕ отдельная сущность). Avito API клиент: `marketing/clients/avito.py` (OAuth2, rate limiting). Unisender: `marketing/clients/unisender.py` (email + SMS). Singleton-модели используют `get_or_create(pk=1) + select_for_update`. Документация: `docs/marketing/`

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
