# 03. События webhook ERP → ISMeta

**Версия:** 0.1. **Назначение:** полные payload'ы каждого события, правила идемпотентности и ретрая.

## 1. Общие свойства

Все события приходят на единый endpoint `POST /api/v1/webhooks/erp` в ISMeta.

Заголовки (обязательны все):
- `X-Webhook-Event-Id: {uuid}` — уникальный id события, сохраняется в `ProcessedEvents`.
- `X-Webhook-Event-Type: {event_type}` — тип (см. ниже).
- `X-Webhook-Signature: sha256={hmac}` — HMAC-SHA256 тела с shared secret из Workspace-настроек.
- `X-Webhook-Timestamp: {unix_seconds}` — для защиты от replay (отклоняем старше 5 минут).
- `X-Webhook-Delivery-Attempt: {n}` — номер попытки доставки.

Общее тело:

```json
{
  "event_id": "uuid",
  "event_type": "product.updated",
  "workspace_id": "uuid | null",
  "occurred_at": "2026-04-15T10:23:45Z",
  "schema_version": "v1",
  "data": { ... }
}
```

Ответы:
- `200 OK` — успех; тело ответа `{"processed":true, "event_id":"..."}`.
- `200 OK` — уже обработано (идемпотентность): `{"processed":true, "already_processed":true}`.
- `400 Bad Request` — невалидная структура/подпись; ERP не ретрайит.
- `5xx` — внутренняя ошибка; ERP ретрайит с exp backoff.

### 1.1 Пример HMAC-подписи

Алгоритм: **HMAC-SHA256, где ключ — shared secret, сообщение — raw body запроса**. Timestamp header'а включается в вычисление для защиты от replay.

**Что подписывается:** `{timestamp}.{body}` (timestamp + точка + тело).

Python-пример (serverside — ERP):

```python
import hashlib
import hmac
import time

secret = b"dev-webhook-secret-change-me"
timestamp = str(int(time.time()))
body = b'{"event_id":"...","event_type":"product.updated",...}'

message = timestamp.encode() + b"." + body
signature = "sha256=" + hmac.new(secret, message, hashlib.sha256).hexdigest()

headers = {
    "X-Webhook-Event-Id": "...",
    "X-Webhook-Event-Type": "product.updated",
    "X-Webhook-Timestamp": timestamp,
    "X-Webhook-Signature": signature,
}
```

Верификация (ISMeta):

```python
def verify_signature(request, secret: bytes) -> bool:
    timestamp = request.headers["X-Webhook-Timestamp"]
    if abs(int(time.time()) - int(timestamp)) > 300:  # старше 5 минут
        return False

    signature_header = request.headers["X-Webhook-Signature"]
    if not signature_header.startswith("sha256="):
        return False

    expected = signature_header[len("sha256="):]
    message = timestamp.encode() + b"." + request.body
    computed = hmac.new(secret, message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, computed)
```

## 2. Каталог событий

### 2.1 product.updated

Выпускается ERP при любом изменении Product (name, unit, default_price, category, status).

```json
{
  "event_id": "8b1c...",
  "event_type": "product.updated",
  "workspace_id": null,
  "occurred_at": "2026-04-15T10:23:45Z",
  "schema_version": "v1",
  "data": {
    "product_id": "prod-1234",
    "changed_fields": ["default_price", "name"],
    "product": {
      "id": "prod-1234",
      "name": "Вентилятор крышный MOB2600/45-3a",
      "normalized_name": "вентилятор крышный mob2600 45 3a",
      "unit": "шт",
      "category_id": "cat-vent-500",
      "default_price": 85000.00,
      "status": "verified"
    }
  }
}
```

**Эффект в ISMeta:**
1. UPSERT в `ProductCache` по `product_id`.
2. Если в changed_fields есть `default_price`, `unit` или `status` — ищем `EstimateItem` с этим `product_id` в статусах `draft/in_progress/review` и помечаем их баннером «данные товара обновились».

### 2.2 product.archived

```json
{
  "data": {
    "product_id": "prod-1234",
    "replacement_product_id": "prod-5678"  // nullable
  }
}
```

**Эффект:** помечаем `ProductCache.status = 'archived'`; все сметы, где этот product используется и не transmitted, получают warning «товар архивирован; рекомендуется заменить на {replacement}».

### 2.3 pricelist.activated

```json
{
  "data": {
    "price_list_id": "pl-2026",
    "previous_price_list_id": "pl-2025",
    "version": 2,
    "activated_at": "2026-04-15T00:00:00Z"
  }
}
```

**Эффект:** для `Estimate` с `price_list_id = previous` ставим пометку «прайс устарел, рекомендуется перепересчёт работ».

### 2.4 worker_grade.rate_changed

**Критично:** меняется базовая ставка грейда, все сметы с work_item этого грейда пересчитываются.

```json
{
  "data": {
    "price_list_id": "pl-2026",
    "grade": 3,
    "old_rate": 800.00,
    "new_rate": 900.00,
    "effective_from": "2026-05-01T00:00:00Z"
  }
}
```

**Эффект:**
1. Сохраняем событие в `AuditLog`.
2. Для всех `Estimate` в статусах `draft/in_progress/review/ready`, использующих соответствующий `price_list_id`, через live-запрос к ERP выбираем `EstimateItem` с work_item соответствующего грейда, пересчитываем для них предварительные суммы работ и выставляем `Estimate.needs_recalculation = true`.
3. В UI сметчик видит баннер на смете «ставка грейда N изменилась с X до Y ₽/ч, применить с effective_from=DATE».
4. Автоматически ничего не пересчитывается. Сметчик явно подтверждает (деньги — чувствительное).

**Логика `effective_from`:**
- если `effective_from` в будущем — ISMeta запоминает (отдельная таблица `ScheduledRateChange`), баннер показывается только когда дата наступает;
- если `effective_from` уже прошёл или совпадает с `occurred_at` — баннер сразу.

### 2.5 contract.signed

```json
{
  "data": {
    "ismeta_version_id": "4f3a...",
    "erp_contract_id": "c-123",
    "erp_contract_estimate_id": "ce-789",
    "contract_number": "Д-2026-005",
    "signed_at": "2026-05-01T00:00:00Z"
  }
}
```

**Эффект:**
1. Находим `Estimate` по `ismeta_version_id`, ставим `status = 'transmitted'`, `transmitted_contract_id = erp_contract_id`, `transmitted_at = signed_at`.
2. В UI версия становится read-only с пометкой «договор Д-2026-005 от 2026-05-01».
3. Пишем `AuditLog`.

### 2.6 contract.terminated

```json
{
  "data": {
    "erp_contract_id": "c-123",
    "terminated_at": "2026-08-15T00:00:00Z",
    "reason": "customer_request"
  }
}
```

**Эффект:** у всех `Estimate` с `transmitted_contract_id = c-123` пометка «договор расторгнут; смета снова доступна для правок». Read-only снимается с последней переданной версии.

### 2.7 object.created / object.updated / object.deleted

```json
{
  "data": {
    "object_id": "obj-42",
    "name": "Офис на Мясницкой, стр. 5",
    "address": "...",
    "status": "active"
  }
}
```

**Эффект:**
- `created` — создаём `Folder` с `external_ref.object_id` если ещё нет.
- `updated` — обновляем имя в Folder.
- `deleted` — помечаем Folder `deleted_at`, предупреждаем если внутри есть сметы.

### 2.8 counterparty.updated

Нужен только если появится кеш контрагентов (в MVP нет). Резервируем тип события.

### 2.9 ismeta.transmission.received

Технический webhook-response от ERP на snapshot transmission (см. 02-api-contracts.md §2). Идёт по тому же каналу для упрощения.

## 3. Правила обработки на стороне ISMeta

### 3.1 Идемпотентность

```python
def handle_webhook(request):
    verify_signature(request)
    verify_timestamp(request, max_age=300)
    event_id = request.headers["X-Webhook-Event-Id"]

    with transaction.atomic():
        created = ProcessedEvents.objects.get_or_create(
            event_id=event_id,
            defaults={"event_type": ..., "workspace_id": ...}
        )
        if not created:
            return Response({"processed": True, "already_processed": True}, 200)

        dispatch_event(request.data)

    return Response({"processed": True, "event_id": event_id}, 200)
```

### 3.2 Порядок событий

Webhook'и могут прийти не в том порядке. Защиты:
- в payload — `occurred_at` (ERP-время) и `data.version` (если применимо);
- ISMeta при UPSERT сравнивает существующий `last_synced_at` и новый `occurred_at`, применяет только более свежий;
- для событий без версии (напр. archived) — применяем идемпотентно: повторный архив не вреден.

### 3.3 Polling fallback

Если за 60 секунд не пришло ни одного webhook (маркер `LastWebhookReceivedAt`), фоновая задача в ISMeta вызывает:

```
GET /api/erp-catalog/v1/events?since_event_id={last_processed_event_id}&limit=100
```

И обрабатывает каждое событие тем же пайплайном. Работает и как backfill после даунтайма.

### 3.4 Обработка ошибок

- При 5xx ERP ретрайит с exp backoff: 1s, 2s, 4s, ..., до 1 часа; после 24 часов событие `dead-letter`'ится в ERP.
- ISMeta никогда не возвращает 5xx на валидный webhook — либо 200 (обработано), либо ставит задачу в Celery и отвечает 200 сразу. Long-running обработка не блокирует webhook-channel.

## 4. Outbox pattern на стороне ERP

Чтобы события не терялись при рестарте ERP:

1. Бизнес-логика ERP пишет запись в таблицу `erp.outbox` в той же транзакции, что и изменение доменной сущности.
2. Фоновый воркер (Celery beat или dedicated service) вычитывает записи в статусе `pending`, пушит в ISMeta, помечает `sent_at`.
3. При ошибке увеличивает `attempts`, после 3 неуспешных — перекладывает в `dead_letter`, алерт в дежурный канал.
4. `erp.outbox` очищается от `sent_at` старше 7 дней.

Структура `erp.outbox`:

| Поле | Тип |
|---|---|
| id | BIGSERIAL PK |
| event_id | UUID UNIQUE |
| event_type | VARCHAR(64) |
| workspace_id | UUID null |
| payload | JSONB |
| created_at | TIMESTAMPTZ |
| sent_at | TIMESTAMPTZ null |
| attempts | INT |
| last_error | TEXT null |
| dead_letter_at | TIMESTAMPTZ null |

## 5. Версионирование событий

- Поле `schema_version` в каждом событии.
- Breaking change в структуре `data` → bump до `v2`.
- ISMeta обязан поддерживать минимум одну старую major-версию (v1 и v2 одновременно).
- Введение нового `event_type` — не breaking, ISMeta игнорирует неизвестные типы.

## 6. Безопасность

См. `12-security.md`. Ключевые моменты:
- HMAC shared secret хранится в Workspace-settings, ротируется раз в 90 дней.
- IP allow-list на приёмнике — IP-адреса ERP-продакшена.
- Replay protection — `X-Webhook-Timestamp` с окном 5 минут.

## 7. Тестирование

- Контракт-тесты с pact-файлами: ERP — producer, ISMeta — consumer.
- Локальный mock-сервер для ISMeta: `tools/mock-erp/` эмулирует все события по запросу из dev-UI.
- Регрессионные сценарии для order-independence, duplicate delivery, signature invalidation.
