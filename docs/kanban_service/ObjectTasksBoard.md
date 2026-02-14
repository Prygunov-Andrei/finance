# ObjectTasksBoard (V1)

Доска задач по объектам (`Card.type=object_task`).

## Сущности

- `kanban_core.Card`:
  - `due_date`
  - `assignee_user_id` / `assignee_username`
- `kanban_object_tasks.ObjectTask`:
  - `erp_object_id`
  - `priority`

## Просрочка

Периодическая задача (Celery beat) сканирует карточки задач:
- `type=object_task`
- `due_date < today`

И создает событие `task_overdue` (идемпотентно: максимум 1 раз в сутки на карточку).

Дальше rules engine может:
- создать `notify_erp` action,
- проставить ответственного,
- добавить дедлайн и т.д.

## API (V1)

Base: `/kanban-api/v1/`

- CRUD карточек: `/cards/` (type=`object_task`)
- CRUD метаданных задачи: `/object-tasks/`

