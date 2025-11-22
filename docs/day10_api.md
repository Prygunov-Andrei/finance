# День 10. REST API endpoints

## 1. Создание ViewSets

Созданы ViewSets для всех моделей проекта:

### ObjectViewSet (objects/views.py)
- **CRUD операции**: создание, чтение, обновление, удаление объектов
- **Фильтры**: нет базовых фильтров (можно добавить при необходимости)
- **Поиск**: по полям `name`, `address`, `description`
- **Сортировка**: по `name`, `created_at`, `updated_at`
- **Дополнительные endpoints**:
  - `GET /api/v1/objects/{id}/cash_flow/` — расчёт cash-flow для объекта
  - `GET /api/v1/objects/{id}/cash_flow_periods/` — cash-flow с разбивкой по периодам

### ContractViewSet (contracts/views.py)
- **CRUD операции**: создание, чтение, обновление, удаление договоров
- **Фильтры**: по `object`, `status`, `currency`
- **Поиск**: по полям `number`, `name`, `contractor`, `object__name`
- **Сортировка**: по `contract_date`, `total_amount`, `created_at`
- **Дополнительные endpoints**:
  - `GET /api/v1/contracts/{id}/cash_flow/` — расчёт cash-flow для договора
  - `GET /api/v1/contracts/{id}/cash_flow_periods/` — cash-flow с разбивкой по периодам

### PaymentViewSet (payments/views.py)
- **CRUD операции**: создание, чтение, обновление, удаление платежей
- **Фильтры**: по `contract`, `payment_type`, `contract__object`
- **Поиск**: по полям `description`, `company_account`, `contract__number`, `contract__object__name`
- **Сортировка**: по `payment_date`, `amount`, `created_at`

### PaymentRegistryViewSet (payments/views.py)
- **CRUD операции**: создание, чтение, обновление, удаление плановых платежей
- **Фильтры**: по `contract`, `status`, `contract__object`
- **Поиск**: по полям `comment`, `initiator`, `contract__number`, `contract__object__name`
- **Сортировка**: по `planned_date`, `amount`, `created_at`

### ImportLogViewSet (imports/views.py)
- **Только чтение**: просмотр журнала импортов (ReadOnlyModelViewSet)
- **Фильтры**: по `status`, `file_type`, `user`
- **Поиск**: по полям `file_name`, `import_batch_id`, `file_path`
- **Сортировка**: по `import_date`, `created_at`

## 2. Настройка URL-ов

Настроены URL-ы в `finans_assistant/urls.py`:
- Использован `DefaultRouter` для автоматической генерации URL-ов
- Все endpoints доступны по префиксу `/api/v1/`
- Корневой endpoint `/api/v1/` с описанием всех доступных endpoints

### Структура URL-ов:
```
/api/v1/objects/                    # Список объектов
/api/v1/objects/{id}/               # Детали объекта
/api/v1/objects/{id}/cash_flow/     # Cash-flow объекта
/api/v1/objects/{id}/cash_flow_periods/  # Cash-flow по периодам

/api/v1/contracts/                   # Список договоров
/api/v1/contracts/{id}/              # Детали договора
/api/v1/contracts/{id}/cash_flow/   # Cash-flow договора
/api/v1/contracts/{id}/cash_flow_periods/  # Cash-flow по периодам

/api/v1/payments/                    # Список платежей
/api/v1/payments/{id}/               # Детали платежа

/api/v1/payment-registry/            # Список плановых платежей
/api/v1/payment-registry/{id}/       # Детали планового платежа

/api/v1/imports/                     # Список импортов
/api/v1/imports/{id}/                # Детали импорта
```

## 3. Фильтрация и поиск

Все ViewSets поддерживают:
- **Фильтрацию** через query параметры (например: `?status=active&currency=RUB`)
- **Поиск** через параметр `search` (например: `?search=москва`)
- **Сортировку** через параметр `ordering` (например: `?ordering=-created_at`)
- **Пагинацию** (настроена в settings.py, по 20 записей на страницу)

## 4. Оптимизация запросов

Использованы `select_related` для оптимизации:
- `ContractViewSet`: `select_related('object')`
- `PaymentViewSet`: `select_related('contract', 'contract__object')`
- `PaymentRegistryViewSet`: `select_related('contract', 'contract__object')`
- `ImportLogViewSet`: `select_related('user')`

Это уменьшает количество запросов к БД при получении связанных объектов.

## 5. Сериализаторы

ViewSets автоматически используют:
- **List сериализаторы** для списков (упрощённые данные)
- **Полные сериализаторы** для деталей (все поля)

## 6. Зависимости

Добавлена зависимость:
- `django-filter==23.5` — для фильтрации через query параметры

## 7. Примеры использования

### Получить список объектов
```http
GET /api/v1/objects/
```

### Получить cash-flow для объекта за период
```http
GET /api/v1/objects/1/cash_flow/?start_date=2024-01-01&end_date=2024-12-31
```

### Получить cash-flow по месяцам
```http
GET /api/v1/objects/1/cash_flow_periods/?period_type=month&start_date=2024-01-01
```

### Фильтрация договоров
```http
GET /api/v1/contracts/?status=active&currency=RUB&ordering=-contract_date
```

### Поиск платежей
```http
GET /api/v1/payments/?search=материалы&payment_type=expense
```

## 8. Следующие шаги

- Добавить авторизацию и права доступа
- Создать OpenAPI/Swagger документацию
- Добавить валидацию на уровне ViewSets
- Реализовать экспорт данных в различных форматах

