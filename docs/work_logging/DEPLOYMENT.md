# Развёртывание сервиса фиксации работ

**Обновлено**: Февраль 2026

---

## Зависимости

### Системные сервисы

| Сервис | Версия | Порты | Назначение |
|--------|--------|-------|-----------|
| PostgreSQL | 14+ | 5432 | Основная БД (общая с ERP) |
| Redis | 7.x | 6379 | Broker для Celery |
| MinIO | latest | 9000 (API), 9001 (консоль) | S3-хранилище медиа |

### Запуск инфраструктуры

```bash
# Из корня проекта
docker-compose up -d

# Проверка
docker-compose ps
# redis      ... Up   0.0.0.0:6379->6379/tcp
# minio      ... Up   0.0.0.0:9000->9000/tcp, 0.0.0.0:9001->9001/tcp
```

MinIO консоль: http://localhost:9001 (логин: `minioadmin` / `minioadmin`)

Bucket `worklog-media` создаётся автоматически (сервис `createbuckets`).

---

## Backend (Django)

### Установка зависимостей

```bash
cd backend
pip install -r requirements.txt
```

Новые зависимости (добавлены в requirements.txt):
- `celery>=5.3.0`
- `redis>=5.0.0`
- `boto3>=1.34.0`
- `imagehash>=4.3.0`

### Миграции

```bash
cd backend
python manage.py migrate
```

Миграции:
- `objects/migrations/0004_add_geo_fields.py` — latitude, longitude, geo_radius в Object
- `worklog/migrations/0001_initial.py` — все модели worklog

### Настройки (`settings.py`)

Добавлены секции:

```python
# Celery
CELERY_BROKER_URL = 'redis://localhost:6379/0'
CELERY_RESULT_BACKEND = 'redis://localhost:6379/0'

# MinIO / S3
WORKLOG_S3_ENDPOINT_URL = 'http://localhost:9000'
WORKLOG_S3_ACCESS_KEY = 'minioadmin'
WORKLOG_S3_SECRET_KEY = 'minioadmin'
WORKLOG_S3_BUCKET_NAME = 'worklog-media'

# Telegram
TELEGRAM_BOT_TOKEN = ''  # ← заполнить!
```

### Запуск Celery Worker

```bash
cd backend
celery -A finans_assistant worker --loglevel=info
```

### Запуск Django

```bash
cd backend
python manage.py runserver
```

---

## Telegram Bot

### Создание бота

1. Написать @BotFather в Telegram
2. `/newbot` → получить BOT_TOKEN
3. Включить Inline Mode (`/setinline`)
4. Включить группы (`/setjoingroups`)

### Настройка

```bash
cd bot
pip install -r requirements.txt
cp .env.example .env
# Заполнить .env:
# BOT_TOKEN=123456:ABC-DEF...
# DB_HOST=localhost
# REDIS_URL=redis://localhost:6379/0
```

### Создание `.env` файла для бота

```env
BOT_TOKEN=<токен из @BotFather>
WEBHOOK_URL=
WEBHOOK_PATH=/bot/webhook
WEBAPP_HOST=0.0.0.0
WEBAPP_PORT=8081
DB_HOST=localhost
DB_PORT=5432
DB_NAME=finans_assistant
DB_USER=postgres
DB_PASSWORD=postgres
REDIS_URL=redis://localhost:6379/0
MINI_APP_URL=
```

### Запуск

```bash
# Разработка (polling)
cd bot
python main.py

# Production (webhook через ngrok)
ngrok http 8081
# Затем задать WEBHOOK_URL=https://xxx.ngrok-free.app
python main.py --webhook
```

---

## Mini App

### Установка

```bash
cd mini-app
npm install
```

### Настройка

```bash
# .env файл
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

### Разработка

```bash
npm run dev   # http://localhost:3001
```

### Подключение к Telegram

1. В @BotFather: `/newapp` или `/setmenubutton`
2. URL Mini App: `https://<ваш-домен>/` (нужен HTTPS)
3. Для разработки: ngrok → `ngrok http 3001`

### Production сборка

```bash
npm run build
# Результат в mini-app/dist/
# Развернуть на любом статическом хостинге (nginx, Vercel, etc.)
```

---

## ERP Frontend

Изменения минимальны — добавлена вкладка "Журнал работ" в `ObjectDetail.tsx`:

```bash
cd frontend
npm run dev   # как обычно
```

Новых зависимостей нет.

---

## Порядок запуска (полный)

```bash
# 1. Инфраструктура
docker-compose up -d

# 2. Миграции
cd backend && python manage.py migrate

# 3. Django
python manage.py runserver

# 4. Celery Worker (отдельный терминал)
celery -A finans_assistant worker --loglevel=info

# 5. Telegram Bot (отдельный терминал)
cd bot && python main.py

# 6. Mini App (отдельный терминал)
cd mini-app && npm run dev

# 7. ERP Frontend (отдельный терминал)
cd frontend && npm run dev
```

---

## Переменные окружения — сводка

| Компонент | Переменная | Значение по умолчанию |
|-----------|-----------|----------------------|
| Django | `CELERY_BROKER_URL` | `redis://localhost:6379/0` |
| Django | `WORKLOG_S3_ENDPOINT_URL` | `http://localhost:9000` |
| Django | `WORKLOG_S3_ACCESS_KEY` | `minioadmin` |
| Django | `WORKLOG_S3_SECRET_KEY` | `minioadmin` |
| Django | `WORKLOG_S3_BUCKET_NAME` | `worklog-media` |
| Django | `TELEGRAM_BOT_TOKEN` | — (обязательно) |
| Bot | `BOT_TOKEN` | — (обязательно) |
| Bot | `WEBHOOK_URL` | — (пусто = polling) |
| Bot | `DB_*` | localhost:5432 finans_assistant |
| Bot | `REDIS_URL` | `redis://localhost:6379/0` |
| Mini App | `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` |

---

## Проверка работоспособности инфраструктуры

После запуска всех сервисов выполните проверки:

```bash
# Redis
redis-cli ping
# → PONG

# MinIO
curl -s http://localhost:9000/minio/health/live
# → HTTP 200

# MinIO Console (браузер)
# http://localhost:9001 — логин minioadmin / minioadmin
# Bucket worklog-media должен быть создан

# Django
curl -s http://localhost:8000/api/v1/worklog/workers/ -H "Authorization: Bearer <token>"
# → JSON с пагинацией
```

---

## Тестирование

```bash
# Backend (90 тестов)
cd backend && python3 manage.py test worklog.tests --verbosity=2

# Bot (33 теста)
cd bot && python3 -m pytest tests/ -v

# Mini App (19 тестов)
cd mini-app && npm test
```

Подробнее: [TESTING.md](./TESTING.md)

---

## Мониторинг

- **Django Admin**: http://localhost:8000/admin/ — все модели worklog зарегистрированы
- **MinIO Console**: http://localhost:9001 — просмотр загруженных медиа
- **Celery**: `celery -A finans_assistant inspect active` — активные задачи
- **Redis**: `redis-cli monitor` — мониторинг broker
