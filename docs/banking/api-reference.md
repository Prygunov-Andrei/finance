# REST API Reference — модуль Banking

Базовый URL: `https://your-domain.com/api/v1/` (или `http://localhost:8000/api/v1/` для разработки).

Все эндпоинты (кроме webhook) требуют JWT-аутентификации:

```
Authorization: Bearer <access_token>
```

---

## Общие сведения

### Формат ответов

**Успешный ответ (200):**
```json
{
  "id": 1,
  "field": "value",
  ...
}
```

**Ошибка валидации (400):**
```json
{
  "field_name": ["Ошибка валидации поля"]
}
```

**Ошибка сервера (500):**
```json
{
  "detail": "Сообщение об ошибке"
}
```

### Коды ошибок

| HTTP | Описание |
|------|----------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request — ошибка валидации, бизнес-логики |
| 401 | Unauthorized — невалидный или отсутствующий JWT |
| 403 | Forbidden — нет прав доступа |
| 404 | Not Found — ресурс не найден |
| 500 | Internal Server Error |

---

## Bank Connections (Подключения к банку)

### GET /bank-connections/

Список всех банковских подключений.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Точка — основной счёт ООО Август",
    "legal_entity": 1,
    "legal_entity_name": "ООО Август",
    "provider": "tochka",
    "provider_display": "Банк Точка",
    "payment_mode": "for_sign",
    "payment_mode_display": "Черновик (подпись через банк)",
    "customer_code": "12345",
    "is_active": true,
    "last_sync_at": "2026-02-12T10:30:00Z",
    "created_at": "2026-01-15T08:00:00Z"
  }
]
```

**Curl:**
```bash
curl -X GET "https://your-domain.com/api/v1/bank-connections/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### POST /bank-connections/

Создание нового подключения.

**Request:**
```json
{
  "name": "Точка — основной счёт ООО Август",
  "legal_entity": 1,
  "provider": "tochka",
  "client_id": "your_client_id",
  "client_secret": "your_client_secret",
  "customer_code": "12345",
  "payment_mode": "for_sign",
  "is_active": true
}
```

**Response (201):**
```json
{
  "id": 1,
  "name": "Точка — основной счёт ООО Август",
  "legal_entity": 1,
  "provider": "tochka",
  "customer_code": "12345",
  "payment_mode": "for_sign",
  "is_active": true
}
```

**Curl:**
```bash
curl -X POST "https://your-domain.com/api/v1/bank-connections/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Точка — основной счёт ООО Август",
    "legal_entity": 1,
    "provider": "tochka",
    "client_id": "your_client_id",
    "client_secret": "your_client_secret",
    "customer_code": "12345",
    "payment_mode": "for_sign",
    "is_active": true
  }'
```

---

### POST /bank-connections/{id}/test/

Проверка подключения к банку (тест аутентификации).

**Response (200):**
```json
{
  "status": "ok",
  "message": "Подключение успешно"
}
```

**Response (400):**
```json
{
  "status": "error",
  "message": "Ошибка аутентификации: 401 ..."
}
```

**Curl:**
```bash
curl -X POST "https://your-domain.com/api/v1/bank-connections/1/test/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### POST /bank-connections/{id}/sync-accounts/

Получение списка счетов из банка (без сохранения в БД).

**Response (200):**
```json
{
  "status": "ok",
  "accounts": [
    {
      "accountCode": "40702810000000000001",
      "accountName": "Расчётный счёт",
      "balance": {...}
    }
  ]
}
```

**Curl:**
```bash
curl -X POST "https://your-domain.com/api/v1/bank-connections/1/sync-accounts/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### PATCH /bank-connections/{id}/

Частичное обновление подключения.

**Request:**
```json
{
  "name": "Новое название",
  "is_active": false
}
```

---

### DELETE /bank-connections/{id}/

Удаление подключения.

**Curl:**
```bash
curl -X DELETE "https://your-domain.com/api/v1/bank-connections/1/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Bank Accounts (Банковские счета)

### GET /bank-accounts/

Список привязанных банковских счетов.

**Response:**
```json
[
  {
    "id": 1,
    "account": 5,
    "account_name": "Расчётный счёт ООО Август",
    "account_number": "40702810...",
    "bank_connection": 1,
    "connection_name": "Точка — основной счёт",
    "external_account_id": "40702810000000000001",
    "last_statement_date": "2026-02-11",
    "sync_enabled": true,
    "created_at": "2026-01-15T08:00:00Z"
  }
]
```

**Curl:**
```bash
curl -X GET "https://your-domain.com/api/v1/bank-accounts/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### POST /bank-accounts/

Создание привязки счёта к банковскому подключению.

**Request:**
```json
{
  "account": 5,
  "bank_connection": 1,
  "external_account_id": "40702810000000000001",
  "sync_enabled": true
}
```

---

### POST /bank-accounts/{id}/sync-statements/

Ручная синхронизация выписки по счёту.

**Request (опционально):**
```json
{
  "date_from": "2026-01-01",
  "date_to": "2026-02-12"
}
```

**Response (200):**
```json
{
  "status": "ok",
  "new_transactions": 15
}
```

**Response (400):**
```json
{
  "status": "error",
  "message": "Ошибка получения выписки: ..."
}
```

**Curl:**
```bash
curl -X POST "https://your-domain.com/api/v1/bank-accounts/1/sync-statements/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date_from": "2026-01-01", "date_to": "2026-02-12"}'
```

---

### PATCH /bank-accounts/{id}/

Частичное обновление (например, `sync_enabled`).

---

### DELETE /bank-accounts/{id}/

Удаление привязки счёта.

---

## Bank Transactions (Банковские транзакции)

### GET /bank-transactions/

Список транзакций из выписок.

**Query-параметры:**

| Параметр | Описание |
|----------|----------|
| bank_account | ID банковского счёта |
| transaction_type | incoming / outgoing |
| reconciled | true / false |
| date | Дата (точное совпадение) |
| search | Поиск по counterparty_name, counterparty_inn, purpose |
| ordering | date, amount, created_at (префикс - для DESC) |

**Response:**
```json
[
  {
    "id": 1,
    "bank_account": 1,
    "bank_account_name": "Расчётный счёт",
    "external_id": "pay_abc123",
    "transaction_type": "incoming",
    "transaction_type_display": "Входящий",
    "amount": "15000.00",
    "date": "2026-02-10",
    "purpose": "Оплата по договору №1",
    "counterparty_name": "ООО Поставщик",
    "counterparty_inn": "7707123456",
    "counterparty_kpp": "770701001",
    "counterparty_account": "40702810000000000002",
    "counterparty_bank_name": "ПАО Сбербанк",
    "counterparty_bik": "044525225",
    "counterparty_corr_account": "30101810400000000225",
    "document_number": "42",
    "payment": null,
    "reconciled": false,
    "created_at": "2026-02-12T10:30:00Z"
  }
]
```

**Curl:**
```bash
curl -X GET "https://your-domain.com/api/v1/bank-transactions/?bank_account=1&reconciled=false" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### POST /bank-transactions/{id}/reconcile/

Привязка транзакции к внутреннему платежу.

**Request:**
```json
{
  "payment_id": 42
}
```

**Response (200):**
```json
{
  "status": "ok"
}
```

**Response (400):**
```json
{
  "status": "error",
  "message": "Не удалось привязать"
}
```

**Curl:**
```bash
curl -X POST "https://your-domain.com/api/v1/bank-transactions/1/reconcile/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"payment_id": 42}'
```

---

## Bank Payment Orders (Платёжные поручения)

### GET /bank-payment-orders/

Список платёжных поручений.

**Query-параметры:**

| Параметр | Описание |
|----------|----------|
| status | draft, pending_approval, approved, sent_to_bank, pending_sign, executed, rejected, failed |
| bank_account | ID банковского счёта |
| payment_date | Дата (точное совпадение) |
| search | Поиск по recipient_name, recipient_inn, purpose |
| ordering | payment_date, amount, created_at |

**Response:**
```json
[
  {
    "id": 1,
    "bank_account": 1,
    "bank_account_name": "Расчётный счёт",
    "payment_registry": null,
    "recipient_name": "ООО Поставщик",
    "recipient_inn": "7707123456",
    "amount": "50000.00",
    "purpose": "Оплата по договору №1",
    "vat_info": "Без НДС",
    "payment_date": "2026-02-15",
    "original_payment_date": "2026-02-10",
    "status": "approved",
    "status_display": "Одобрено",
    "created_by": 1,
    "created_by_username": "admin",
    "approved_by": 2,
    "approved_by_username": "controllers",
    "approved_at": "2026-02-12T09:00:00Z",
    "sent_at": null,
    "executed_at": null,
    "error_message": "",
    "reschedule_count": 0,
    "can_reschedule": true,
    "created_at": "2026-02-11T14:00:00Z"
  }
]
```

**Curl:**
```bash
curl -X GET "https://your-domain.com/api/v1/bank-payment-orders/?status=approved" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### POST /bank-payment-orders/

Создание платёжного поручения.

**Request:**
```json
{
  "bank_account": 1,
  "payment_registry": null,
  "recipient_name": "ООО Поставщик",
  "recipient_inn": "7707123456",
  "recipient_kpp": "770701001",
  "recipient_account": "40702810000000000002",
  "recipient_bank_name": "ПАО Сбербанк",
  "recipient_bik": "044525225",
  "recipient_corr_account": "30101810400000000225",
  "amount": "50000.00",
  "purpose": "Оплата по договору №1",
  "vat_info": "Без НДС",
  "payment_date": "2026-02-15"
}
```

**Response (201):** Объект платёжного поручения (статус `draft`).

**Curl:**
```bash
curl -X POST "https://your-domain.com/api/v1/bank-payment-orders/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bank_account": 1,
    "recipient_name": "ООО Поставщик",
    "recipient_inn": "7707123456",
    "recipient_kpp": "770701001",
    "recipient_account": "40702810000000000002",
    "recipient_bank_name": "ПАО Сбербанк",
    "recipient_bik": "044525225",
    "recipient_corr_account": "30101810400000000225",
    "amount": "50000.00",
    "purpose": "Оплата по договору №1",
    "vat_info": "Без НДС",
    "payment_date": "2026-02-15"
  }'
```

---

### POST /bank-payment-orders/{id}/submit/

Отправить на согласование (draft → pending_approval).

**Response (200):** Обновлённый объект платёжного поручения.

**Response (400):**
```json
{
  "error": "Нельзя отправить на согласование из статуса Одобрено"
}
```

**Curl:**
```bash
curl -X POST "https://your-domain.com/api/v1/bank-payment-orders/1/submit/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### POST /bank-payment-orders/{id}/approve/

Одобрить платёжное поручение (pending_approval → approved).

**Request:**
```json
{
  "payment_date": "2026-02-20",
  "comment": "Одобрено с переносом даты"
}
```

Поля `payment_date` и `comment` опциональны.

**Response (200):** Обновлённый объект платёжного поручения.

**Curl:**
```bash
curl -X POST "https://your-domain.com/api/v1/bank-payment-orders/1/approve/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"payment_date": "2026-02-20", "comment": "Одобрено"}'
```

---

### POST /bank-payment-orders/{id}/reject/

Отклонить платёжное поручение (pending_approval → rejected).

**Request:**
```json
{
  "comment": "Превышен лимит"
}
```

**Response (200):** Обновлённый объект платёжного поручения.

**Curl:**
```bash
curl -X POST "https://your-domain.com/api/v1/bank-payment-orders/1/reject/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment": "Превышен лимит"}'
```

---

### POST /bank-payment-orders/{id}/reschedule/

Перенести дату оплаты (только в статусе approved).

**Request:**
```json
{
  "payment_date": "2026-02-25",
  "comment": "Перенос по просьбе контрагента"
}
```

**Response (200):** Обновлённый объект платёжного поручения.

**Response (400):**
```json
{
  "error": "Комментарий (причина переноса) обязателен"
}
```

**Curl:**
```bash
curl -X POST "https://your-domain.com/api/v1/bank-payment-orders/1/reschedule/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"payment_date": "2026-02-25", "comment": "Перенос по просьбе контрагента"}'
```

---

### POST /bank-payment-orders/{id}/execute/

Отправить платёжное поручение в банк (approved → sent_to_bank / pending_sign).

**Response (200):** Обновлённый объект платёжного поручения.

**Response (400):**
```json
{
  "error": "Tochka API ошибка: 400 ..."
}
```

**Curl:**
```bash
curl -X POST "https://your-domain.com/api/v1/bank-payment-orders/1/execute/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### GET /bank-payment-orders/{id}/status/

Проверить статус платёжного поручения в банке (для sent_to_bank / pending_sign).

**Response (200):** Обновлённый объект платёжного поручения.

**Curl:**
```bash
curl -X GET "https://your-domain.com/api/v1/bank-payment-orders/1/status/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### GET /bank-payment-orders/{id}/events/

Аудит-лог (история всех действий с платёжным поручением).

**Response:**
```json
[
  {
    "id": 1,
    "order": 1,
    "event_type": "created",
    "event_type_display": "Создано",
    "user": 1,
    "username": "admin",
    "old_value": null,
    "new_value": {
      "amount": "50000.00",
      "payment_date": "2026-02-15",
      "recipient_name": "ООО Поставщик"
    },
    "comment": "",
    "created_at": "2026-02-11T14:00:00Z"
  },
  {
    "id": 2,
    "order": 1,
    "event_type": "submitted",
    "event_type_display": "Отправлено на согласование",
    "user": 1,
    "username": "admin",
    "old_value": {"status": "draft"},
    "new_value": {"status": "pending_approval"},
    "comment": "",
    "created_at": "2026-02-11T15:00:00Z"
  }
]
```

**Curl:**
```bash
curl -X GET "https://your-domain.com/api/v1/bank-payment-orders/1/events/" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### PATCH /bank-payment-orders/{id}/

Частичное обновление (для draft — можно редактировать реквизиты). При использовании `BankPaymentOrderListSerializer` часть полей read-only.

---

### DELETE /bank-payment-orders/{id}/

Удаление платёжного поручения (осторожно: возможно только для draft).

---

## Webhook (Точка Банк)

### POST /banking/webhook/tochka/

Публичный эндпоинт для приёма вебхуков от Точка Банка. **Не требует JWT.**

**Request:** Тело запроса — сырая JWT-строка (не JSON).

**Response:** Всегда `200 OK` (чтобы банк не ретраил при ошибках).

**Верификация:** JWT подписан RS256, проверка через публичный ключ Точки.

**Curl (тестовый пинг):**
```bash
curl -X POST "https://your-domain.com/api/v1/banking/webhook/tochka/" \
  -H "Content-Type: text/plain" \
  -d ""
```

**Примечание:** Реальные вебхуки отправляет банк. URL должен быть доступен по HTTPS на порту 443.
