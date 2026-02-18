# REST API финансового модуля

**Базовый URL**: `/api/v1/`
**Аутентификация**: JWT Bearer
**Формат**: JSON
**Обновлено**: Февраль 2026

---

## Внутренний план счетов (ExpenseCategory)

### GET `/expense-categories/`

Список счетов. Неактивные видны только `is_staff`.

**Фильтры**: `parent`, `is_active`, `requires_contract`, `account_type`
**Поиск**: `name`, `code`, `description`
**Сортировка**: `sort_order`, `name`, `created_at`

**Response 200:**
```json
{
  "count": 15,
  "results": [
    {
      "id": 1,
      "name": "Аренда",
      "code": "rent",
      "account_type": "expense",
      "account_type_display": "Расходная категория",
      "parent": null,
      "parent_name": null,
      "full_path": "Аренда",
      "object": null,
      "object_name": null,
      "contract": null,
      "contract_number": null,
      "description": "",
      "is_active": true,
      "requires_contract": false,
      "sort_order": 0,
      "balance": null
    },
    {
      "id": 10,
      "name": "Объект: ЖК Солнце",
      "code": "obj_5",
      "account_type": "object",
      "account_type_display": "Счёт объекта",
      "balance": "1250000.00"
    }
  ]
}
```

Поле `balance` возвращается только для типов `system`, `object`, `contract`.

### GET `/expense-categories/{id}/`

Детали счёта.

### POST `/expense-categories/`

Создание нового счёта.

```json
{
  "name": "Канцелярия",
  "code": "office_supplies",
  "account_type": "expense",
  "parent": 1,
  "description": "Канцелярские принадлежности"
}
```

### GET `/expense-categories/{id}/balance/`

Баланс конкретного счёта.

**Response 200:**
```json
{
  "id": 10,
  "name": "Объект: ЖК Солнце",
  "code": "obj_5",
  "account_type": "object",
  "balance": "1250000.00"
}
```

---

## Счета на оплату (Invoice)

### GET `/invoices/`

Список счетов. Использует `InvoiceListSerializer` (сокращённый).

**Фильтры**: `status`, `source`, `invoice_type`, `is_debt`, `object`, `counterparty`, `category`, `account`
**Поиск**: `invoice_number`, `counterparty__name`, `description`
**Сортировка**: `created_at`, `due_date`, `amount_gross`, `invoice_date`

**Response 200:**
```json
{
  "count": 42,
  "results": [
    {
      "id": 1,
      "invoice_type": "supplier",
      "invoice_type_display": "От Поставщика",
      "source": "manual",
      "source_display": "Ручной ввод",
      "status": "in_registry",
      "status_display": "В реестре",
      "invoice_number": "СЧ-2026-001",
      "invoice_date": "2026-02-10",
      "due_date": "2026-02-20",
      "counterparty": 5,
      "counterparty_name": "ООО СтройМатериал",
      "object": 3,
      "object_name": "ЖК Солнце",
      "category_name": "Строительные материалы",
      "account_name": "Расчётный Сбербанк",
      "amount_gross": "150000.00",
      "amount_net": "125000.00",
      "vat_amount": "25000.00",
      "is_overdue": false,
      "is_debt": false,
      "skip_recognition": false,
      "created_at": "2026-02-10T12:00:00Z"
    }
  ]
}
```

### GET `/invoices/{id}/`

Детали счёта. Использует `InvoiceDetailSerializer` (полный, с items и events).

### POST `/invoices/`

Создание счёта. Поддерживает `multipart/form-data` для загрузки файла.

```json
{
  "invoice_type": "supplier",
  "invoice_file": "<binary>",
  "object": 3,
  "contract": 7,
  "counterparty": 5,
  "account": 1,
  "legal_entity": 2,
  "amount_gross": "150000.00",
  "vat_amount": "25000.00",
  "due_date": "2026-02-20",
  "is_debt": false,
  "skip_recognition": false,
  "description": "Оплата за материалы"
}
```

При создании:
1. Статус устанавливается `RECOGNITION`
2. Если есть файл и `skip_recognition=false` → запускается Celery-задача `recognize_invoice`

### POST `/invoices/{id}/submit_to_registry/`

Оператор подтвердил. **REVIEW → IN_REGISTRY**.

**Response 200:** InvoiceDetailSerializer

**Ошибки:** `400` если статус ≠ REVIEW

### POST `/invoices/{id}/approve/`

Директор одобрил. **IN_REGISTRY → APPROVED**. Автоматически создаёт BankPaymentOrder.

```json
{
  "comment": "Оплатить до конца недели"
}
```

**Ошибки:** `400` если статус ≠ IN_REGISTRY

### POST `/invoices/{id}/reject/`

Директор отклонил. **IN_REGISTRY → CANCELLED**.

```json
{
  "comment": "Слишком дорого, найти другого поставщика"
}
```

**Ошибки:**
- `400` если нет комментария
- `400` если статус ≠ IN_REGISTRY

### POST `/invoices/{id}/reschedule/`

Перенос даты оплаты. Статус остаётся `IN_REGISTRY`.

```json
{
  "new_date": "2026-03-01",
  "comment": "Перенос на следующий месяц"
}
```

**Ошибки:**
- `400` если нет `new_date` или комментария
- `400` если статус ≠ IN_REGISTRY

### GET `/invoices/check_balance/`

Проверка баланса объекта перед оплатой.

**Query params**: `object_id`, `amount`

**Response 200:**
```json
{
  "sufficient": false,
  "balance": "100000.00",
  "deficit": "50000.00"
}
```

### GET `/invoices/dashboard/`

Сводная аналитика для директора.

**Response 200:**
```json
{
  "account_balances": [
    {
      "id": 1,
      "name": "Расчётный Сбербанк",
      "number": "40702810...",
      "currency": "RUB",
      "internal_balance": "5000000.00",
      "bank_balance": "5100000.00",
      "bank_balance_date": "2026-02-18"
    }
  ],
  "registry_summary": {
    "total_amount": "3500000.00",
    "total_count": 15,
    "overdue_amount": "200000.00",
    "overdue_count": 2,
    "today_amount": "350000.00",
    "today_count": 3,
    "this_week_amount": "1200000.00",
    "this_week_count": 7,
    "this_month_amount": "2800000.00",
    "this_month_count": 12
  },
  "by_object": [
    {
      "object__id": 3,
      "object__name": "ЖК Солнце",
      "total": "2000000.00",
      "count": 8
    }
  ],
  "by_category": [
    {
      "category__id": 1,
      "category__name": "Строительные материалы",
      "total": "1500000.00",
      "count": 6
    }
  ]
}
```

---

## Поступления (IncomeRecord)

### GET `/income-records/`

**Фильтры**: `account`, `category`, `counterparty`, `income_type`, `object`, `is_cash`
**Поиск**: `description`, `counterparty__name`

### POST `/income-records/`

```json
{
  "income_type": "customer_act",
  "account": 1,
  "object": 3,
  "contract": 7,
  "act": 12,
  "category": 4,
  "legal_entity": 2,
  "counterparty": 8,
  "amount": "500000.00",
  "payment_date": "2026-02-15",
  "is_cash": false,
  "description": "Оплата по акту №12"
}
```

---

## Проводки (JournalEntry)

### GET `/journal-entries/`

**Фильтры**: `from_account`, `to_account`, `is_auto`, `invoice`, `income_record`
**Поиск**: `description`
**Сортировка**: `date`, `amount`, `created_at`

**Response 200:**
```json
{
  "count": 50,
  "results": [
    {
      "id": 1,
      "date": "2026-02-15",
      "from_account": 10,
      "from_account_name": "Объект: ЖК Солнце",
      "to_account": 1,
      "to_account_name": "Строительные материалы",
      "amount": "150000.00",
      "description": "Оплата: Счёт СЧ-2026-001",
      "invoice": 1,
      "invoice_number": "СЧ-2026-001",
      "income_record": null,
      "created_by": 3,
      "created_by_name": "Иван Иванов",
      "is_auto": true,
      "created_at": "2026-02-15T14:30:00Z"
    }
  ]
}
```

### POST `/journal-entries/manual/`

Создание ручной проводки между счетами.

**Request:**
```json
{
  "from_account": 10,
  "to_account": 2,
  "amount": "500000.00",
  "description": "Вывод прибыли с объекта ЖК Солнце",
  "date": "2026-02-15"
}
```

**Response 201:** JournalEntrySerializer

**Ошибки:**
- `400` если не указаны `from_account`, `to_account`, `amount`
- `400` если `from_account == to_account`
- `404` если счёт не найден

---

## Периодические платежи (RecurringPayment)

### GET `/recurring-payments/`

**Фильтры**: `is_active`, `frequency`, `counterparty`
**Поиск**: `name`, `counterparty__name`, `description`

### POST `/recurring-payments/`

```json
{
  "name": "Аренда офиса",
  "counterparty": 5,
  "category": 1,
  "account": 1,
  "legal_entity": 2,
  "amount": "80000.00",
  "amount_is_fixed": true,
  "frequency": "monthly",
  "day_of_month": 1,
  "start_date": "2026-01-01",
  "next_generation_date": "2026-03-01"
}
```

---

## LEGACY-эндпоинты

### GET/POST `/payments/`

Фактические платежи (старая система). Используется до полной миграции на Invoice.

### GET `/payment-registry/`

Реестр платежей (старая система). Actions: `approve`, `pay`, `cancel`.

---

## Пагинация

Все list-эндпоинты используют `PageNumberPagination` (по умолчанию 20):

```json
{
  "count": 100,
  "next": "http://localhost:8000/api/v1/invoices/?page=2",
  "previous": null,
  "results": [...]
}
```

---

## Коды ошибок

| Код | Описание |
|-----|----------|
| 200 | Успех |
| 201 | Создано |
| 400 | Ошибка валидации / бизнес-логики |
| 401 | Не авторизован |
| 404 | Не найдено |
| 405 | Метод не разрешён |

---

## OpenAPI / Swagger

Документация автоматически генерируется через `drf-spectacular`:

- **Swagger UI**: `/api/schema/swagger-ui/`
- **ReDoc**: `/api/schema/redoc/`
- **OpenAPI JSON**: `/api/schema/`

Теги: `Платежи`, `Реестр платежей`, `Категории`, `Счета на оплату`, `Проводки`, `Внутренний план счетов`
