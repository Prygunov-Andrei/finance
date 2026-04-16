# ISMeta

Обособленный продукт для подготовки коммерческих смет с автоматическим подбором работ и материалов, LLM-агентом и двусторонней интеграцией с Excel.

## Где я?

Этот каталог — отдельная часть монорепозитория `ERP_Avgust`. Сюда складывается:
- концепция продукта (`CONCEPT.md`);
- заметки из исследования текущего ERP (`RESEARCH_NOTES.md`);
- архитектурная спецификация по 14 документам (`specs/`);
- рабочая документация (`docs/`): глоссарий, domain guide, ADR, эпики, контакты команды;
- код backend и frontend (`backend/`, `frontend/`) — скелеты; наполняем в эпике E1;
- вспомогательные инструменты (`tools/`): mock-серверы, скрипты.

## Быстрый старт

### Docker Compose (рекомендуется)

Поднимает весь dev-стек (postgres 14, redis 7, backend, frontend) одной командой. Требуется Docker 24+ и Compose v2.

```bash
cd ismeta
cp .env.example .env     # при первом запуске
docker compose up -d     # билд + старт, ~2-3 мин в первый раз
```

После старта (порты host-side — нестандартные, чтобы параллельно работал
ERP-стек на 5432/6379/8000/3000):

- backend: <http://localhost:8001/health> — liveness
- backend: <http://localhost:8001/api/v1/health/ready> — readiness (БД + Redis)
- frontend: <http://localhost:3001> — заглушка dev-окружения
- postgres: `localhost:5433` (db/user/password: `ismeta`)
- redis: `localhost:6380`

Полезные команды:
```bash
docker compose logs -f ismeta-backend       # логи backend
docker compose logs -f ismeta-frontend      # логи frontend
docker compose restart ismeta-backend       # рестарт одного сервиса
docker compose down                         # стоп (volume'ы сохраняются)
docker compose down -v                      # стоп + очистка БД и Redis
```

**Важно:** миграции и Django apps появляются в E1.2 — сейчас backend стартует, но `/api/v1/health/ready` может падать из-за отсутствия таблиц до первой миграции. Liveness (`/health`) работает всегда.

Порты можно переопределить через `.env`:
```
POSTGRES_PORT=5433
REDIS_PORT=6380
BACKEND_PORT=8001
FRONTEND_PORT=3001
```

### Чтение и онбординг

1. Прочти [`ONBOARDING.md`](./ONBOARDING.md) — чек-лист первой недели.
2. Прочти [`CONCEPT.md`](./CONCEPT.md) — что за продукт мы делаем.
3. Прочти [`GLOSSARY.md`](./GLOSSARY.md) и [`DOMAIN-GUIDE.md`](./DOMAIN-GUIDE.md) — предметная область.
4. Прочти [`specs/README.md`](./specs/README.md) — оглавление архитектурной спецификации.
5. Запусти локально — [`specs/09-dev-setup.md`](./specs/09-dev-setup.md).
6. Задай вопросы в `#ismeta-dev` (канал-заглушка — см. [`docs/TEAM.md`](./docs/TEAM.md)).

## Структура

```
ismeta/
├── README.md               ← ты здесь
├── ONBOARDING.md           чек-лист новичка
├── CONCEPT.md              концепция продукта
├── CONTRIBUTING.md         git flow и правила PR
├── CHANGELOG.md            история релизов
├── GLOSSARY.md             термины предметной области и технические
├── DOMAIN-GUIDE.md         краткий гид по смётной отрасли
├── RESEARCH_NOTES.md       заметки из анализа текущего ERP
│
├── specs/                  архитектурная спецификация
│   ├── README.md           оглавление
│   └── 01-14 *.md          14 документов
│
├── docs/                   рабочая документация
│   ├── TEAM.md             контакты и роли
│   ├── EPICS.md            детальные описания эпиков E1-E24
│   ├── adr/                architecture decision records
│   └── samples/            примеры данных (будущий sample-estimate.xlsx и др.)
│
├── backend/                Django-приложение (скелет)
├── frontend/               Next.js-приложение (скелет)
├── Makefile                команды разработчика
└── tools/                  вспомогательные утилиты
    └── mocks/              mock-серверы для локальной разработки
```

## Статус

- **Документация архитектуры** — утверждена (v0.3 концепции).
- **Код** — скелеты созданы, наполнение идёт по эпикам E1-E24.
- **Первый клиент** — ERP Август (dogfood силами команды).
- **Первый релиз в production** — по достижении критериев из [`specs/07-mvp-acceptance.md`](./specs/07-mvp-acceptance.md).

## Помощь

- Технические вопросы — `#ismeta-dev` (см. [`docs/TEAM.md`](./docs/TEAM.md)).
- Архитектурные — автор концепции + techlead.
- Предметная область — dogfood-сметчик из команды.
- Устал читать — в первую очередь читай [`ONBOARDING.md`](./ONBOARDING.md); там ссылки на всё самое важное.
