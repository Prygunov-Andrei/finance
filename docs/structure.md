# Структура проекта

## Общая структура

```
finans_assistant/
├── backend/              # Django REST API
│   ├── contracts/        # Приложение договоров
│   ├── core/             # Общие компоненты (базовые модели)
│   ├── imports/          # Импорт данных
│   ├── objects/          # Приложение объектов
│   ├── payments/         # Приложение платежей
│   ├── finans_assistant/ # Настройки Django проекта
│   ├── manage.py         # Django management script
│   ├── requirements.txt  # Python зависимости
│   └── db.sqlite3        # База данных (разработка)
│
├── frontend/             # Next.js приложение (будет добавлено)
│
├── docs/                # Документация проекта
│   ├── planning/        # Планирование
│   └── sample_data/     # Тестовые данные
│
├── .gitignore           # Git ignore правила
└── README.md            # Основной README
```

## Backend структура

### Django приложения

- **objects** — управление строительными объектами
- **contracts** — управление договорами
- **payments** — управление платежами и реестром
- **imports** — импорт данных из файлов
- **core** — общие компоненты (TimestampedModel и т.д.)

### Файлы в каждом приложении

```
app_name/
├── __init__.py
├── admin.py          # Админка Django
├── apps.py           # Конфигурация приложения
├── models.py         # Модели данных
├── tests.py          # Unit-тесты
├── views.py          # Views (пока не используется)
└── migrations/       # Миграции БД
```

## Frontend структура

Будет создана на этапе Дни 22-24 по плану разработки.

Планируемая структура:
```
frontend/
├── src/
│   ├── app/          # Next.js App Router
│   ├── components/   # React компоненты
│   ├── lib/          # Утилиты
│   └── types/        # TypeScript типы
├── public/           # Статические файлы
└── package.json      # Node.js зависимости
```

## Документация

Документация организована по дням разработки:
- `day1_requirements.md` — аналитика
- `day2_data_formats.md` — форматы данных
- `day4_architecture.md` — архитектура
- `day5_models.md` — модели Object и Contract
- `day6_payments_models.md` — модели Payment и PaymentRegistry
- `day7_import_log.md` — модель ImportLog
- `plan_30_days.md` — общий план разработки

## Работа с проектом

### Backend

Все команды Django выполняются из папки `backend/`:

```bash
cd backend
python manage.py migrate
python manage.py runserver
python manage.py test
```

### Frontend

Будет добавлено позже.

