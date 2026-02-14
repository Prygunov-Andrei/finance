# Kanban Service — API контракт (черновик V1)

Дата: 2026-02-14

Этот документ фиксирует минимальные HTTP-контракты:
- kanban-service API (то, что будет реализовано в новом сервисе)
- ERP API (то, что kanban-service будет вызывать в ERP)

Принцип: все межсервисные взаимодействия идут только по HTTP, без прямого доступа к БД.

## 1) Авторизация

### 1.1 Пользовательский JWT

- Header: `Authorization: Bearer <jwt>`
- Алгоритм: RS256
- Требования к claims:
  - `iss=finans-assistant-erp`
  - `aud` содержит `kanban-service`
  - `exp`/`nbf` обязательны

### 1.2 Сервисный токен

- Header: `X-Service-Token: <KANBAN_SERVICE_TOKEN>`
- Используется для:
  - входящих webhooks от ERP
  - исходящих вызовов kanban -> ERP (если выбираем сервисный токен вместо пользовательского контекста)

## 2) Kanban Service API (V1)

Base URL: `https://<erp-domain>/kanban-api/v1/`

### 2.1 Boards

- `GET /boards/` — список досок
- `POST /boards/` — создать доску (admin)
- `GET /boards/{id}/` — детали
- `PATCH /boards/{id}/` — обновить настройки (admin)

### 2.2 Columns

- `GET /boards/{id}/columns/` — список колонок доски
- `POST /boards/{id}/columns/` — добавить колонку (admin)
- `PATCH /columns/{id}/` — редактировать title/order/wip_limit (admin)

Важное правило:
- `columns.key` неизменяемый (используется правилами).
- `columns.title` можно переименовывать.

### 2.3 Cards

- `GET /cards/?board_id=&column_key=&search=` — список карточек (пагинация)
- `POST /cards/` — создать карточку
- `GET /cards/{id}/` — детали карточки
- `PATCH /cards/{id}/` — обновить поля (ограничено RBAC)
- `POST /cards/{id}/move/` — переместить карточку (создает событие)

### 2.4 Events (аудит)

- `GET /cards/{id}/events/` — лента событий (append-only)
- `POST /cards/{id}/comments/` — добавить комментарий (создает event)

### 2.5 Files / Attachments

#### File Registry

- `POST /files/init/` — получить presigned PUT URL
- `POST /files/finalize/` — зарегистрировать загруженный объект (sha256 дедуп)
- `POST /files/{id}/download_url/` — получить presigned GET URL

#### Attachments

- `POST /cards/{id}/attachments/` — прикрепить `file_id` к карточке (kind + meta)
- `POST /attachments/{id}/relink/` — перепривязать (card/batch/invoice)

### 2.6 Rules

- `GET /rules/?board_id=` — список правил
- `POST /rules/` — создать правило (admin)
- `PATCH /rules/{id}/` — обновить
- `POST /rules/{id}/dry_run/` — проверить правило на payload (admin)

## 3) Supply overlay API (V1)

Base URL: `https://<erp-domain>/kanban-api/v1/supply/`

- `POST /cases/` — создать кейс снабжения (создает Card type=supply_case)
- `GET /cases/{id}/` — детали (card + supply fields)
- `POST /cases/{id}/invoice_refs/` — привязать ERP invoice id
- `GET /cases/{id}/invoice_refs/` — список привязанных счетов
- `POST /cases/{id}/deliveries/` — создать поставку (DeliveryBatch)
- `POST /deliveries/{id}/items/` — добавить позиции поставки
- `POST /deliveries/{id}/close/` — закрыть поставку (опционально V1)

## 4) Warehouse API (V1)

Base URL: `https://<erp-domain>/kanban-api/v1/warehouse/`

- `GET /locations/` — список локаций (warehouse + object locations)
- `GET /balances/?location_id=&product_id=` — остатки (с `ahhtung` флагом)
- `POST /moves/` — создать движение (IN/OUT/ADJUST)
- `GET /moves/?location_id=&card_id=` — журнал движений

## 5) ERP API (что kanban будет вызывать)

Base URL ERP: `https://<erp-domain>/api/v1/`

### 5.1 Objects

- `GET /objects/` — список объектов (search)
- `GET /objects/{id}/` — детали

### 5.2 Contracts

- `GET /contracts/` — список договоров (search)
- `GET /contracts/{id}/` — детали

### 5.3 Catalog

- `GET /catalog/products/?search=` — поиск продукта
- `GET /catalog/products/{id}/` — детали продукта

### 5.4 Invoices

- `GET /invoices/?status=&object=&search=` — список
- `GET /invoices/{id}/` — детали (включая items/events)
- `POST /invoices/` — создать вручную (если разрешим из kanban)
- Workflow actions:
  - `POST /invoices/{id}/submit_to_registry/`
  - `POST /invoices/{id}/approve/`
  - `POST /invoices/{id}/reject/`
  - `POST /invoices/{id}/reschedule/`

### 5.5 Notifications

ERP уже имеет `GET` и `mark_read`, но для kanban нужен сервисный endpoint создания уведомлений.

Требование V1:
- `POST /notifications/` (или выделенный `POST /notifications/system_create/`) — создание уведомления системой при наличии сервисного токена.

Примечание:
- Текущий `NotificationViewSet` в ERP read-only; для kanban потребуется отдельный endpoint (будет добавлен на этапе интеграции).

