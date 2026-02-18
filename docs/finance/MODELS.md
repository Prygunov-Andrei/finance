# Модели данных финансового модуля

**Файл**: `backend/payments/models.py`
**Обновлено**: Февраль 2026

Все модели наследуются от `TimestampedModel` (поля `created_at`, `updated_at`).

---

## Схема связей

```
ExpenseCategory (Внутренний план счетов)
      │
      ├── parent → self (иерархия)
      ├── object → Object (1:1, виртуальный счёт)
      ├── contract → Contract (1:1, субсчёт)
      │
      ├──── JournalEntry.from_account (дебет)
      ├──── JournalEntry.to_account (кредит)
      │
      ├──── Invoice.category
      ├──── Invoice.target_internal_account
      ├──── IncomeRecord.category
      │
      ├──── Payment.category (LEGACY)
      └──── PaymentRegistry.category (LEGACY)

Invoice (Счёт на оплату)
      │
      ├── items → InvoiceItem[]
      ├── events → InvoiceEvent[]
      ├── journal_entries → JournalEntry[]
      ├── bank_payment_order → BankPaymentOrder (1:1)
      ├── counterparty → Counterparty
      ├── object → Object
      ├── contract → Contract
      ├── act → Act
      ├── category → ExpenseCategory
      └── target_internal_account → ExpenseCategory

IncomeRecord (Поступление)
      │
      ├── journal_entries → JournalEntry[]
      ├── object → Object
      ├── contract → Contract
      ├── act → Act
      ├── bank_transaction → BankTransaction
      └── category → ExpenseCategory
```

---

## 1. ExpenseCategory (Внутренний план счетов)

Единая модель для всех типов внутренних счетов компании.

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | Integer | PK, auto | Уникальный ID |
| `name` | CharField(255) | required | Название счёта |
| `code` | CharField(100) | unique | Уникальный код (`salary`, `rent`, `profit`, `obj_123`) |
| `account_type` | CharField(20) | choices | Тип счёта |
| `parent` | FK → self | CASCADE, nullable | Родительский счёт |
| `object` | OneToOne → Object | CASCADE, nullable | Для типа OBJECT |
| `contract` | OneToOne → Contract | CASCADE, nullable | Для типа CONTRACT |
| `description` | TextField | blank | Описание |
| `is_active` | Boolean | default=True | Активен |
| `requires_contract` | Boolean | default=False | Требует указания договора |
| `sort_order` | PositiveInteger | default=0 | Порядок сортировки |

**Choices (AccountType)**:

| Значение | Описание | Создание |
|----------|----------|----------|
| `expense` | Расходная категория | Вручную через admin/API |
| `income` | Доходная категория | Вручную через admin/API |
| `system` | Системный счёт | Data migration (profit, working_capital, vat) |
| `object` | Виртуальный счёт объекта | Автоматически (signal post_save Object) |
| `contract` | Субсчёт договора | Автоматически (signal post_save Contract) |

**Методы**:

| Метод | Описание |
|-------|----------|
| `get_balance()` | Баланс = Σ кредитов − Σ дебетов (по JournalEntry) |
| `get_full_path()` | Полный путь: `Parent → Child` |
| `clean()` | Валидация: проверка циклических ссылок в иерархии |

**Индексы**: `code`, `(parent, is_active)`, `account_type`

---

## 2. Invoice (Счёт на оплату)

Центральная сущность для всех расходов. Заменяет Payment + PaymentRegistry.

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | Integer | PK | |
| `invoice_type` | CharField(20) | choices, default=SUPPLIER | Тип счёта |
| `source` | CharField(20) | choices, default=MANUAL | Источник |
| `status` | CharField(20) | choices, default=RECOGNITION | Статус workflow |
| `invoice_file` | FileField | nullable | PDF счёта |
| `invoice_number` | CharField(100) | blank | Номер счёта |
| `invoice_date` | DateField | nullable | Дата счёта |
| `due_date` | DateField | nullable | Срок оплаты |
| `counterparty` | FK → Counterparty | PROTECT, nullable | Контрагент |
| `object` | FK → Object | SET_NULL, nullable | Объект |
| `contract` | FK → Contract | SET_NULL, nullable | Договор |
| `act` | FK → Act | SET_NULL, nullable | Акт (для ACT_BASED) |
| `category` | FK → ExpenseCategory | PROTECT, nullable | Категория / счёт плана |
| `target_internal_account` | FK → ExpenseCategory | SET_NULL, nullable | Целевой счёт (внутренние переводы) |
| `account` | FK → Account | PROTECT, nullable | Счёт списания |
| `legal_entity` | FK → LegalEntity | PROTECT, nullable | Юридическое лицо |
| `is_debt` | Boolean | default=False | Долговой счёт |
| `skip_recognition` | Boolean | default=False | Пропустить LLM-распознавание |
| `amount_gross` | Decimal(14,2) | nullable | Сумма с НДС |
| `amount_net` | Decimal(14,2) | nullable | Сумма без НДС |
| `vat_amount` | Decimal(14,2) | nullable | Сумма НДС |
| `created_by` | FK → User | SET_NULL, nullable | Создал |
| `reviewed_by` | FK → User | SET_NULL, nullable | Проверил (оператор) |
| `reviewed_at` | DateTime | nullable | Дата проверки |
| `approved_by` | FK → User | SET_NULL, nullable | Одобрил (директор) |
| `approved_at` | DateTime | nullable | Дата одобрения |
| `paid_at` | DateTime | nullable | Дата оплаты |
| `bank_payment_order` | OneToOne → BankPaymentOrder | SET_NULL, nullable | Платёжное поручение |
| `supply_request` | FK → SupplyRequest | SET_NULL, nullable | Запрос снабжения |
| `recurring_payment` | FK → RecurringPayment | SET_NULL, nullable | Периодический платёж |
| `parsed_document` | FK → ParsedDocument | SET_NULL, nullable | LLM-документ |
| `recognition_confidence` | Float | nullable | Уверенность LLM |
| `description` | TextField | blank | Назначение платежа |
| `comment` | TextField | blank | Комментарий директора |

**Choices (InvoiceType)**:

| Значение | Описание |
|----------|----------|
| `supplier` | От Поставщика |
| `act_based` | По Акту выполненных работ |
| `household` | Хозяйственная деятельность |
| `warehouse` | Закупка на склад |
| `internal_transfer` | Внутренний перевод |

**Choices (Source)**: `bitrix`, `manual`, `recurring`

**Choices (Status)**: `recognition`, `review`, `in_registry`, `approved`, `sending`, `paid`, `cancelled`

**Property**: `is_overdue` — `True` если `due_date < today` и статус не `paid`/`cancelled`

**Индексы**: `status`, `source`, `due_date`, `(status, due_date)`, `(object, status)`, `(counterparty, status)`, `invoice_type`, `is_debt`

---

## 3. InvoiceItem (Позиция счёта)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | Integer | PK | |
| `invoice` | FK → Invoice | CASCADE | Счёт |
| `product` | FK → Product | SET_NULL, nullable | Товар из каталога |
| `raw_name` | CharField(500) | required | Исходное название из счёта |
| `quantity` | Decimal(14,3) | required | Количество |
| `unit` | CharField(50) | blank | Единица измерения |
| `price_per_unit` | Decimal(14,2) | required | Цена за единицу |
| `amount` | Decimal(14,2) | required | Сумма |
| `vat_amount` | Decimal(14,2) | nullable | НДС по позиции |

---

## 4. InvoiceEvent (Аудит-лог)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | Integer | PK | |
| `invoice` | FK → Invoice | CASCADE | Счёт |
| `event_type` | CharField(30) | choices | Тип события |
| `user` | FK → User | SET_NULL, nullable | Пользователь |
| `old_value` | JSONField | nullable | Предыдущее значение |
| `new_value` | JSONField | nullable | Новое значение |
| `comment` | TextField | blank | Комментарий |

**Choices (EventType)**: `created`, `recognized`, `reviewed`, `sent_to_registry`, `approved`, `rejected`, `rescheduled`, `sent_to_bank`, `paid`, `cancelled`, `comment`

---

## 5. IncomeRecord (Поступление)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | Integer | PK | |
| `income_type` | CharField(20) | choices, default=OTHER | Тип поступления |
| `account` | FK → Account | PROTECT | Счёт зачисления |
| `object` | FK → Object | SET_NULL, nullable | Объект |
| `contract` | FK → Contract | SET_NULL, nullable | Договор |
| `act` | FK → Act | SET_NULL, nullable | Акт |
| `category` | FK → ExpenseCategory | PROTECT | Счёт плана |
| `legal_entity` | FK → LegalEntity | PROTECT | Юр. лицо |
| `counterparty` | FK → Counterparty | SET_NULL, nullable | Контрагент |
| `bank_transaction` | FK → BankTransaction | SET_NULL, nullable | Банковская транзакция |
| `amount` | Decimal(14,2) | required | Сумма |
| `payment_date` | DateField | required | Дата поступления |
| `is_cash` | Boolean | default=False | Наличный платёж |
| `description` | TextField | blank | Описание |
| `scan_file` | FileField | nullable | Скан документа |

**Choices (IncomeType)**:

| Значение | Описание | Проводка |
|----------|----------|----------|
| `customer_act` | Оплата по Акту от Заказчика | → счёт объекта |
| `advance` | Авансовый платёж | → счёт объекта |
| `warranty_return` | Возврат гарантийных удержаний | → счёт объекта |
| `supplier_return` | Возврат от Поставщика | → Прибыль |
| `bank_interest` | Проценты банка | → Прибыль |
| `other` | Прочие поступления | → Прибыль |

**Индексы**: `payment_date`, `(account, payment_date)`, `income_type`, `(object, payment_date)`

---

## 6. JournalEntry (Проводка)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | Integer | PK | |
| `date` | DateField | required | Дата проводки |
| `from_account` | FK → ExpenseCategory | PROTECT | Дебет (откуда) |
| `to_account` | FK → ExpenseCategory | PROTECT | Кредит (куда) |
| `amount` | Decimal(14,2) | required | Сумма |
| `description` | TextField | blank | Описание |
| `invoice` | FK → Invoice | SET_NULL, nullable | Связанный счёт |
| `income_record` | FK → IncomeRecord | SET_NULL, nullable | Связанное поступление |
| `created_by` | FK → User | SET_NULL, nullable | Создал |
| `is_auto` | Boolean | default=False | Автоматическая проводка |

**Валидация**: `from_account` ≠ `to_account`

**Индексы**: `date`, `(from_account, date)`, `(to_account, date)`

---

## 7. RecurringPayment (Периодический платёж)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | Integer | PK | |
| `name` | CharField(255) | required | Название |
| `counterparty` | FK → Counterparty | PROTECT | Контрагент |
| `category` | FK → ExpenseCategory | PROTECT | Категория |
| `account` | FK → Account | PROTECT | Счёт списания |
| `contract` | FK → Contract | SET_NULL, nullable | Договор |
| `object` | FK → Object | SET_NULL, nullable | Объект |
| `legal_entity` | FK → LegalEntity | PROTECT | Юр. лицо |
| `amount` | Decimal(14,2) | required | Базовая сумма |
| `amount_is_fixed` | Boolean | default=True | Фиксированная сумма |
| `frequency` | CharField(20) | choices, default=MONTHLY | Периодичность |
| `day_of_month` | PositiveInteger | default=1 | День месяца (1-28) |
| `start_date` | DateField | required | Дата начала |
| `end_date` | DateField | nullable | Дата окончания |
| `next_generation_date` | DateField | required | Следующая генерация |
| `description` | TextField | blank | Описание |
| `is_active` | Boolean | default=True | Активен |

**Choices (Frequency)**: `monthly`, `quarterly`, `yearly`

---

## LEGACY-модели (будут удалены)

### Payment (Фактический платёж)

Заменяется на **Invoice** + **JournalEntry**. Все новые расходы оформляются через Invoice.

### PaymentRegistry (Реестр платежей)

Заменяется workflow статусов **Invoice** (IN_REGISTRY → APPROVED → PAID).

### PaymentItem (Позиция платежа)

Заменяется на **InvoiceItem**.
