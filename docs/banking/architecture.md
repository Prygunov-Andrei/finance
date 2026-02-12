# Архитектура модуля banking

Модуль banking обеспечивает интеграцию с банковским API (Банк Точка) для синхронизации выписок, управления платёжными поручениями и автоматизации финансовых операций.

---

## 1. ER-диаграмма моделей

```mermaid
erDiagram
    LegalEntity ||--o{ BankConnection : "имеет"
    BankConnection ||--o{ BankAccount : "содержит"
    Account ||--|| BankAccount : "привязан"
    BankAccount ||--o{ BankTransaction : "содержит"
    BankAccount ||--o{ BankPaymentOrder : "привязан"
    BankTransaction }o--|| Payment : "сверено с"
    BankPaymentOrder ||--o{ BankPaymentOrderEvent : "история"
    BankPaymentOrder }o--o| PaymentRegistry : "заявка"
    User ||--o{ BankPaymentOrder : "создал"
    User ||--o{ BankPaymentOrder : "одобрил"

    LegalEntity {
        int id PK
        string name
        string short_name
        string inn
    }

    BankConnection {
        int id PK
        int legal_entity_id FK
        string provider
        string name
        string client_id_encrypted
        string client_secret_encrypted
        string access_token_encrypted
        string refresh_token_encrypted
        datetime token_expires_at
        string customer_code
        string payment_mode
        bool is_active
        datetime last_sync_at
    }

    BankAccount {
        int id PK
        int account_id FK
        int bank_connection_id FK
        string external_account_id
        date last_statement_date
        bool sync_enabled
    }

    BankTransaction {
        int id PK
        int bank_account_id FK
        string external_id UK
        string transaction_type
        decimal amount
        date date
        text purpose
        string counterparty_name
        string counterparty_inn
        int payment_id FK
        bool reconciled
        json raw_data
    }

    BankPaymentOrder {
        int id PK
        int bank_account_id FK
        int payment_registry_id FK
        string recipient_name
        string recipient_inn
        string recipient_account
        decimal amount
        text purpose
        date payment_date
        date original_payment_date
        string status
        string external_request_id
        string external_payment_id
        int created_by_id FK
        int approved_by_id FK
        datetime sent_at
        datetime executed_at
    }

    BankPaymentOrderEvent {
        int id PK
        int order_id FK
        string event_type
        int user_id FK
        json old_value
        json new_value
        text comment
    }

    Account {
        int id PK
        string name
        string number
    }

    Payment {
        int id PK
        decimal amount
        date payment_date
    }

    PaymentRegistry {
        int id PK
    }

    User {
        int id PK
        string username
    }
```

### Связи между моделями

| Модель | Связь | Описание |
|--------|-------|----------|
| **BankConnection** | legal_entity → LegalEntity | Подключение к банку принадлежит юрлицу |
| **BankAccount** | account → Account | Один внутренний счёт привязан к одному банковскому счёту |
| **BankAccount** | bank_connection → BankConnection | Счёт относится к подключению |
| **BankTransaction** | bank_account → BankAccount | Транзакция принадлежит банковскому счёту |
| **BankTransaction** | payment → Payment | Опциональная привязка к внутреннему платежу |
| **BankPaymentOrder** | bank_account → BankAccount | Счёт списания |
| **BankPaymentOrder** | payment_registry → PaymentRegistry | Опциональная заявка из реестра |
| **BankPaymentOrderEvent** | order → BankPaymentOrder | Аудит-лог каждого действия |

---

## 2. Жизненный цикл платёжного поручения (State Machine)

```mermaid
stateDiagram-v2
    [*] --> draft: Создание

    draft --> pending_approval: submit (отправить на согласование)

    pending_approval --> approved: approve (одобрить)
    pending_approval --> rejected: reject (отклонить)

    approved --> approved: reschedule (перенос даты)
    approved --> sent_to_bank: execute (отправить в банк)
    approved --> pending_sign: execute (for_sign режим)

    sent_to_bank --> executed: Вебхук / check_status
    sent_to_bank --> failed: Ошибка банка

    pending_sign --> executed: Подпись в банке / вебхук
    pending_sign --> failed: Отклонение в банке

    executed --> [*]
    rejected --> [*]
    failed --> [*]
```

### Описание статусов

| Статус | Описание | Допустимые переходы |
|--------|----------|---------------------|
| **draft** | Черновик | → pending_approval |
| **pending_approval** | На согласовании | → approved, rejected |
| **approved** | Одобрено | → sent_to_bank, pending_sign, approved (reschedule) |
| **sent_to_bank** | Отправлено в банк (auto_sign) | → executed, failed |
| **pending_sign** | Ожидает подписи в интернет-банке | → executed, failed |
| **executed** | Исполнено | Финальный |
| **rejected** | Отклонено | Финальный |
| **failed** | Ошибка | Финальный |

---

## 3. Схема взаимодействия с Tochka API

```mermaid
sequenceDiagram
    participant App as Django App
    participant Celery as Celery Worker
    participant Tochka as Tochka API
    participant DB as PostgreSQL

    %% Аутентификация
    App->>Tochka: POST /connect/token (client_credentials)
    Tochka-->>App: access_token, refresh_token
    App->>DB: Сохранить токены (зашифровано)

    %% Синхронизация выписок
    Celery->>DB: Получить активные BankAccount
    loop Для каждого счёта
        Celery->>Tochka: GET /accounts/{id}/statements?dateFrom&dateTo
        Tochka-->>Celery: Список транзакций
        Celery->>DB: Создать BankTransaction (новые)
    end

    %% Создание платёжного поручения
    App->>App: create_payment_order (сервис)
    App->>DB: BankPaymentOrder (draft)

    %% Отправка в банк
    App->>Tochka: POST /payment/v1.0/for-sign (или order)
    Note over App,Tochka: build_payment_data() формирует JSON
    Tochka-->>App: requestId, paymentId
    App->>DB: Обновить status, external_request_id

    %% Проверка статуса (Celery)
    Celery->>Tochka: GET /payment/v1.0/status/{requestId}
    Tochka-->>Celery: status (EXECUTED/REJECTED)
    Celery->>DB: Обновить BankPaymentOrder

    %% Вебхук (асинхронно)
    Tochka->>App: POST /banking/webhook/tochka/ (JWT)
    App->>App: verify_webhook_jwt (RS256)
    App->>DB: Создать BankTransaction или обновить status
    App->>Tochka: 200 OK
```

---

## 4. Celery-задачи

### Расписание

| Задача | Интервал | Cron-эквивалент |
|--------|----------|-----------------|
| `sync_all_statements` | 30 мин | `*/30 * * * *` |
| `execute_scheduled_payments` | 15 мин | `*/15 * * * *` |
| `refresh_bank_tokens` | 12 часов | `0 */12 * * *` |
| `check_pending_payments` | 5 мин | `*/5 * * * *` |

### Описание задач

#### 4.1. sync_all_statements (каждые 30 мин)

**Назначение:** Синхронизация банковских выписок по всем активным счетам.

**Логика:**
1. Выбирает `BankAccount` с `sync_enabled=True` и `bank_connection__is_active=True`
2. Для каждого счёта вызывает `sync_statements(bank_account)`:
   - Период: `last_statement_date` или последние 30 дней → сегодня
   - Запрос к Tochka API: `GET /accounts/{id}/statements`
   - Парсинг транзакций, создание новых `BankTransaction` (по `external_id`)
   - Обновление `last_statement_date`, `last_sync_at`

**Обработка ошибок:** При исключении для конкретного счёта — логируется, остальные счета обрабатываются. Возвращает общее количество новых транзакций.

---

#### 4.2. execute_scheduled_payments (каждые 15 мин)

**Назначение:** Автоматическая отправка одобренных платежей, у которых наступила дата оплаты.

**Логика:**
1. Выбирает `BankPaymentOrder` со статусом `approved`, `payment_date <= today`
2. Для каждого вызывает `execute_payment_order(order)`:
   - Проверка статуса (должен быть `approved`)
   - Формирование данных через `build_payment_data()`
   - Вызов `create_payment_for_sign()` или `create_payment()` в зависимости от `payment_mode`
   - Обновление статуса на `sent_to_bank` или `pending_sign` (или `executed` при auto_sign)
   - Сохранение `external_request_id`, `external_payment_id`

**Обработка ошибок:** При `TochkaAPIError` — статус меняется на `failed`, ошибка сохраняется в `error_message`. При критической ошибке — логирование, переход к следующему платёжу.

---

#### 4.3. refresh_bank_tokens (каждые 12 часов)

**Назначение:** Проактивное обновление access_token для всех активных подключений.

**Логика:**
1. Выбирает `BankConnection` с `is_active=True`
2. Для каждого: `TochkaAPIClient(connection).ensure_valid_token()`:
   - Если токена нет — полная аутентификация
   - Если `token_expires_at` ближе 5 минут — обновление через `refresh_token`
   - Сохранение новых токенов в БД

**Обработка ошибок:** При ошибке для конкретного подключения — логирование, остальные обрабатываются. Токен можно будет обновить при следующем запросе к API (401 → authenticate).

---

#### 4.4. check_pending_payments (каждые 5 мин)

**Назначение:** Проверка статуса платежей, отправленных в банк, но ещё не исполненных.

**Логика:**
1. Выбирает `BankPaymentOrder` со статусом `sent_to_bank` или `pending_sign`
2. Для каждого вызывает `check_payment_order_status(order)`:
   - Запрос к Tochka API: `GET /payment/v1.0/status/{requestId}`
   - При `EXECUTED`/`COMPLETED`/`SUCCESS` → статус `executed`
   - При `REJECTED`/`DECLINED`/`FAILED` → статус `failed`

**Обработка ошибок:** При ошибке API — логирование, статус не меняется. Следующая проверка через 5 минут.

---

### Конфигурация в celery.py

```python
app.conf.beat_schedule = {
    'banking-sync-statements': {
        'task': 'banking.sync_all_statements',
        'schedule': 1800.0,  # 30 мин
    },
    'banking-execute-scheduled-payments': {
        'task': 'banking.execute_scheduled_payments',
        'schedule': 900.0,  # 15 мин
    },
    'banking-refresh-tokens': {
        'task': 'banking.refresh_bank_tokens',
        'schedule': 43200.0,  # 12 часов
    },
    'banking-check-pending-payments': {
        'task': 'banking.check_pending_payments',
        'schedule': 300.0,  # 5 мин
    },
}
```
