# Документация сервиса фиксации работ

Сервис автоматической фиксации работ на строительных объектах через Telegram.

---

## Содержание

| Документ | Описание |
|----------|----------|
| [CONCEPT.md](./CONCEPT.md) | Концепция сервиса v5.2 — бизнес-логика, роли, сценарии |
| [PRESENTATION.md](./PRESENTATION.md) | Презентация сервиса для заказчиков и команды |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Архитектура — компоненты, схема взаимодействия, потоки данных |
| [MODELS.md](./MODELS.md) | Модели данных — все 10 моделей, поля, связи, choices |
| [API.md](./API.md) | REST API — эндпоинты, форматы запросов/ответов, коды ошибок |
| [BOT.md](./BOT.md) | Telegram Bot — aiogram 3.x, handlers, алгоритм обработки медиа |
| [MINI_APP.md](./MINI_APP.md) | Mini App — React, экраны по ролям, Telegram SDK, i18n |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Развёртывание — зависимости, настройка, порядок запуска |
| [TESTING.md](./TESTING.md) | Тестирование — 199 unit-тестов, запуск, покрытие, стратегия моков |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | План реализации — 10 этапов, прогресс, тестирование, приоритеты |

---

## Быстрый старт

```bash
# 1. Инфраструктура
docker-compose up -d

# 2. Backend
cd backend && pip install -r requirements.txt && python manage.py migrate

# 3. Celery
celery -A finans_assistant worker --loglevel=info

# 4. Bot
cd bot && pip install -r requirements.txt && python main.py

# 5. Mini App
cd mini-app && npm install && npm run dev

# 6. ERP Frontend
cd frontend && npm run dev
```

Подробнее: [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## Текущий статус

- ✅ **Инфраструктура**: Docker (Redis + MinIO) запущена, зависимости установлены
- ✅ **Backend**: Модели, API, 8 Celery tasks (медиа + уведомления + транскрибация + автозакрытие), pytest + coverage
- ✅ **Bot**: Handlers, DB-сервис, middleware авторизации, утилиты Telegram — 33 теста, BOT_TOKEN получен (@avgust_tasks_bot)
- ✅ **Mini App**: 13 экранов, 4 языка, API-клиент, MediaViewer — 41 тест
- ✅ **ERP Frontend**: Журнал работ — обзор, смены, медиа, отчёты с Q&A, гео, супергруппы — 35 тестов
- ✅ **Доработки (Этап 8)**: Автосоздание топиков, уведомления, транскрибация (ElevenLabs Scribe v2), кэширование, Sentry, logging
- ✅ **CI/CD**: GitHub Actions — 5 jobs (backend, bot, mini-app, frontend, lint)
- ✅ **Тесты**: 199 unit-тестов пройдены (Backend 90 + Bot 33 + Mini App 41 + ERP Frontend 35)
- ✅ **Конфигурация**: BOT_TOKEN, ELEVENLABS_API_KEY, SENTRY_DSN — настроены через .env
- ⬜ **Интеграционное тестирование**: не начато (Этап 7)

Подробный прогресс: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)  
Тестирование: [TESTING.md](./TESTING.md)
