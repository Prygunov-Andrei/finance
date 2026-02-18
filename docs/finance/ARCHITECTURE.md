# Архитектура финансового модуля

**Файлы**: `backend/payments/`, `frontend/src/components/finance/`
**Обновлено**: Февраль 2026

---

## 1. ER-диаграмма моделей

```mermaid
erDiagram
    ExpenseCategory ||--o{ JournalEntry : "debit_entries"
    ExpenseCategory ||--o{ JournalEntry : "credit_entries"
    ExpenseCategory ||--o{ Invoice : "invoices"
    ExpenseCategory ||--o{ Invoice : "incoming_transfers"
    ExpenseCategory ||--o{ IncomeRecord : "income_records"
    ExpenseCategory }o--o| Object : "internal_account"
    ExpenseCategory }o--o| Contract : "internal_account"
    ExpenseCategory }o--o| ExpenseCategory : "parent → children"

    Invoice ||--o{ InvoiceItem : "items"
    Invoice ||--o{ InvoiceEvent : "events"
    Invoice ||--o{ JournalEntry : "journal_entries"
    Invoice }o--o| BankPaymentOrder : "bank_payment_order"
    Invoice }o--o| Counterparty : "counterparty"
    Invoice }o--o| Object : "object"
    Invoice }o--o| Contract : "contract"
    Invoice }o--o| Act : "act"
    Invoice }o--o| Account : "account"
    Invoice }o--o| LegalEntity : "legal_entity"

    IncomeRecord ||--o{ JournalEntry : "journal_entries"
    IncomeRecord }o--o| Account : "account"
    IncomeRecord }o--o| Object : "object"
    IncomeRecord }o--o| Contract : "contract"
    IncomeRecord }o--o| Act : "act"
    IncomeRecord }o--o| Counterparty : "counterparty"
    IncomeRecord }o--o| BankTransaction : "bank_transaction"

    RecurringPayment ||--o{ Invoice : "invoices"
    RecurringPayment }o--o| Counterparty : "counterparty"
    RecurringPayment }o--o| Account : "account"

    ExpenseCategory {
        int id PK
        string name
        string code UK
        string account_type
        int parent_id FK
        int object_id FK
        int contract_id FK
        bool is_active
    }

    Invoice {
        int id PK
        string invoice_type
        string source
        string status
        string invoice_number
        date invoice_date
        date due_date
        decimal amount_gross
        decimal vat_amount
        bool is_debt
        bool skip_recognition
    }

    JournalEntry {
        int id PK
        date date
        int from_account_id FK
        int to_account_id FK
        decimal amount
        string description
        int invoice_id FK
        int income_record_id FK
        bool is_auto
    }

    IncomeRecord {
        int id PK
        string income_type
        decimal amount
        date payment_date
        bool is_cash
        int object_id FK
        int account_id FK
    }

    InvoiceItem {
        int id PK
        int invoice_id FK
        string raw_name
        decimal quantity
        decimal price_per_unit
        decimal amount
    }

    InvoiceEvent {
        int id PK
        int invoice_id FK
        string event_type
        json old_value
        json new_value
    }
```

### Связи между моделями

| Модель | Связь | Описание |
|--------|-------|----------|
| **ExpenseCategory** | object → Object | 1:1, виртуальный счёт объекта |
| **ExpenseCategory** | contract → Contract | 1:1, субсчёт договора |
| **ExpenseCategory** | parent → self | Иерархия (договор → объект) |
| **JournalEntry** | from_account → ExpenseCategory | Дебет (откуда списываются) |
| **JournalEntry** | to_account → ExpenseCategory | Кредит (куда зачисляются) |
| **Invoice** | category → ExpenseCategory | Категория расхода |
| **Invoice** | target_internal_account → ExpenseCategory | Целевой счёт (внутренние переводы) |
| **Invoice** | bank_payment_order → BankPaymentOrder | 1:1, платёжное поручение |
| **IncomeRecord** | bank_transaction → BankTransaction | Привязка к банковской транзакции |

---

## 2. Жизненный цикл счёта (Invoice State Machine)

```mermaid
stateDiagram-v2
    [*] --> RECOGNITION: Создание (upload PDF)

    RECOGNITION --> REVIEW: LLM-распознавание завершено
    RECOGNITION --> REVIEW: Ошибка распознавания (вручную)

    REVIEW --> IN_REGISTRY: Оператор подтвердил (submit_to_registry)

    IN_REGISTRY --> APPROVED: Директор одобрил (approve)
    IN_REGISTRY --> CANCELLED: Директор отклонил (reject)
    IN_REGISTRY --> IN_REGISTRY: Перенос даты (reschedule)

    APPROVED --> SENDING: BankPaymentOrder отправлен в банк

    SENDING --> PAID: Банк подтвердил оплату

    PAID --> [*]
    CANCELLED --> [*]
```

### Описание статусов

| Статус | Описание | Кто переводит |
|--------|----------|---------------|
| **RECOGNITION** | PDF загружен, ожидает LLM-распознавания | Система (Celery) |
| **REVIEW** | Распознан, оператор проверяет данные | Оператор → submit_to_registry |
| **IN_REGISTRY** | В реестре оплат, ожидает согласования директором | Директор → approve / reject |
| **APPROVED** | Одобрен, BankPaymentOrder создан | Система → mark_sending |
| **SENDING** | Платёжное поручение отправлено в банк | Банк (webhook) → mark_paid |
| **PAID** | Оплачен. Создаются проводки | Финальный |
| **CANCELLED** | Отклонён директором | Финальный |

---

## 3. Потоки данных

### 3.1. Расходный поток (Invoice → JournalEntry)

```mermaid
sequenceDiagram
    participant User as Оператор
    participant API as Django API
    participant LLM as LLM Service
    participant JournalSvc as JournalService
    participant Bank as Tochka API
    participant DB as PostgreSQL

    User->>API: POST /invoices/ (upload PDF)
    API->>DB: Invoice (status=RECOGNITION)
    API->>LLM: Celery: recognize_invoice(id)
    LLM-->>DB: Заполнить поля, InvoiceItem[]
    DB-->>API: Invoice (status=REVIEW)

    User->>API: POST /invoices/{id}/submit_to_registry/
    API->>DB: status=IN_REGISTRY

    User->>API: POST /invoices/{id}/approve/
    API->>DB: status=APPROVED
    API->>DB: Создать BankPaymentOrder

    Bank-->>API: Webhook: оплата подтверждена
    API->>DB: status=PAID
    API->>JournalSvc: create_expense_postings(invoice)
    JournalSvc->>DB: JournalEntry (дебет объекта → кредит категории)
    JournalSvc->>DB: JournalEntry (НДС — если есть)
```

### 3.2. Доходный поток (IncomeRecord → JournalEntry)

```mermaid
sequenceDiagram
    participant User as Оператор
    participant API as Django API
    participant JournalSvc as JournalService
    participant DB as PostgreSQL

    User->>API: POST /income-records/
    API->>DB: IncomeRecord
    API->>JournalSvc: create_income_postings(income)
    JournalSvc->>DB: JournalEntry (кредит объекта/договора)
```

### 3.3. Ручная проводка

```mermaid
sequenceDiagram
    participant User as Директор
    participant API as Django API
    participant JournalSvc as JournalService
    participant DB as PostgreSQL

    User->>API: POST /journal-entries/manual/
    API->>JournalSvc: create_manual_posting(from, to, amount)
    JournalSvc->>DB: JournalEntry (is_auto=false)
```

---

## 4. Архитектура frontend

```
App.tsx (Routes)
├── /finance/dashboard → FinanceDashboard
├── /finance/payments → PaymentsTabPage
│   ├── ?tab=invoices → InvoicesTab
│   │   └── InvoiceCreateDialog (modal)
│   ├── ?tab=registry → PaymentRegistryTab
│   │   └── ActionDialog (reject/reschedule)
│   └── ?tab=income → IncomingPaymentsTab
│       └── CreateIncomeDialog (modal)
├── /finance/instructions → MarkdownPage (finance.md)
│
│   Redirects:
├── /payments → /finance/payments?tab=invoices
└── /payment-registry → /finance/payments?tab=registry
```

### Используемые технологии

| Библиотека | Назначение |
|-----------|-----------|
| TanStack Query | Кэширование API-запросов, invalidation |
| Radix UI (Tabs, Dialog, Select, Switch) | UI-компоненты |
| Tailwind CSS | Стилизация |
| Lucide Icons | Иконки |
| Sonner | Toast-уведомления |
| react-router | Маршрутизация, query params для табов |

---

## 5. Сигналы (Django Signals)

**Файл**: `backend/payments/signals.py`

| Signal | Sender | Действие |
|--------|--------|----------|
| `post_save` | `objects.Object` | Создаёт `ExpenseCategory(account_type='object')` |
| `post_save` | `contracts.Contract` | Создаёт `ExpenseCategory(account_type='contract')`, parent = счёт объекта |

Сигналы импортируются в `PaymentsConfig.ready()` (`apps.py`).

---

## 6. Миграции

| Миграция | Описание |
|----------|----------|
| `0012_finance_internal_accounts_journal.py` | Новые поля в ExpenseCategory, Invoice, IncomeRecord; модель JournalEntry |
| `0013_create_system_accounts.py` | Data migration: создание profit, working_capital, vat |
