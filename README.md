# Finans Assistant

Система для централизованного управления финансовыми данными строительной компании: объекты, договоры, сметы, платежи, ТКП/МП, каталог товаров с AI-парсингом счетов.

## Быстрый старт

### Требования

- **Python 3.10+**
- **Node.js 18+**
- **PostgreSQL 14+**

### Запуск проекта

```bash
# Запуск всего проекта одной командой
./start_dev.sh

# Или отдельно:
./start_dev.sh backend   # Только бекенд
./start_dev.sh frontend  # Только фронтенд
./start_dev.sh migrate   # Применить миграции
./start_dev.sh shell     # Django shell
```

После запуска:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs (Swagger)**: http://localhost:8000/api/schema/swagger-ui/

### Ручной запуск

**Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Структура проекта

```
finans_assistant/
├── backend/              # Django REST API
│   ├── core/             # Базовые модели, миксины, утилиты
│   ├── accounting/       # Юрлица, счета, контрагенты
│   ├── objects/          # Объекты строительства
│   ├── contracts/        # Договоры, акты
│   ├── payments/         # Платежи, реестры
│   ├── communications/   # Переписка
│   ├── pricelists/       # Прайс-листы на работы
│   ├── estimates/        # Проекты, сметы
│   ├── proposals/        # ТКП, МП
│   ├── catalog/          # Каталог товаров
│   └── llm_services/     # AI-парсинг счетов (OpenAI, Gemini, Grok)
├── frontend/             # React + Vite + TypeScript
│   └── src/
│       ├── components/   # UI компоненты
│       ├── lib/          # API клиент, утилиты
│       └── types/        # TypeScript типы
├── docs/                 # Документация
└── start_dev.sh          # Скрипт запуска
```

## Технологии

### Backend
- Django 4.2 + Django REST Framework
- PostgreSQL
- JWT авторизация
- OpenAPI/Swagger документация
- AI-парсинг счетов (OpenAI GPT-4o, Google Gemini, xAI Grok)

### Frontend
- React 18 + TypeScript
- Vite
- Shadcn UI + Radix
- TanStack Query (React Query)
- Tailwind CSS
- Recharts

## Переменные окружения

### Backend (.env)
```bash
# LLM провайдеры (опционально, для парсинга счетов)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
GROK_API_KEY=...
```

### Frontend (.env)
```bash
# Опционально, по умолчанию localhost:8000
VITE_API_URL=http://localhost:8000/api/v1
```

## Документация

Подробная документация находится в папке [`docs/`](./docs/README.md):
- [PROJECT.md](./docs/PROJECT.md) — полное описание проекта и API
- [IMPLEMENTATION_INVOICE_PARSING_*.md](./docs/) — документация по AI-парсингу счетов

---

*Последнее обновление: Январь 2026*
