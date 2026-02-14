# Rules Engine Lite (V1)

Цель: простые декларативные триггеры на события kanban без сложного BPM.

## Сущности

`kanban_rules.Rule`
- `board`
- `event_type` (например `card_moved`, `attachment_added`)
- `conditions` (JSON)
- `actions` (JSON list)
- `is_active`

`kanban_rules.RuleExecution`
- дедуп: unique(`rule`, `event`)
- хранит статус/ошибку для ретраев и аудита

## Триггеры (V1)

Правила запускаются на создание `kanban_core.CardEvent` (post_save сигнал -> Celery task).

Защита от циклов (V1):
- события, начинающиеся с `rule_`, по умолчанию не триггерят rules engine.

## Conditions (минимальный DSL V1)

- `card_type`: `supply_case` | `object_task`
- `column_key`: текущее состояние карточки (после события)
- Для `card_moved`:
  - `from_column_key`
  - `to_column_key`

## Actions (V1)

- `{ "type": "set_due_date", "due_date": "YYYY-MM-DD" }`
- `{ "type": "assign", "assignee_user_id": 123, "assignee_username": "..." }`
- `{ "type": "notify_erp", "payload": { ... } }` (реальный HTTP вызов будет на этапе интеграции)

## Идемпотентность

Один `Rule` исполняется максимум один раз на один `CardEvent`.

