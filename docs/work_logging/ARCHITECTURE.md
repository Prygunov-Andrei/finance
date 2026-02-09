# Архитектура сервиса фиксации работ

**Версия**: 1.0  
**Обновлено**: Февраль 2026

---

## Обзор

Сервис фиксации работ — это подсистема ERP, которая связывает строительные площадки с офисом через Telegram. Монтажники ежедневно отправляют фото/видео/голосовые в Telegram-чат, бот обрабатывает и сохраняет данные, а офис видит результаты в ERP-интерфейсе.

### Принцип Telegram-first

| Роль | Основной интерфейс | Что делает |
|------|-------------------|------------|
| **Монтажник** | Telegram-чат + Mini App (только регистрация) | Отправляет медиа, отвечает на вопросы |
| **Бригадир** | Telegram-чат + Mini App | Создаёт звенья, формирует отчёты |
| **Исполнитель** | Mini App + ERP | Открывает смены, управляет монтажниками |
| **Офис** | ERP Frontend | Просматривает журнал работ по объектам |

---

## Схема взаимодействия компонентов

```
┌─────────────────────────────────────────────────────────────┐
│                        TELEGRAM                             │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │ Супергруппа с  │  │  Bot API     │  │   Mini App     │   │
│  │   Topics       │  │  (webhook)   │  │  (React SPA)   │   │
│  └───────┬────────┘  └──────┬───────┘  └───────┬────────┘   │
└──────────┼──────────────────┼──────────────────┼────────────┘
           │ webhook          │                  │ API запросы
           ▼                  ▼                  ▼
┌──────────────────────────────────────────────────────────────┐
│                     DJANGO BACKEND                           │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │ Bot (aiogram)   │  │  worklog app │  │   REST API     │   │
│  │ порт 8081       │  │  models/     │  │  /api/v1/      │   │
│  │                 │  │  admin/      │  │  worklog/      │   │
│  └────────┬────────┘  └──────┬───────┘  └───────┬────────┘   │
│           │                  │                   │            │
│  ┌────────▼──────────────────▼───────────────────▼────────┐   │
│  │                  Celery Worker                         │   │
│  │  download_media → upload_to_s3 → phash + thumbnail     │   │
│  └──────────────────────┬────────────────────────────────┘   │
└─────────────────────────┼────────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────────┐
│                   ИНФРАСТРУКТУРА                              │
│  ┌──────────┐  ┌────────▼────────┐  ┌──────────────────────┐  │
│  │ Redis    │  │   PostgreSQL    │  │   MinIO (S3)         │  │
│  │ 6379     │  │   5432          │  │   9000 / 9001        │  │
│  │ (broker) │  │   (данные)      │  │   (медиа файлы)      │  │
│  └──────────┘  └─────────────────┘  └──────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────────┐
│                    ERP FRONTEND                               │
│  ┌──────────────────────▼──────────────────────────────────┐  │
│  │  ObjectDetail.tsx → вкладка "Журнал работ"              │  │
│  │  React 18 + Vite + Shadcn UI                            │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

---

## Компоненты системы

### 1. Django Backend — `worklog` app

**Расположение**: `backend/worklog/`

Центральное ядро системы. Содержит все модели данных, API, Celery-задачи.

| Файл | Назначение |
|------|-----------|
| `models.py` | 10 моделей: Worker, Supergroup, Shift, ShiftRegistration, Team, TeamMembership, Media, Report, Question, Answer |
| `serializers.py` | DRF-сериализаторы + TelegramAuthSerializer с HMAC-SHA256 валидацией |
| `views.py` | ViewSets + telegram_auth + work_journal_summary |
| `urls.py` | Router + кастомные эндпоинты |
| `tasks.py` | 8 Celery-задач: обработка медиа, транскрибация (ElevenLabs Scribe v2), уведомления, автозакрытие |
| `admin.py` | Все модели зарегистрированы в Django Admin |

### 2. Telegram Bot — `/bot/`

**Расположение**: `bot/`  
**Фреймворк**: aiogram 3.x (async Python)  
**Режимы работы**: polling (разработка) / webhook (production)

| Компонент | Файл | Назначение |
|-----------|------|-----------|
| Entry point | `main.py` | Запуск бота, настройка webhook/polling, регистрация middleware |
| Конфигурация | `config.py` | pydantic-settings, чтение .env |
| Команды | `handlers/commands.py` | `/start`, `/help` |
| Медиа | `handlers/media.py` | Обработка фото/видео/голосовых из топиков |
| Callbacks | `handlers/callbacks.py` | Ответы на вопросы через inline-кнопки |
| Middleware | `middlewares/auth.py` | WorkerAuthMiddleware + RequireWorkerMiddleware |
| Утилиты | `utils/telegram.py` | Управление топиками, отправка вопросов, уведомления |
| БД | `services/db.py` | Прямой доступ к PostgreSQL через asyncpg |
| Celery | `services/celery_client.py` | Постановка задач на обработку медиа |

**Алгоритм обработки медиа:**
1. Webhook получает сообщение из супергруппы
2. Определяет `message_thread_id` → находит Team по `topic_id`
3. Проверяет: автор в звене? Не пересылка?
4. Сохраняет метаданные в БД (`Media`, status=`pending`)
5. Ставит реакцию ✅ на сообщение
6. Ставит Celery-задачу на скачивание файла

### 3. Telegram Mini App — `/mini-app/`

**Расположение**: `mini-app/`  
**Стек**: React 18 + TypeScript + Vite + @telegram-apps/telegram-ui + @twa-dev/sdk

| Компонент | Расположение | Назначение |
|-----------|-------------|-----------|
| API-клиент | `src/api/client.ts` | HTTP-клиент к Django API |
| Telegram SDK | `src/lib/telegram.ts` | Обёртки: QR-сканер, геолокация, haptic, кнопки |
| Auth hook | `src/hooks/useAuth.ts` | Аутентификация через initData |
| i18n | `src/i18n/` | 4 языка: ru, uz, tg, ky |
| Worker | `src/pages/worker/` | Регистрация на смену (QR + гео) |
| Brigadier | `src/pages/brigadier/` | Звенья, медиа, создание звена, управление составом, создание отчёта |
| Contractor | `src/pages/contractor/` | Смены, монтажники, настройки с сохранением, дополнение отчёта, вопросы |

**Экраны Mini App:**
- `RegisterPage` — регистрация на смену (QR + гео)
- `BrigadierHome` — главная бригадира с активной сменой и звеньями
- `CreateTeamPage` — создание звена из зарегистрированных работников
- `TeamDetailPage` — детали звена: участники, медиа, действия
- `TeamMediaPage` — просмотр медиа звена
- `ReportCreatePage` — создание отчёта с выбором типа и медиа
- `TeamManagePage` — управление составом звена (добавление/удаление)
- `ContractorHome` — главная исполнителя: смены + звенья
- `OpenShiftPage` — открытие новой смены
- `WorkersPage` — управление монтажниками
- `SettingsPage` — настройки с сохранением в localStorage
- `SupplementReportPage` — дополнение существующего отчёта
- `AskQuestionPage` — вопросы по отчёту с ответами

**Аутентификация Mini App:**
1. Mini App получает `initData` из Telegram SDK
2. Отправляет на `POST /api/v1/worklog/auth/telegram/`
3. Backend валидирует HMAC-SHA256 подпись BOT_TOKEN
4. Находит Worker по `telegram_id`, возвращает JWT

### 4. Celery Worker

**Конфигурация**: `backend/finans_assistant/celery.py`  
**Broker**: Redis (localhost:6379)

Цепочка обработки медиа:
```
download_media_from_telegram
    └── upload_media_to_s3
            ├── compute_phash (дедупликация фото)
            ├── create_thumbnail (превью 320x320)
            └── transcribe_voice (ElevenLabs Scribe v2 — для voice/audio, языки: rus/uzb/tgk/kir)
```

Периодические задачи (Celery Beat):
```
auto_close_expired_shifts   — каждые 15 мин → закрывает истёкшие смены
    └── notify_shift_closed — уведомляет в топики о закрытии
send_report_warnings        — каждые 10 мин → предупреждает за 30 мин до конца смены
```

Дополнительные задачи:
```
create_team_forum_topic — создание топика при создании звена (вызывается из TeamViewSet.create)
```

### 5. Инфраструктура

| Сервис | Образ | Порты | Назначение |
|--------|-------|-------|-----------|
| Redis | redis:7-alpine | 6379 | Broker для Celery |
| MinIO | minio/minio:latest | 9000, 9001 | S3-совместимое хранилище медиа |
| PostgreSQL | — (локальный) | 5432 | Основная база данных |

Управление: `docker-compose.yml` в корне проекта.

### 6. ERP Frontend

**Интеграция**: вкладка "Журнал работ" в `ObjectDetail.tsx`

| Компонент | Назначение |
|-----------|-----------|
| `WorkJournalTab` | Корневой компонент вкладки — summary cards + секционная навигация |
| `SummaryCard` | Карточка со статистикой (смены, звенья, медиа, отчёты, монтажники) |
| `OverviewSection` | Обзор — таблица последних смен |
| `ShiftsSection` | Полный список смен с пагинацией и фильтрацией по статусу |
| `MediaSection` | Галерея медиа с фильтрами по типу (фото/видео) и тегу (прогресс/проблема) |
| `ReportsSection` | Таблица отчётов с фильтрацией по типу, кликабельные строки |
| `ReportDetailDialog` | Модальное окно детального просмотра отчёта с медиа и Q&A |
| `GeoSettingsSection` | Настройка гео-координат объекта (широта, долгота, радиус) |
| `SupergroupSection` | Просмотр привязанных Telegram-супергрупп |
| `MediaCard` | Карточка медиа — превью, автор, тег, дата |
| `PaginationBar` | Навигация по страницам |

**API-методы** (в `ApiClient`, `lib/api.ts`):
- `getWorkJournalSummary(objectId)` → сводка
- `getWorklogShifts(params)` → пагинированный список смен
- `getWorklogTeams(params)` → пагинированный список звеньев
- `getWorklogMedia(params)` → пагинированный список медиа
- `getWorklogReports(params)` → пагинированный список отчётов
- `getWorklogReportDetail(reportId)` → детали отчёта с медиа и вопросами
- `getWorklogQuestions(params)` → список вопросов
- `createWorklogQuestion(data)` → создание вопроса
- `answerWorklogQuestion(questionId, data)` → ответ на вопрос
- `updateObjectGeo(objectId, data)` → обновление гео-настроек
- `getWorklogSupergroups(params)` → список супергрупп

**Типы**: `WorklogShift`, `WorklogTeam`, `WorklogMedia`, `WorklogReport`, `WorklogReportDetail`, `WorklogQuestion`, `WorklogAnswer`, `WorklogSupergroup`, `WorkJournalSummary` в `lib/api.ts`

---

## Потоки данных

### Поток 1: Монтажник отправляет фото

```
Монтажник → [Telegram чат] → [Bot webhook] → [БД: Media(pending)]
                                    ↓
                              [Celery: download]
                                    ↓
                              [Celery: upload to S3]
                                    ↓
                         [Celery: phash + thumbnail]
                                    ↓
                         [БД: Media(downloaded)]
```

### Поток 2: Регистрация на смену

```
Монтажник → [Mini App: QR scan + Geo] → [API: POST /shifts/{id}/register/]
                                              ↓
                                    [Haversine: проверка геозоны]
                                              ↓
                                    [БД: ShiftRegistration(geo_valid)]
```

### Поток 3: Создание отчёта

```
Бригадир → [Mini App: выбор медиа] → [API: POST /reports/]
                                          ↓
                                    [БД: Report + Media.report_id]
                                          ↓
                              [ERP: отображение в журнале работ]
```

---

## Безопасность

| Компонент | Механизм |
|-----------|----------|
| Mini App → API | JWT (simplejwt) через initData аутентификацию |
| Bot → БД | Прямой доступ asyncpg (тот же сервер) |
| ERP → API | JWT (SessionAuthentication + JWTAuthentication) |
| initData | HMAC-SHA256 валидация с BOT_TOKEN |
| Геозона | Haversine distance ≤ Object.geo_radius |
| Медиа | Реакция только на сообщения из привязанных топиков, от зарегистрированных workers |

---

## Структура директорий

```
finans_assistant/
├── backend/
│   ├── worklog/                # Django app
│   │   ├── models.py           # 10 моделей
│   │   ├── serializers.py      # DRF-сериализаторы
│   │   ├── views.py            # ViewSets + auth + journal
│   │   ├── urls.py             # Router + кастомные
│   │   ├── tasks.py            # 8 Celery-задач (медиа + уведомления + транскрибация)
│   │   ├── admin.py            # Django Admin
│   │   └── migrations/
│   ├── finans_assistant/
│   │   ├── settings.py         # +Celery +MinIO +worklog
│   │   ├── celery.py           # Celery config
│   │   └── urls.py             # +worklog urls
│   ├── .env                    # Секреты (BOT_TOKEN, ELEVENLABS_API_KEY, SENTRY_DSN) — НЕ в Git
│   ├── .env.example            # Шаблон переменных окружения
│   └── requirements.txt        # +celery redis boto3 imagehash elevenlabs sentry-sdk
├── bot/                        # Telegram bot (aiogram 3.x)
│   ├── main.py                 # Entry point
│   ├── config.py               # pydantic-settings
│   ├── handlers/
│   │   ├── commands.py         # /start, /help
│   │   ├── media.py            # Обработка медиа
│   │   └── callbacks.py        # Inline-кнопки
│   ├── services/
│   │   ├── db.py               # asyncpg
│   │   └── celery_client.py    # Celery client
│   └── requirements.txt
├── mini-app/                   # Telegram Mini App
│   ├── src/
│   │   ├── pages/              # Экраны по ролям
│   │   ├── api/client.ts       # HTTP-клиент
│   │   ├── hooks/useAuth.ts    # Auth hook
│   │   ├── i18n/               # ru/uz/tg/ky
│   │   └── lib/telegram.ts     # SDK обёртки
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml          # Redis + MinIO
├── frontend/src/
│   ├── components/
│   │   ├── ObjectDetail.tsx    # +WorkJournalTab (полный интерфейс)
│   │   └── ui/                 # Shadcn UI (Badge, Tabs, Dialog...)
│   └── lib/
│       └── api.ts              # +5 Worklog API методов + типы
└── docs/work_logging/          # Документация
    ├── TESTING.md              # Стратегия тестирования + результаты
```
