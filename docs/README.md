# Документация проекта Finans Assistant

## Структура документации

### 📖 [PROJECT.md](./PROJECT.md)
Полное описание проекта, включающее:
- Общее описание и контекст
- Роли пользователей и требования
- Все сущности системы (модели данных)
- Система учёта (юридические лица, счета, налогообложение)
- Связи между сущностями
- Бизнес-логика (workflow снабжения, Invoice lifecycle, cash-flow)
- Архитектура системы
- API и сериализаторы
- Аутентификация и безопасность

### 🚚 Снабжение (Supply Module)

| Документ | Описание |
|----------|----------|
| [supply/BITRIX_SETUP.md](./supply/BITRIX_SETUP.md) | Инструкция по подключению и настройке Bitrix24 |
| [supply/WORKFLOW.md](./supply/WORKFLOW.md) | Workflow: от запроса до оплаты |

### 🏦 Банковская интеграция (Banking)

| Документ | Описание |
|----------|----------|
| [banking/statements.md](./banking/statements.md) | Синхронизация выписок |
| [banking/tochka-client.md](./banking/tochka-client.md) | Клиент банка Точка |
| [banking/permissions.md](./banking/permissions.md) | Права доступа |
| [banking/admin-setup.md](./banking/admin-setup.md) | Настройка через админку |
| [banking/security.md](./banking/security.md) | Безопасность |
| [banking/user-guide-controller.md](./banking/user-guide-controller.md) | Руководство Директора-контролёра |
| [banking/user-guide-operator.md](./banking/user-guide-operator.md) | Руководство Оператора |
| [banking/api-reference.md](./banking/api-reference.md) | Справочник API |
| [banking/architecture.md](./banking/architecture.md) | Архитектура модуля |

### 🧾 Парсинг счетов (Invoice Parsing)

| Документ | Описание |
|----------|----------|
| [IMPLEMENTATION_INVOICE_PARSING_BACKEND.md](./IMPLEMENTATION_INVOICE_PARSING_BACKEND.md) | План внедрения парсинга счетов через LLM на бекенде |
| [IMPLEMENTATION_INVOICE_PARSING_FRONTEND.md](./IMPLEMENTATION_INVOICE_PARSING_FRONTEND.md) | План внедрения UI для каталога товаров и парсинга счетов |

### 🔧 Сервис фиксации работ (Work Logging)

**Индекс**: [work_logging/README.md](./work_logging/README.md)

| Документ | Описание |
|----------|----------|
| [work_logging/CONCEPT.md](./work_logging/CONCEPT.md) | Концепция сервиса v5.2 — бизнес-логика, роли, сценарии |
| [work_logging/PRESENTATION.md](./work_logging/PRESENTATION.md) | Презентация сервиса |
| [work_logging/ARCHITECTURE.md](./work_logging/ARCHITECTURE.md) | Архитектура — компоненты, потоки данных |
| [work_logging/MODELS.md](./work_logging/MODELS.md) | Модели данных — 10 моделей, поля, связи |
| [work_logging/API.md](./work_logging/API.md) | REST API — эндпоинты, форматы |
| [work_logging/BOT.md](./work_logging/BOT.md) | Telegram Bot — aiogram 3.x |
| [work_logging/MINI_APP.md](./work_logging/MINI_APP.md) | Mini App — React, экраны, i18n |
| [work_logging/DEPLOYMENT.md](./work_logging/DEPLOYMENT.md) | Развёртывание и настройка |
| [work_logging/IMPLEMENTATION_PLAN.md](./work_logging/IMPLEMENTATION_PLAN.md) | План реализации с прогрессом |

### 📄 [schema.yaml](./schema.yaml)
OpenAPI схема API в формате YAML для интеграции и документации эндпоинтов.

### 📊 [sample_data/](./sample_data/)
Примеры данных для тестирования импорта:
- `balance_sample.xlsx` — пример файла задолженности
- `incomes_sample.xlsx` — пример файла поступлений
- `payments_actual_sample.xlsx` — пример фактических платежей
- `payments_plan_sample.xlsx` — пример плановых платежей

---

## Структура проекта

```
finans_assistant/
├── backend/          # Django REST API приложение
│   ├── core/         # Базовые модели, миксины, утилиты
│   ├── accounting/   # Юрлица, счета, контрагенты
│   ├── objects/      # Объекты строительства
│   ├── contracts/    # Договоры, акты
│   ├── payments/     # Счета на оплату (Invoice), доходы, периодические платежи
│   ├── banking/      # Интеграция с банком Точка
│   ├── catalog/      # Каталог товаров и услуг
│   ├── supply/       # Снабжение (Bitrix24 интеграция)
│   ├── personnel/    # Кадры, сотрудники
│   ├── communications/  # Переписка
│   ├── pricelists/   # Прайс-листы
│   ├── estimates/    # Проекты, сметы
│   ├── proposals/    # ТКП, МП
│   ├── llm_services/ # Парсинг счетов через LLM
│   └── worklog/      # Сервис фиксации работ
├── frontend/         # React + Vite приложение (ERP)
├── bot/              # Telegram бот (aiogram 3.x)
├── mini-app/         # Telegram Mini App (React + Vite)
├── deploy/           # Скрипты деплоя
└── docs/             # Документация проекта
```

---

## Команды для разработки

```bash
# Запуск бекенда
cd backend && python manage.py runserver

# Запуск фронтенда
cd frontend && npm run dev

# Запуск Celery worker
cd backend && celery -A finans_assistant worker -l info

# Запуск Celery beat
cd backend && celery -A finans_assistant beat -l info

# Миграции
python manage.py makemigrations
python manage.py migrate

# Тесты
pytest  # backend
cd frontend && npm test  # frontend
```

---

*Последнее обновление: Февраль 2026*
