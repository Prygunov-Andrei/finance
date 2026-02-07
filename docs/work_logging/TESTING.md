# Тестирование сервиса фиксации работ

**Обновлено**: 7 февраля 2026  
**Статус**: 199 unit-тестов пройдены ✅

---

## Обзор

| Компонент | Фреймворк | Тестов | Статус |
|-----------|----------|--------|--------|
| Backend (Django) | Django TestCase | 90 | ✅ Все пройдены |
| Bot (aiogram) | pytest + pytest-asyncio | 33 | ✅ Все пройдены |
| Mini App (React) | Vitest + jsdom | 41 | ✅ Все пройдены |
| ERP Frontend (React) | Vitest + jsdom + RTL | 35 | ✅ Все пройдены |
| **Итого** | | **199** | **✅** |

---

## Backend — 90 unit-тестов

### Запуск

```bash
cd backend

# Через pytest (рекомендуется — с coverage)
pytest --cov=worklog --cov-report=term-missing -q

# Через Django test runner
python3 manage.py test worklog.tests --verbosity=2
```

### Конфигурация pytest

- `pytest.ini` — настройки pytest, маркеры, coverage
- `.coveragerc` — coverage: source, omit migrations/tests, fail_under=85%
- `conftest.py` — фикстуры: `admin_user`, `api_client`, `authenticated_client`

### Структура файлов

```
backend/worklog/tests/
├── __init__.py
├── factories.py          # Фабрики тестовых данных
├── test_models.py        # 24 теста — все 10 моделей
├── test_serializers.py   # 17 тестов — все сериализаторы + TelegramAuth
├── test_views.py         # 34 теста — CRUD, register, team create, auth, summary
├── test_tasks.py         # 13 тестов — Celery tasks + content type mapping
└── test_geo.py           # 6 тестов — Haversine, геозоны, граничные случаи
```

### Покрытие по модулям

| Модуль | Файл тестов | Тестов | Что покрыто |
|--------|------------|--------|-------------|
| `models.py` | `test_models.py` | 24 | Создание, __str__, уникальность, ordering, каскадное удаление |
| `serializers.py` | `test_serializers.py` | 17 | Сериализация/десериализация, валидация, HMAC-SHA256 подпись |
| `views.py` | `test_views.py` | 34 | Все API endpoints, фильтрация, ошибки 400/401/404/409 |
| `tasks.py` | `test_tasks.py` | 13 | download, upload, phash, thumbnail, edge cases, content types |
| Геолокация | `test_geo.py` | 6 | Haversine, внутри/вне зоны, граница, нет координат |

### Фабрики (`factories.py`)

Используются во всех тестовых модулях для создания тестовых данных:

- `create_user()` — Django User
- `create_counterparty()` — Контрагент с уникальным ИНН
- `create_object()` — Объект с геокоординатами (Москва)
- `create_worker()` — Монтажник с уникальным telegram_id
- `create_shift()` — Смена с уникальным qr_token
- `create_team()` — Звено с бригадиром
- `create_media()` — Медиа (фото по умолчанию)
- `create_report()`, `create_question()`, `create_answer()`

### Важные находки при тестировании

1. **filter_backends отсутствовал** — все ViewSets не имели `filter_backends = [DjangoFilterBackend]`, из-за чего `filterset_fields` (role, media_type и т.д.) не работали. Исправлено 7 фев 2026.

2. **qr_token unique constraint** — при создании нескольких смен с пустым `qr_token=''` возникал IntegrityError. Решено генерацией уникальных токенов в фабрике.

---

## Bot — 33 unit-теста

### Запуск

```bash
cd bot
python3 -m pytest tests/ -v
```

### Структура файлов

```
bot/tests/
├── __init__.py
├── conftest.py           # Моки: Message, Chat, User, CallbackQuery, данные
├── test_handlers.py      # 22 теста — commands + media + callbacks
└── test_db.py            # 11 тестов — asyncpg CRUD
```

### Покрытие по модулям

| Модуль | Файл тестов | Тестов | Что покрыто |
|--------|------------|--------|-------------|
| `handlers/commands.py` | `test_handlers.py` | 5 | /start зарег./незарег., bot_started, /help |
| `handlers/media.py` | `test_handlers.py` | 13 | photo/video/voice/text, реакция, celery, ignore cases |
| `handlers/callbacks.py` | `test_handlers.py` | 4 | answer success, already answered, invalid format, unknown |
| `services/db.py` | `test_db.py` | 11 | find_worker, mark_bot_started, find_team, is_worker_in_team, save_media, invite_link |

### Стратегия моков

- **aiogram Message** — AsyncMock с атрибутами `from_user`, `chat`, `message_thread_id`
- **asyncpg Pool** — AsyncMock с `fetchrow`, `execute`
- **Celery** — MagicMock для `schedule_media_download`
- **Данные** — константы `WORKER_DICT`, `TEAM_DICT` в `conftest.py`

---

## Mini App — 19 unit-тестов

### Запуск

```bash
cd mini-app
npm test           # или npx vitest run
npm run test:watch # watch-режим
```

### Структура файлов

```
mini-app/src/__tests__/
├── setup.ts               # Моки: @twa-dev/sdk, import.meta.env
├── api-client.test.ts     # 8 тестов — HTTP client, auth, errors
├── telegram-lib.test.ts   # 7 тестов — SDK обёртки, haptic, buttons
├── i18n.test.ts           # 4 теста — структура локалей, интерполяция
└── components.test.tsx    # 22 теста — все React-компоненты
```

### Покрытие по модулям

| Модуль | Файл тестов | Тестов | Что покрыто |
|--------|------------|--------|-------------|
| `api/client.ts` | `api-client.test.ts` | 8 | setToken, Authorization header, error handling, auth, createTeam, getMedia |
| `lib/telegram.ts` | `telegram-lib.test.ts` | 7 | initTelegram, getInitData, getUserLanguage, haptic, MainButton |
| `i18n/locales/*.json` | `i18n.test.ts` | 4 | Одинаковые ключи ru/uz/tg/ky, нет пустых, {{count}} интерполяция |
| RegisterPage | `components.test.tsx` | 4 | render, scan flow, success, error state |
| BrigadierHome | `components.test.tsx` | 3 | loading, no shift, teams with media count |
| CreateTeamPage | `components.test.tsx` | 4 | checkboxes, toggle, submit, empty state |
| TeamMediaPage | `components.test.tsx` | 3 | empty, items with icons, problem tag indicator |
| ContractorHome | `components.test.tsx` | 2 | renders sections, no shifts placeholder |
| OpenShiftPage | `components.test.tsx` | 2 | form inputs, submit calls API |
| WorkersPage | `components.test.tsx` | 3 | list, add form, createWorker API call |
| SettingsPage | `components.test.tsx` | 1 | renders all settings cells |

### Стратегия моков

- **@twa-dev/sdk** — полный мок WebApp в `setup.ts`
- **fetch** — `vi.fn()` с программируемыми ответами
- **import.meta.env** — `vi.stubEnv` для VITE_API_BASE_URL

---

## ERP Frontend — 35 unit-тестов

### Запуск

```bash
cd frontend
npm test           # или npx vitest run
npm run test:watch # watch-режим
```

### Структура файлов

```
frontend/src/__tests__/
├── setup.ts                    # jest-dom matchers
├── worklog-api.test.ts         # 11 тестов — API client worklog methods
└── worklog-components.test.tsx # 24 теста — все worklog-компоненты
```

### Покрытие по модулям

| Модуль | Файл тестов | Тестов | Что покрыто |
|--------|------------|--------|-------------|
| `lib/api.ts` (worklog) | `worklog-api.test.ts` | 11 | getWorkJournalSummary, getWorklogShifts, getWorklogMedia, getWorklogReports, getWorklogReportDetail, createWorklogQuestion, answerWorklogQuestion, updateObjectGeo, getWorklogSupergroups, error handling |
| `WorkJournalTab` | `worklog-components.test.tsx` | 3 | summary cards, empty state, section navigation |
| `OverviewSection` | `worklog-components.test.tsx` | 2 | таблица смен, пустое состояние |
| `ShiftsSection` | `worklog-components.test.tsx` | 3 | фильтр + таблица, loading, empty |
| `MediaSection` | `worklog-components.test.tsx` | 1 | фильтры + карточки |
| `MediaCard` | `worklog-components.test.tsx` | 2 | photo с thumbnail, voice с иконкой |
| `PaginationBar` | `worklog-components.test.tsx` | 5 | контролы, disabled, click, single page |
| `ReportsSection` | `worklog-components.test.tsx` | 2 | таблица, click → onReportClick |
| `ReportDetailDialog` | `worklog-components.test.tsx` | 1 | диалог с медиа и Q&A |
| `GeoSettingsSection` | `worklog-components.test.tsx` | 1 | форма координат |
| `SupergroupSection` | `worklog-components.test.tsx` | 2 | список и пустое состояние |
| `SummaryCard` | `worklog-components.test.tsx` | 2 | с extra text и без |

### Стратегия моков

- **API module** — `vi.mock('../lib/api')` с программируемыми resolves
- **sonner** — мок `toast.success`/`toast.error`
- **recharts** — мок для избежания SVG-рендера
- **@tanstack/react-query** — `QueryClientProvider` с `retry: false`

---

## Целевое покрытие

| Компонент | Текущее | Целевое |
|-----------|---------|---------|
| `backend/worklog/` | ~85% | ≥ 90% |
| `bot/` | ~80% | ≥ 85% |
| `mini-app/src/` | ~70% | ≥ 80% |
| `frontend/src/` (worklog) | ~75% | ≥ 75% |

---

## Запуск всех тестов

```bash
# Из корня проекта — все компоненты
cd backend && python3 manage.py test worklog.tests --verbosity=2 && \
cd ../bot && python3 -m pytest tests/ -v && \
cd ../mini-app && npx vitest run && \
cd ../frontend && npx vitest run
```

---

## CI/CD — GitHub Actions ✅

**Файл**: `.github/workflows/ci.yml`

### Jobs

| Job | Что запускает | Сервисы |
|-----|-------------|---------|
| `backend` | pytest с coverage | PostgreSQL 15, Redis 7 |
| `bot` | pytest + pytest-asyncio | — |
| `mini-app` | Vitest | — |
| `frontend` | Vitest | — |
| `lint` | TypeScript type check | — |

### Триггеры

- Push в ветки `main`, `develop`
- Pull Request в `main`

### Кэширование

- pip cache для Python-зависимостей
- npm cache для Node.js-зависимостей

### Запуск локально

```bash
# Все тесты (из корня проекта)
cd backend && pytest -q && \
cd ../bot && python3 -m pytest tests/ -q && \
cd ../mini-app && npx vitest run && \
cd ../frontend && npx vitest run
```
