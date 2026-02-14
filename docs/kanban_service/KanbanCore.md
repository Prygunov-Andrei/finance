# Kanban Core (V1)

Ядро kanban-сервиса: доски, колонки, карточки, события, вложения.

## Сущности

### Board

`kanban_core.Board`:
- `key` (immutable) — идентификатор доски (`supply`, `object_tasks`)
- `title` (editable)

### Column

`kanban_core.Column`:
- `board`
- `key` (immutable) — используется логикой/правилами/интеграциями
- `title` (editable)
- `order` (editable)
- `wip_limit` (optional)

### Card

`kanban_core.Card`:
- `board`, `column`
- `type`: `supply_case` | `object_task`
- `title`, `description`, `meta` (JSON)

### CardEvent (append-only audit)

`kanban_core.CardEvent`:
- `event_type` (`card_created`, `card_moved`, `card_updated`, `attachment_added`, ...)
- `data` (JSON)
- `actor_user_id`, `actor_username`

### Attachment

`kanban_core.Attachment`:
- `card`
- `file` -> `kanban_files.FileObject`
- `kind` (`document`/`photo`/`other`)
- `document_type` (`invoice`, `request`, `primary`, ...)

## API (V1)

Base: `/kanban-api/v1/`

- `GET/POST /boards/`
- `GET/PATCH/DELETE /boards/{id}/`
- `GET/POST /columns/`
- `PATCH /columns/{id}/` (`key` менять нельзя)
- `GET/POST /cards/`
- `POST /cards/{id}/move/` (`to_column_key`)
- `GET /cards/{id}/events/`
- `POST /cards/{id}/attach_file/` (создает Attachment + CardEvent)

## Инварианты

- Переименование `Column.title` не влияет на логику, т.к. все правила/переходы завязаны на `Column.key`.
- Любое пользовательское действие фиксируется событием (`CardEvent`).

