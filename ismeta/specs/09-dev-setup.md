# 09. Локальная разработка и интеграционное тестирование

**Версия:** 0.1. **Назначение:** как поднять ISMeta + ERP локально, как тестировать стык.

## 1. Требования

| Компонент | Версия | Комментарий |
|---|---|---|
| Python | 3.12.x | Совпадает с текущим ERP |
| Node.js | 20 LTS | |
| PostgreSQL | 14+ | Один экземпляр, две БД: `erp` и `ismeta` |
| Redis | 7.x | Общий, с префиксами ключей |
| Docker + Docker Compose | актуальные | Для postgres/redis + моков |
| Make | любая | Для удобства команд |

## 2. Структура репозитория

```
ERP_Avgust/                # корень монорепы
├── backend/               # ERP backend (текущий)
├── frontend/              # ERP frontend (текущий)
├── bot/                   # telegram bot
├── mini-app/              # мобильный worklog
│
├── ismeta/                # НОВОЕ
│   ├── backend/           # Django проект ISMeta
│   │   ├── ismeta/        # settings, urls, wsgi
│   │   ├── workspace/     # models Workspace/Member, permissions
│   │   ├── estimate/      # Estimate, Section, Item + services
│   │   │   ├── matching/  # pipeline, tiers
│   │   │   ├── knowledge/ # ProductKnowledge, md-sync
│   │   │   └── excel/     # importer, exporter
│   │   ├── agent/         # LLM-агент (prompts, tools)
│   │   ├── integration/   # ERP-API клиент, webhook receiver, transmission
│   │   ├── common/        # redis_session, utils
│   │   ├── docs/openapi/  # сгенерированные YAML
│   │   └── tests/
│   ├── frontend/          # Next.js приложение
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/api/
│   │   └── widget/        # bundling для @ismeta/widget
│   ├── specs/             # эти документы
│   ├── CONCEPT.md
│   └── RESEARCH_NOTES.md
│
├── docs/ismeta/           # документация (dev, user, admin)
│   ├── dev/
│   ├── user/
│   └── admin/
│
├── tools/
│   ├── mocks/             # mock-сервисы (recognition, catalog)
│   └── dev-scripts/
│
├── dev-local.sh           # обновлённый: поднимает ERP + ISMeta
├── dev-stop.sh
└── CLAUDE.md
```

## 3. Переменные окружения

### 3.1 ISMeta backend (`ismeta/backend/.env.local`)

```bash
# БД
DATABASE_URL=postgres://ismeta:ismeta@localhost:5432/ismeta
REDIS_URL=redis://localhost:6379/2   # отдельная БД Redis

# ERP интеграция
ERP_BASE_URL=http://localhost:8000
ERP_MASTER_TOKEN=dev-master-token-change-me
ERP_WEBHOOK_SECRET=dev-webhook-secret-change-me

# Recognition
RECOGNITION_BASE_URL=http://localhost:8000   # через ERP
# на время моков:
# RECOGNITION_BASE_URL=http://localhost:5001

# LLM
LLM_PROVIDER_DEFAULT=openai
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...

# Прочее
DJANGO_SECRET_KEY=dev-secret-change-me
DEBUG=1
ALLOWED_HOSTS=localhost,127.0.0.1
WORKSPACE_DEV_SEED_UUIDS=wsp-aaaa-1111,wsp-bbbb-2222  # для early-test multi-tenant
```

### 3.2 ISMeta frontend (`ismeta/frontend/.env.local`)

```bash
NEXT_PUBLIC_ISMETA_API_URL=http://localhost:8001/api/v1
NEXT_PUBLIC_FEATURE_AGENT=true
NEXT_PUBLIC_DEFAULT_WORKSPACE=wsp-aaaa-1111
```

### 3.3 Дополнения к ERP (`backend/.env`)

Сохраняются текущие настройки ERP, добавляются:

```bash
ISMETA_BASE_URL=http://localhost:8001
ISMETA_WEBHOOK_SECRET=dev-webhook-secret-change-me   # тот же, что у ISMeta
ISMETA_OUTBOX_ENABLED=1
```

## 4. Команда старта

### 4.1 Первый запуск

```bash
make ismeta-setup        # создание БД, миграции, seed двух workspace'ов
make ismeta-frontend-install
```

### 4.2 Ежедневный запуск

```bash
./dev-local.sh           # поднимает postgres, redis, ERP backend, ERP frontend, ISMeta backend, ISMeta frontend
```

### 4.3 Остановка

```bash
./dev-stop.sh
```

## 5. Порты

| Компонент | Порт |
|---|---|
| ERP backend | 8000 |
| ERP frontend | 3000 |
| ISMeta backend | 8001 |
| ISMeta frontend | 3001 |
| Postgres | 5432 (БД `erp`, `ismeta`) |
| Redis | 6379 (БД 0 — ERP, 1 — Celery, 2 — ISMeta, 3 — ISMeta Celery) |
| Mock recognition | 5001 (если нужен) |
| Mock ERP catalog | 5002 (если нужен) |

## 6. Seed-данные для разработки

`make ismeta-seed` наполняет:
- 2 Workspace (`wsp-aaaa-1111` — «ERP Август dev», `wsp-bbbb-2222` — «Коробка тестовая»);
- По одному folder в каждом;
- По одной смете в каждом (пустой и с 20 строк для smoke-test);
- 10 образцов ProductKnowledge со статусами verified/pending;
- Mock-конфиг LLMProvider = OpenAI.

## 7. Mock-сервисы для разработки

### 7.1 Mock Recognition (`tools/mocks/recognition/`)

- Flask-приложение, порт 5001.
- Принимает multipart, возвращает фиксированный JSON через 2 секунды.
- Используется, когда реальный сервис распознавания не готов (E15 ещё не закрыт).
- Запуск: `make mock-recognition`.

### 7.2 Mock ERP Catalog (`tools/mocks/erp-catalog/`)

- Flask-приложение, порт 5002.
- Эмулирует `/api/erp-catalog/v1/*` endpoints с фикстурами (100 товаров, 238 работ, 5 грейдов).
- Используется для полностью offline-разработки ISMeta.
- Запуск: `make mock-erp-catalog`.

Переключение на mock — через `ERP_BASE_URL=http://localhost:5002`.

## 8. Интеграционное тестирование локально

### 8.1 Smoke-test связки

```bash
make ismeta-smoke
```

Что делает:
1. Создаёт тестовую смету через API ISMeta.
2. Добавляет 5 строк.
3. Запускает подбор работ (с mock LLM).
4. Отдаёт snapshot в ERP.
5. Ждёт, пока ERP вернёт webhook `contract.signed` (для smoke автоматически триггерится через ERP).
6. Проверяет, что смета в ISMeta помечена как transmitted.

### 8.2 Pact-тесты

- ISMeta как consumer, ERP как provider.
- Pact-файлы живут в `ismeta/backend/tests/pacts/`.
- `make ismeta-pact-consumer` — генерирует pact.
- `make ismeta-pact-provider` — проверяет ERP против pact'а ISMeta.
- В CI обе команды обязательны.

### 8.3 E2E Playwright

```bash
make ismeta-e2e
```

Запускает полную связку (ERP + ISMeta + моки) + Playwright по сценариям из `07-mvp-acceptance.md §3.1`.

## 9. Авторизация для dev

- Master-token — захардкоден в `.env.local`, легко меняется.
- В dev-режиме ERP автоматически отвечает на `/api/erp-auth/v1/ismeta/issue-jwt` для любого user_id, прописанного в seed ERP.
- Виджет в dev-frontend ERP принимает user_id из localStorage (`__DEV_USER_ID__`).

## 10. Отладка

### 10.1 Логи

- Каждый сервис пишет в `logs/ismeta-backend.log`, `logs/ismeta-frontend.log`.
- Уровень: `DEBUG` в dev, `INFO` в staging, `WARNING` в prod.

### 10.2 Инспекция очередей Celery

```bash
celery -A ismeta inspect active
celery -A ismeta inspect registered
```

### 10.3 Инспекция Redis

```bash
redis-cli -n 2 keys 'ws:*'
redis-cli -n 2 hgetall 'ws:wsp-aaaa-1111:match:session:...'
```

## 11. База данных: сброс и обновление

```bash
make ismeta-db-reset     # drop + create + migrate + seed
make ismeta-db-migrate   # только migrate
make ismeta-openapi      # регенерация OpenAPI из DRF
```

## 12. Работа с двумя workspace одновременно

В dev-frontend ISMeta есть переключатель workspace в header'е (только в dev-режиме). Позволяет быстро переключаться между `wsp-aaaa-1111` и `wsp-bbbb-2222` для проверки isolation.

В backend-тестах все unit-тесты прогоняются в рамках обоих workspace (фикстура `@pytest.fixture(params=['wsp-aaaa-1111','wsp-bbbb-2222'])`).

## 13. Работа с LLM локально

### 13.1 Через реальный провайдер

- Требует API-ключа в `.env.local`.
- Каждый вызов увеличивает счёт на токены.
- Логи в `logs/ismeta-backend.log` с пометкой `LLMUsage`.

### 13.2 Через cassette

- `ISMETA_LLM_MODE=cassette make ismeta-backend-run` — все вызовы идут в cassette.
- Cassette не найдена → ошибка, сметчик или разработчик должны обновить (см. `04-llm-agent.md §9`).

### 13.3 Через локальный Ollama

- Настроить `LLM_PROVIDER_DEFAULT=ollama`, `OLLAMA_BASE_URL=http://localhost:11434`.
- Нужна локально установленная модель.

## 14. Troubleshooting

| Симптом | Вероятная причина | Решение |
|---|---|---|
| ISMeta не может подключиться к ERP catalog | ERP не стартовал или неправильный URL | Проверить `curl http://localhost:8000/api/erp-catalog/v1/health` |
| Webhook не доходит | ERP-outbox worker не запущен | `make erp-outbox-worker` |
| JWT-ошибка в виджете | Master-token разошёлся между `.env` ERP и ISMeta | Сверить `ERP_MASTER_TOKEN` и `ISMETA_MASTER_TOKEN` |
| LLM-запросы падают | Нет API-ключа или закончилась квота | Проверить `OPENAI_API_KEY`; при квоте — переключиться на cassette |
| Celery-задача висит | Забитая очередь или упал worker | `make ismeta-celery-restart` |

## 15. Чек-лист «первого дня разработчика»

- [ ] Склонировал репозиторий.
- [ ] Установил dependencies (`make ismeta-setup`).
- [ ] Запустил `./dev-local.sh`, все сервисы поднялись.
- [ ] Прошёл `make ismeta-smoke` — зелёный.
- [ ] Открыл http://localhost:3001 — видит два workspace и тестовые сметы.
- [ ] Создал свой PR-черновик, прогнал CI локально через `make ismeta-ci-local`.
- [ ] Прочитал `01-data-model.md`, `02-api-contracts.md`, `09-dev-setup.md` (этот).
