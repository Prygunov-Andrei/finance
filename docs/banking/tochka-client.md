# Tochka API Client

Клиент для работы с Tochka Bank Open API v2.

- **Расположение:** `backend/banking/clients/tochka.py`
- **Документация API:** https://developers.tochka.com/docs/tochka-api/

---

## 1. Класс TochkaAPIClient

Синхронный HTTP-клиент на базе `httpx`. Автоматически управляет access_token: проверяет срок действия и обновляет при необходимости.

### Инициализация

```python
from banking.clients.tochka import TochkaAPIClient
from banking.models import BankConnection

connection = BankConnection.objects.get(pk=1)

# Production (по умолчанию)
with TochkaAPIClient(connection) as client:
    accounts = client.get_accounts_list()

# Sandbox
with TochkaAPIClient(connection, sandbox=True) as client:
    client.authenticate()
```

**Параметры конструктора:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| bank_connection | BankConnection | Объект с client_id, client_secret (и опционально access_token) |
| sandbox | bool | Использовать sandbox-контур API |

**Контекстный менеджер:** Рекомендуется использовать `with` для корректного закрытия HTTP-клиента.

---

## 2. Sandbox vs Production

| Режим | Base URL | Token URL |
|-------|----------|-----------|
| **Production** | `https://enter.tochka.com/api/v2` | `https://enter.tochka.com/connect/token` |
| **Sandbox** | `https://enter.tochka.com/sandbox/v2` | `https://enter.tochka.com/sandbox/connect/token` |

- **Sandbox** — тестовый контур, данные не реальные
- **Production** — боевой API, реальные операции

Переключение через параметр `sandbox=True/False` в конструкторе.

---

## 3. Обработка ошибок API

### TochkaAPIError

Исключение при ошибках API:

```python
class TochkaAPIError(Exception):
    def __init__(self, message: str, status_code: int = 0, response_data: Any = None):
        self.status_code = status_code   # HTTP-код (0 при сетевой ошибке)
        self.response_data = response_data  # Тело ответа или текст ошибки
```

### Стратегии обработки

| Ситуация | Поведение |
|----------|-----------|
| **401 Unauthorized** | Токен протух → `authenticate()` → повтор запроса (в рамках retry) |
| **4xx/5xx** | `TochkaAPIError` с `status_code` и `response_data` |
| **Сетевые ошибки** (httpx.RequestError) | Retry до MAX_RETRIES=3 раз, затем `TochkaAPIError` |
| **Таймаут** | 30 секунд (TIMEOUT), потом RequestError → retry |

### Rate limiting

Явной обработки rate limiting (429) в клиенте нет. При получении 429 рекомендуется:

- Проверить `response_data` на наличие заголовков Retry-After
- Увеличить интервалы между массовыми запросами
- Рассмотреть добавление exponential backoff при 429

### Ретраи (MAX_RETRIES=3)

Повторяются только **сетевые ошибки** (httpx.RequestError). Ошибки API (4xx/5xx) не ретраятся, кроме 401 (токен обновляется, запрос повторяется в том же цикле).

---

## 4. Методы класса

### Аутентификация

| Метод | Описание |
|-------|----------|
| `authenticate(scope='accounts balances payments')` | Client credentials grant. Сохраняет access_token, refresh_token в BankConnection. Возвращает access_token. |
| `refresh_access_token()` | Обновление через refresh_token. При отсутствии или ошибке — полная аутентификация. |
| `ensure_valid_token()` | Проверка срока действия. Обновление за 5 минут до истечения. |

### Счета и балансы

| Метод | HTTP | Описание |
|-------|------|----------|
| `get_customers_list()` | GET /open-banking/v1.0/customers | Список клиентов (customerCode) |
| `get_accounts_list()` | GET /open-banking/v1.0/accounts | Список счетов |
| `get_account_balance(account_id)` | GET /open-banking/v1.0/accounts/{id}/balances | Баланс счёта |

### Выписки

| Метод | HTTP | Описание |
|-------|------|----------|
| `get_statement(account_id, date_from, date_to)` | GET /open-banking/v1.0/accounts/{id}/statements | Выписка за период |

**Параметры:** `date_from`, `date_to` — объекты `date`, передаются как `dateFrom`, `dateTo` (ISO format).

### Платежи

| Метод | HTTP | Описание |
|-------|------|----------|
| `create_payment_for_sign(payment_data)` | POST /payment/v1.0/for-sign | Платёж на подпись в интернет-банке |
| `create_payment(payment_data)` | POST /payment/v1.0/order | Создание и подписание (auto-sign, DEPRECATED) |
| `get_payment_for_sign_list()` | GET /payment/v1.0/for-sign | Список платежей на подпись |
| `get_payment_status(request_id)` | GET /payment/v1.0/status/{requestId} | Статус платежа |

### Вебхуки

| Метод | HTTP | Описание |
|-------|------|----------|
| `get_webhooks()` | GET /webhook/v1.0/{client_id} | Список вебхуков |
| `create_webhook(url, webhook_type)` | PUT /webhook/v1.0/{client_id} | Создать вебхук |
| `edit_webhook(url, webhook_type)` | POST /webhook/v1.0/{client_id} | Изменить вебхук |
| `delete_webhook(webhook_type)` | DELETE /webhook/v1.0/{client_id} | Удалить вебхук |
| `send_test_webhook(webhook_type)` | POST .../test-send | Тестовый вебхук |

### Счета и документы

| Метод | HTTP | Описание |
|-------|------|----------|
| `create_invoice(customer_code, invoice_data)` | POST /invoice/v1.0/bills | Создать счёт на оплату |
| `get_invoice_status(customer_code, document_id)` | GET /invoice/v1.0/bills/.../payment-status | Статус оплаты счёта |

---

## 5. build_payment_data — формат данных для платёжного поручения

Метод формирует словарь в формате, ожидаемом Tochka API.

### Сигнатура

```python
def build_payment_data(
    self,
    customer_code: str,
    account_code: str,
    recipient_name: str,
    recipient_inn: str,
    recipient_kpp: str,
    recipient_account: str,
    recipient_bank_name: str,
    recipient_bik: str,
    recipient_corr_account: str,
    amount: str,
    purpose: str,
    payment_date: Optional[date] = None,
) -> dict
```

### Возвращаемая структура

```json
{
  "Data": {
    "customerCode": "12345",
    "accountCode": "40702810000000000001",
    "recipientName": "ООО Поставщик",
    "recipientINN": "7707123456",
    "recipientKPP": "770701001",
    "recipientAccount": "40702810000000000002",
    "recipientBankName": "ПАО Сбербанк",
    "recipientBIK": "044525225",
    "recipientCorrAccount": "30101810400000000225",
    "amount": "50000.00",
    "purpose": "Оплата по договору №1",
    "paymentDate": "2026-02-15"
  }
}
```

### Пример использования

```python
payment_data = client.build_payment_data(
    customer_code=connection.customer_code,
    account_code=bank_account.external_account_id,
    recipient_name=order.recipient_name,
    recipient_inn=order.recipient_inn,
    recipient_kpp=order.recipient_kpp,
    recipient_account=order.recipient_account,
    recipient_bank_name=order.recipient_bank_name,
    recipient_bik=order.recipient_bik,
    recipient_corr_account=order.recipient_corr_account,
    amount=str(order.amount),
    purpose=order.purpose,
    payment_date=order.payment_date,
)
result = client.create_payment_for_sign(payment_data)
```

---

## 6. Маппинг полей: внутренние модели ↔ Tochka API

### BankPaymentOrder → build_payment_data / Tochka

| BankPaymentOrder | Tochka API (Data) |
|------------------|-------------------|
| bank_account.external_account_id | accountCode |
| bank_connection.customer_code | customerCode |
| recipient_name | recipientName |
| recipient_inn | recipientINN |
| recipient_kpp | recipientKPP |
| recipient_account | recipientAccount |
| recipient_bank_name | recipientBankName |
| recipient_bik | recipientBIK |
| recipient_corr_account | recipientCorrAccount |
| amount | amount (строка) |
| purpose | purpose |
| payment_date | paymentDate (ISO) |

**Примечание:** Поле `vat_info` в BankPaymentOrder не передаётся в API; при необходимости его можно добавить в `purpose` или в отдельное поле, если API это поддерживает.

### Выписка (Tochka) → BankTransaction

| Tochka API (Transaction) | BankTransaction |
|--------------------------|------------------|
| paymentId | external_id |
| direction (incoming/outgoing) | transaction_type |
| amount | amount |
| date | date |
| purpose | purpose |
| SidePayer / SideRecipient | counterparty_* |
| documentNumber | document_number |

### Реквизиты контрагента (SidePayer / SideRecipient)

| Tochka API | BankTransaction |
|------------|------------------|
| name | counterparty_name |
| inn | counterparty_inn |
| kpp | counterparty_kpp |
| account | counterparty_account |
| bankName | counterparty_bank_name |
| bankCode | counterparty_bik |
| bankCorrespondentAccount | counterparty_corr_account |

### Ответ create_payment* → BankPaymentOrder

| Tochka API (Data) | BankPaymentOrder |
|-------------------|------------------|
| requestId | external_request_id |
| paymentId | external_payment_id |

### Статусы платежа (Tochka → BankPaymentOrder)

| Tochka status | BankPaymentOrder.status |
|---------------|-------------------------|
| EXECUTED, COMPLETED, SUCCESS | executed |
| REJECTED, DECLINED, FAILED | failed |

---

## 7. Константы

| Константа | Значение | Описание |
|-----------|----------|----------|
| TIMEOUT | 30 | Таймаут HTTP-запроса (секунды) |
| MAX_RETRIES | 3 | Количество повторных попыток при сетевой ошибке |
| BASE_URL | https://enter.tochka.com/api/v2 | Production API |
| SANDBOX_URL | https://enter.tochka.com/sandbox/v2 | Sandbox API |
