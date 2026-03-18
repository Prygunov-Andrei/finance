# ERP Avgust

ERP-система для управления строительной компанией + портал климатической индустрии HVAC-info.com.

## Компоненты

| Компонент | Технология | Порт |
|-----------|-----------|------|
| ERP API | Django + DRF + Gunicorn | 8000 |
| HVAC API | Django + DRF + Gunicorn | 8001 |
| ERP Frontend | Next.js 16 App Router | 3000 |
| Telegram Bot | aiogram | 8081 |
| PostgreSQL | postgres:14-alpine | 5432 |
| Redis | redis:7-alpine | 6379 |
| MinIO | S3-совместимое хранилище | 9000/9001 |

## Быстрый старт (Docker)

```bash
cp .env.example .env   # отредактировать значения
./dev-local.sh         # поднять всё
./dev-stop.sh          # остановить
```

После запуска:
- **ERP**: http://localhost:3000/erp
- **HVAC портал**: http://localhost:3000
- **ERP API (Swagger)**: http://localhost:8000/api/docs/
- **MinIO Console**: http://localhost:9001

## Структура проекта

```
ERP_Avgust/
├── backend/           # Django ERP API (finans_assistant project)
│   ├── core/          # Базовые модели, auth, throttling, validators
│   ├── payments/services/  # invoice_service.py, payment_service.py
│   ├── banking/services/   # statement_sync.py, payment_order.py
│   ├── kanban_*/      # Канбан-модули (7 приложений, часть основного backend)
│   └── ...
├── frontend/          # Next.js 16 App Router
│   ├── app/erp/       # ERP-раздел (96 страниц, настоящий App Router)
│   ├── components/
│   │   ├── erp/       # ERP-компоненты
│   │   ├── hvac/      # HVAC-компоненты (отдельный продукт)
│   │   └── ui/        # shadcn/ui (единственная копия)
│   ├── lib/api/       # Модульный API-клиент (client.ts + types.ts)
│   └── hooks/erp-router.ts  # next/navigation совместимость
├── hvac-backend/      # Django HVAC API (отдельная БД)
├── bot/               # Telegram бот
├── docs/              # Документация
└── tests/e2e/         # E2E тесты
```

## Деплой

Документация: [docs/deploy/](docs/deploy/)

SSH-туннель к prod БД: `./dev-remote-db.sh` (читает credentials из `.env`)
