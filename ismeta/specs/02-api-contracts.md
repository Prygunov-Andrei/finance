# 02. API-контракты

**Версия:** 0.1. **Назначение:** полные OpenAPI-спецификации пяти границ ISMeta.

Формально OpenAPI 3.1 YAML-файлы лежат в `ismeta/backend/docs/openapi/`; этот документ описывает ключевые эндпоинты структурно, чтобы можно было писать контракт-тесты и начинать интеграцию до того, как YAML сгенерирован из DRF.

## Пять границ

1. **ISMeta Public API** — между фронтендом/виджетом ISMeta и её бэкендом.
2. **ISMeta → ERP Snapshot API** — отдача готовой сметы в ERP.
3. **ERP → ISMeta Webhook API** — события от ERP (см. `03-webhook-events.md`).
4. **ISMeta → ERP Catalog API** — live-чтение каталога и прайсов.
5. **ISMeta → Recognition API** — загрузка файла и получение распознанной спецификации.

Плюс sidecar:
- **ERP → ISMeta JWT issuance** — service-to-service auth для виджета (см. `12-security.md`).

Общие соглашения:
- версия через URL-префикс: `/api/v1/...`;
- все мутации принимают `Idempotency-Key` header;
- все endpoints отвечают JSON, кроме `/export/xlsx`, `/export/pdf` и `/upload`;
- коды ошибок — по RFC 7807 (Problem Details): `{ "type":"...", "title":"...", "detail":"...", "errors":[...] }`;
- пагинация — cursor-based: `?cursor=...&limit=100`.

### Формат ошибок (RFC 7807)

```json
{
  "type": "https://ismeta.example.com/errors/validation",
  "title": "Validation failed",
  "status": 422,
  "detail": "One or more fields are invalid",
  "instance": "/api/v1/estimates/4f3a.../items",
  "errors": [
    {"field": "quantity", "code": "must_be_positive", "message": "Количество должно быть > 0"},
    {"field": "unit", "code": "unknown_value", "message": "Ед. измерения 'kg' не поддерживается"}
  ],
  "request_id": "a1b2c3..."
}
```

Стандартные `type` URI:
- `/errors/validation` — 422
- `/errors/not-found` — 404
- `/errors/conflict` — 409 (optimistic locking, duplicate)
- `/errors/forbidden` — 403
- `/errors/unauthorized` — 401
- `/errors/rate-limited` — 429
- `/errors/internal` — 500
- `/errors/upstream` — 502/503 (ERP, LLM недоступен)

### Формат cursor-пагинации

Cursor — opaque base64-строка, не для парсинга клиентом. Ответ:

```json
{
  "results": [...],
  "next_cursor": "eyJpZCI6IjRmM2EuLi4iLCJvcmRlciI6ImNyZWF0ZWRfYXQifQ==",
  "has_more": true
}
```

Клиент передаёт `next_cursor` в следующий запрос как `?cursor=...`. Если `has_more=false` и `next_cursor=null` — конец данных.

### SSE для стриминга чата агента

Endpoint `POST /api/v1/estimates/{id}/chat/messages` возвращает `Content-Type: text/event-stream` при заголовке `Accept: text/event-stream`. События:

```
event: message-start
data: {"message_id":"...","role":"assistant"}

event: token
data: {"delta":"Нашёл"}

event: token
data: {"delta":" три"}

event: tool-call
data: {"name":"get_item","arguments":{"item_id":"..."}}

event: tool-result
data: {"name":"get_item","result":{...}}

event: message-end
data: {"message_id":"...","tokens_in":1842,"tokens_out":421,"cost_usd":0.0213}
```

Клиент накапливает `delta` для отображения стримингового ответа; между `tool-call` и `tool-result` в UI показывает индикатор «инструмент X работает».

## 1. ISMeta Public API

### 1.1 Auth

- `POST /api/v1/auth/login` — для standalone-кабинета (email + password) → `{access_token, refresh_token}`.
- `POST /api/v1/auth/refresh` — refresh-flow.
- `POST /api/v1/auth/logout` — отзыв refresh.
- Виджет авторизуется `master_token` + service-to-service JWT (см. 6 ниже).

### 1.2 Workspaces & Folders

- `GET /api/v1/workspaces/current` → текущий контекст.
- `GET /api/v1/folders/?parent_id={uuid|null}` → список детей.
- `POST /api/v1/folders/` → `{name, parent_id?, external_ref?}` → Folder.
- `PATCH /api/v1/folders/{id}` → переименование.
- `DELETE /api/v1/folders/{id}` → soft delete (возвращается 409 если не пуста).

### 1.3 Estimates

- `GET /api/v1/estimates/?folder_id&status&q=&cursor=` → список.
- `GET /api/v1/estimates/{id}` → полная смета (без строк).
- `GET /api/v1/estimates/{id}/sections/` → разделы.
- `GET /api/v1/estimates/{id}/items/?section_id&cursor=` → строки (по 500).
- `POST /api/v1/estimates/` → `{folder_id?, name, number?, currency, price_list_id?}`.
- `PATCH /api/v1/estimates/{id}` → header-поля.
- `POST /api/v1/estimates/{id}/create-version` → создаёт новую Estimate-версию с копированием всех дочерних сущностей.
- `DELETE /api/v1/estimates/{id}` → soft delete.

### 1.4 Sections / Subsections / Items

- `POST /api/v1/sections/`, `PATCH /api/v1/sections/{id}`, `DELETE ...`.
- `POST /api/v1/items/`, `PATCH /api/v1/items/{id}`, `DELETE ...`.
- Bulk: `POST /api/v1/items/bulk-create`, `PATCH /api/v1/items/bulk-update`, `POST /api/v1/items/bulk-move`, `POST /api/v1/items/bulk-delete`, `POST /api/v1/items/bulk-merge`.
- Optimistic lock: каждая мутация требует заголовок `If-Match: {version}`; 409 при рассинхроне.

### 1.5 Matching

- `POST /api/v1/estimates/{id}/match-works` → запускает pipeline, возвращает `{session_id}`.
- `GET /api/v1/estimates/{id}/match-works/{session_id}` → прогресс.
- `POST /api/v1/estimates/{id}/match-works/{session_id}/apply` → применить выбранные результаты.
- `POST /api/v1/estimates/{id}/match-materials` → preview.
- `POST /api/v1/estimates/{id}/match-materials/apply` → применить.

### 1.6 Import/Export

- `POST /api/v1/estimates/{id}/import/excel` (multipart) → `{import_session_id}`.
- `POST /api/v1/estimates/{id}/import/recognition` → `{recognition_session_id}`.
- `GET /api/v1/imports/{session_id}` → статус и diff-превью.
- `POST /api/v1/imports/{session_id}/apply` → применить diff.
- `GET /api/v1/estimates/{id}/export/xlsx` → бинарник .xlsx (см. `05-excel-schema.md`).
- `GET /api/v1/estimates/{id}/export/pdf` → PDF.

### 1.7 LLM-агент (MVP)

- `GET /api/v1/estimates/{id}/chat` → метаданные ChatSession (создаётся лениво).
- `GET /api/v1/estimates/{id}/chat/messages?cursor=` → история.
- `POST /api/v1/estimates/{id}/chat/messages` → `{content}` → SSE-стрим с ответом агента и tool-вызовами.
- `POST /api/v1/items/{item_id}/find-alternatives` → быстрый вызов конкретного tool'а без чата (для кнопки в UI).

### 1.8 Knowledge

- `GET /api/v1/knowledge/?status=pending&cursor=` → очередь на ревью.
- `POST /api/v1/knowledge/{id}/verify` / `POST /api/v1/knowledge/{id}/reject`.

### 1.9 Transmission to ERP

- `POST /api/v1/estimates/{id}/transmit` → создаёт SnapshotTransmission, асинхронно отправляет в ERP (retry by Celery).
- `GET /api/v1/estimates/{id}/transmissions` → список попыток и статусов.

### 1.10 Metrics (для админки)

- `GET /api/v1/metrics/overview?from&to`
- `GET /api/v1/metrics/matching-quality`
- `GET /api/v1/metrics/llm-usage`

## 2. ISMeta → ERP Snapshot API

**Владелец контракта: ERP.** ERP должен принять полный снимок сметы и либо создать ContractEstimate, либо вернуть понятную ошибку.

### 2.1 POST /api/v1/ismeta/snapshots/

Headers:
- `Authorization: Bearer {ismeta_token}` — service-to-service.
- `Idempotency-Key: {uuid}` — `SnapshotTransmission.idempotency_key`.
- `Content-Type: application/json`.

Тело (сокращённо):

```json
{
  "ismeta_version_id": "4f3a...",
  "ismeta_parent_version_id": "8b1c...",
  "workspace_id": "a1b2...",
  "contract_hint": { "contract_id": "123", "is_amendment": false },
  "estimate": {
    "name": "Вентиляция корпус А",
    "number": "СМ-2026-001",
    "currency": "RUB",
    "usd_rate": 92.5,
    "total_materials_purchase": 1250000.00,
    "total_materials_sale": 1625000.00,
    "total_works_purchase": 380000.00,
    "total_works_sale": 1140000.00,
    "vat_rate": 20,
    "with_vat": true,
    "man_hours_total": 1240.5,
    "profit_amount": 1135000.00,
    "profit_percent": 69.7
  },
  "external_refs": {
    "object_id": "obj-42",
    "legal_entity_id": "le-1",
    "price_list_id": "pl-2026"
  },
  "sections": [
    {
      "external_id": "4f3a-sec-1",
      "name": "Воздуховоды",
      "sort_order": 1,
      "material_markup": {"type":"percent","value":30},
      "work_markup": {"type":"percent","value":300},
      "subsections": [],
      "items": [
        {
          "external_id": "4f3a-item-1",
          "row_id": "9b81...",
          "sort_order": 1,
          "name": "Воздуховод прямоугольный 500х400",
          "model_name": "ВП-500х400",
          "brand": null,
          "unit": "м.п.",
          "quantity": 42.5,
          "material_unit_price": 1200.00,
          "work_unit_price": 180.00,
          "material_markup": null,
          "work_markup": null,
          "product_id": "prod-1234",
          "work_item_id": "wi-503",
          "supplier_product_id": null,
          "match_source": "knowledge",
          "match_confidence": 0.87,
          "match_reasoning": "ProductKnowledge verified",
          "is_analog": false
        }
      ]
    }
  ],
  "characteristics": [
    {"key":"system","label":"Система","value_text":"П1"}
  ]
}
```

Ответы:

- `201 Created` — `{ "erp_contract_estimate_id": "ce-789", "erp_contract_id": "c-123", "created": true }`.
- `200 OK` — идемпотентный повтор, то же тело, `"created": false`.
- `409 Conflict` — смета с этим idempotency_key уже принята с другим составом. Body: diff.
- `422 Unprocessable Entity` — невалидные external_refs или ссылки на несуществующие Product/WorkItem. Body: массив ошибок по строкам.
- `5xx` — ISMeta ретрай с exponential backoff.

### 2.2 ERP-валидация snapshot'а (обязательна)

ERP при приёме обязан:
1. Проверить, что все `product_id`, `work_item_id`, `supplier_product_id` существуют; если нет — `422` с подробным списком (по какой строке, какой id отсутствует, какая была альтернатива).
2. Проверить, что `legal_entity_id`, `object_id`, `price_list_id` существуют.
3. Проверить арифметику сверху: сумма по sections ≈ заголовочные `total_*` (допуск 0.01 RUB); расхождение > допуска — `422`.
4. При `is_amendment=true` и `contract_hint.contract_id` — проверить, что договор существует и активен.

## 3. ERP → ISMeta Webhook API

Полное описание payload'ов — в `03-webhook-events.md`. Здесь — только endpoint:

- `POST /api/v1/webhooks/erp` — единый endpoint-ресивер.
- Headers:
  - `X-Webhook-Signature: sha256={hmac}` — HMAC-SHA256 тела с shared secret.
  - `X-Webhook-Event-Id: {uuid}` — для дедупликации.
  - `X-Webhook-Event-Type: product.updated` и т.п.
- Ответы: `200 OK` при успешной обработке или уже-обработанном event_id; `401` при невалидной подписи; `400` при невалидном теле; `5xx` при внутренних ошибках ISMeta — ERP ретрайит.

## 4. ISMeta → ERP Catalog API

**Владелец контракта: ERP.**

- `GET /api/erp-catalog/v1/products?workspace_id&cursor&modified_since` — пагинация товаров, поддержка инкрементальной синхронизации.
- `GET /api/erp-catalog/v1/products/{id}` — полные детали.
- `GET /api/erp-catalog/v1/products/{id}/price-history?limit=20` — история цен.
- `GET /api/erp-catalog/v1/work-items?price_list_id&cursor` — актуальный прайс работ.
- `GET /api/erp-catalog/v1/work-sections` — секции прайса.
- `GET /api/erp-catalog/v1/worker-grades?price_list_id` — ставки грейдов.
- `GET /api/erp-catalog/v1/counterparties?q=&limit=20` — поиск контрагентов.
- `GET /api/erp-catalog/v1/legal-entities` — юр. лица.
- `GET /api/erp-catalog/v1/objects?q=&cursor` — объекты (Folder external_ref).
- `GET /api/erp-catalog/v1/currency-rates` — текущие курсы ЦБР.
- `GET /api/erp-catalog/v1/events?since_event_id=&limit=100` — polling fallback для webhook'ов (см. `03-webhook-events.md`).

Все ответы включают заголовок `X-Latest-Event-Id` — для отслеживания синхронизации.

## 5. ISMeta → Recognition API

**Владелец контракта: сервис распознавания (отдельное Django-app в ERP).** Детали в `docs/ismeta/specs/` не дублируются, здесь — основные endpoints.

- `POST /api/recognition/v1/sessions` (multipart с файлом) → `{session_id, status:"pending"}`. Max 20 файлов на сессию.
- `GET /api/recognition/v1/sessions/{id}` → прогресс и метаданные.
- `GET /api/recognition/v1/sessions/{id}/result` → полный JSON с items[] (см. CONCEPT §3.5).
- `POST /api/recognition/v1/sessions/{id}/cancel` → отмена.

Контракт результата:

```json
{
  "document_meta": {
    "filenames": ["spec.pdf"],
    "pages_total": 24,
    "pages_processed": 24,
    "confidence": 0.87,
    "processing_time_ms": 18420,
    "llm_provider": "openai",
    "llm_model": "gpt-4o",
    "tokens_total": 52341,
    "cost_usd": 0.142
  },
  "errors": [],
  "items": [
    {
      "raw_name": "Вентилятор крышный MOB2600/45-3a",
      "model_name": "MOB2600/45-3a",
      "brand": "MOB",
      "quantity": 4,
      "unit": "шт",
      "section_name": "ВЕНТИЛЯЦИЯ",
      "tech_specs": {"flow":"2600 м³/ч","power":"0.45 кВт","voltage":"3x400V"},
      "confidence": 0.91,
      "source_page": 7,
      "source_coords": [120, 340, 580, 360]
    }
  ]
}
```

## 6. ERP → ISMeta JWT issuance

**Владелец контракта: ERP.**

- `POST /api/erp-auth/v1/ismeta/issue-jwt`
  - Headers: `Authorization: Bearer {master_token}`.
  - Body: `{user_id, workspace_id, ttl_minutes?}` (default 15).
  - Response: `{access_token, refresh_token, expires_at}`.

ISMeta принимает эти JWT при проверке `Authorization` на всех `/api/v1/*` endpoints. Refresh-flow — аналогичный, через `POST /api/v1/auth/refresh`.

## 7. Управление контрактами

- Каждый эндпоинт имеет свой OpenAPI-документ.
- Breaking change → инкремент major версии (`/api/v2/`).
- Минорные изменения → backwards-compatible (новые опциональные поля).
- Deprecation — заголовок `Deprecation: true` + `Sunset: {date}` согласно RFC 8594.
- Генерация клиентов — из OpenAPI (openapi-generator), лежит в `apps/ismeta-web/src/api/` и `@ismeta/widget/src/api/`.

## 8. Контрактные тесты

- **ISMeta и ERP** прогоняют pact-тесты на каждый PR: pact-файлы версионируются.
- **Recognition mock** — отдельная сборка с фикстурами; фронтенд и бэкенд ISMeta могут разрабатываться без реального распознавания.
- **LLM cassette-tests** — см. `04-llm-agent.md`.
