# Telegram Bot — документация

**Расположение**: `/bot/`  
**Фреймворк**: aiogram 3.x (async Python)  
**Обновлено**: Февраль 2026

---

## Обзор

Бот работает в супергруппах с включённым Forum Mode (топики). Каждое звено — отдельный топик. Бот принимает медиа от монтажников, сохраняет метаданные и ставит задачи в Celery на обработку.

---

## Запуск

```bash
# Разработка (polling)
cd bot
pip install -r requirements.txt
python main.py

# Production (webhook)
python main.py --webhook
```

---

## Конфигурация (`config.py`)

| Переменная | По умолчанию | Описание |
|------------|-------------|----------|
| `BOT_TOKEN` | — | Токен бота из @BotFather |
| `WEBHOOK_URL` | — | URL для webhook (пусто = polling) |
| `WEBHOOK_PATH` | `/bot/webhook` | Путь webhook |
| `WEBAPP_HOST` | `0.0.0.0` | Хост aiohttp сервера |
| `WEBAPP_PORT` | `8081` | Порт aiohttp сервера |
| `DB_HOST` | `localhost` | PostgreSQL хост |
| `DB_PORT` | `5432` | PostgreSQL порт |
| `DB_NAME` | `finans_assistant` | Имя БД |
| `DB_USER` | `postgres` | Пользователь БД |
| `DB_PASSWORD` | `postgres` | Пароль БД |
| `REDIS_URL` | `redis://localhost:6379/0` | URL Redis (для Celery) |
| `MINI_APP_URL` | — | URL Mini App |

Настройки читаются из `.env` файла (pydantic-settings).

---

## Структура

```
bot/
├── main.py              # Entry point, webhook/polling, регистрация middleware
├── config.py            # pydantic-settings
├── .env.example         # Шаблон переменных окружения
├── handlers/
│   ├── commands.py      # /start, /help
│   ├── media.py         # Обработка фото/видео/голосовых
│   └── callbacks.py     # Inline-кнопки (ответы на вопросы)
├── services/
│   ├── db.py            # asyncpg — прямой доступ к PostgreSQL
│   └── celery_client.py # Постановка задач в Celery
├── middlewares/
│   └── auth.py          # WorkerAuthMiddleware + RequireWorkerMiddleware
├── utils/
│   └── telegram.py      # Управление топиками, отправка вопросов/уведомлений
├── tests/
│   ├── conftest.py      # Моки aiogram, asyncpg, данные
│   ├── test_handlers.py # 22 теста handlers
│   └── test_db.py       # 11 тестов db services
└── requirements.txt
```

---

## Handlers

### commands.py

| Команда | Описание |
|---------|----------|
| `/start` | Приветствие. Проверяет регистрацию Worker, помечает `bot_started=true`, даёт invite-ссылку |
| `/help` | Справка по использованию бота |

### media.py

Обрабатывает **все типы медиа** из супергрупп:

| Тип | Фильтр | Что сохраняется |
|-----|--------|----------------|
| Фото | `F.photo` | Наибольшее разрешение (`photo[-1]`) |
| Видео | `F.video` | file_id, duration, file_size |
| Голосовое | `F.voice` | file_id, duration |
| Аудио | `F.audio` | file_id, duration |
| Документ | `F.document` | file_id, file_size |
| Текст | `F.text` | text_content (без file_id) |

**Алгоритм `_process_media()`:**

1. Проверяет: это из супергруппы с topic? → иначе игнорирует
2. Ищет Worker по `telegram_id` → не найден = игнорирует
3. Проверяет: не пересылка? → пересылки удаляются
4. Ищет Team по `chat_id + topic_id` → не найдено = игнорирует
5. Проверяет: worker в этом звене? → нет = игнорирует (с логом)
6. Сохраняет `Media` в БД (status=`pending`)
7. Ставит реакцию ✅ (или отвечает "Принято ✅")
8. Ставит Celery-задачу `download_media_from_telegram`

### callbacks.py

Обработка inline-кнопок для ответов на вопросы.

**Формат callback_data:** `answer:{question_id}:{choice_index}`

---

## Services

### db.py (asyncpg)

Бот работает с PostgreSQL напрямую через asyncpg (без Django ORM) для максимальной производительности.

**Функции:**

| Функция | Описание |
|---------|----------|
| `get_pool()` | Создаёт/возвращает пул соединений |
| `close_pool()` | Закрывает пул |
| `find_worker_by_telegram_id(id)` | Ищет Worker |
| `mark_bot_started(id)` | Помечает bot_started=true |
| `find_team_by_topic(group_id, topic_id)` | Ищет активное звено по топику |
| `is_worker_in_team(worker_id, team_id)` | Проверяет членство |
| `save_media(...)` | Сохраняет метаданные медиа |
| `get_supergroup_invite_link(id)` | Получает invite-ссылку |
| `get_pending_questions(report_id)` | Неотвеченные вопросы для отчёта |
| `get_team_topic_info(team_id)` | topic_id + chat_id для звена |

### celery_client.py

Создаёт Celery-клиент и ставит задачи:

```python
schedule_media_download(media_id)  # → worklog.tasks.download_media_from_telegram
```

---

## Жизненный цикл

```
startup:
  1. Создаётся asyncpg pool (get_pool())
  2. Устанавливается webhook (если WEBHOOK_URL задан)

shutdown:
  1. Закрывается asyncpg pool
  2. Удаляется webhook

работа:
  - Принимает updates через webhook или polling
  - Обрабатывает через роутеры (commands → media → callbacks)
```

---

## Middleware (`middlewares/auth.py`)

| Middleware | Описание |
|-----------|----------|
| `WorkerAuthMiddleware` | Находит Worker по telegram_id из Message/CallbackQuery, добавляет в `data['worker']` |
| `RequireWorkerMiddleware` | Проверяет наличие `data['worker']`, блокирует необработанные updates |

Регистрируются глобально в `main.py`:
```python
dp.message.middleware(WorkerAuthMiddleware())
dp.callback_query.middleware(WorkerAuthMiddleware())
```

---

## Утилиты (`utils/telegram.py`)

| Функция | Описание |
|---------|----------|
| `create_forum_topic(bot, chat_id, name)` | Создаёт топик в супергруппе → message_thread_id |
| `close_forum_topic(bot, chat_id, thread_id)` | Закрывает топик |
| `reopen_forum_topic(bot, chat_id, thread_id)` | Переоткрывает топик |
| `rename_forum_topic(bot, chat_id, thread_id, name)` | Переименовывает топик |
| `create_chat_invite_link(bot, chat_id, name)` | Создаёт invite-ссылку |
| `send_to_topic(bot, chat_id, thread_id, text)` | Отправляет HTML-сообщение в топик |
| `build_question_keyboard(question_id, choices)` | Строит InlineKeyboardMarkup для вопроса |
| `send_question_to_topic(...)` | Отправляет вопрос с inline-кнопками в топик |
| `send_notification_to_topic(...)` | Отправляет уведомление в топик |
| `get_chat_member_count(bot, chat_id)` | Количество участников чата |

---

## Автоматические действия (Celery tasks)

| Task | Расписание | Описание |
|------|-----------|----------|
| `create_team_forum_topic` | По требованию (из TeamViewSet.create) | Создаёт топик при создании звена |
| `notify_shift_closed` | По требованию (из auto_close_expired_shifts) | Уведомляет все звенья о закрытии смены |
| `send_report_warnings` | Каждые 10 мин (Celery Beat) | Предупреждает за 30 мин до закрытия смены |
| `auto_close_expired_shifts` | Каждые 15 мин (Celery Beat) | Закрывает истёкшие смены |
| `transcribe_voice` | По требованию (после upload_media_to_s3) | Транскрибирует голосовые через ElevenLabs Scribe v2 (rus/uzb/tgk/kir) |
