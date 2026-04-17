# Architecture Decision Records (ADR)

Краткие записи ключевых архитектурных решений. Формат — [MADR](https://adr.github.io/madr/) упрощённый.

## Как читать

Каждый ADR — одна страница: контекст, рассмотренные варианты, решение, последствия. Читается за 3-5 минут. Если после чтения возникает вопрос «почему мы сделали X» — ADR должен ответить.

## Как добавлять

1. Номер — следующий из таблицы ниже.
2. Имя файла — `NNNN-short-slug.md`.
3. Статус — `Proposed`, `Accepted`, `Superseded by NNNN`, `Deprecated`.
4. PR с добавлением — обязательно review.

## Список ADR

| # | Решение | Статус |
|---|---|---|
| [0001](./0001-django-as-backend.md) | Backend на Django 5 (не FastAPI) | Accepted |
| [0002](./0002-separate-database.md) | Отдельная БД PostgreSQL, не общая с ERP | Accepted |
| [0003](./0003-uuid-workspace-id.md) | Multi-tenancy через UUID `workspace_id` с первого дня | Accepted |
| [0004](./0004-outbox-pattern.md) | Outbox + polling fallback вместо Kafka для webhook'ов | Accepted |
| [0005](./0005-llm-agent-tool-use.md) | LLM-агент через tool use, а не через полный JSON-контекст | Accepted |
| [0006](./0006-no-workitem-cache.md) | Не кешируем WorkItem, дёргаем ERP live | Accepted |
| [0007](./0007-readonly-after-transmission.md) | Переданные в ERP версии смет становятся read-only навсегда | Accepted |
| [0008](./0008-recognition-inside-erp.md) | Сервис распознавания — отдельное Django-приложение внутри ERP | Accepted |
| [0009](./0009-knowledge-md-files.md) | ProductKnowledge в БД + зеркало в .md файлах per-workspace | Accepted |
| [0010](./0010-optimistic-locking.md) | Optimistic locking на строках сметы вместо CRDT | Accepted |
| [0011](./0011-widget-pattern.md) | Встраивание в ERP через npm-пакет `@ismeta/widget` | Accepted |
| [0012](./0012-auditlog-1year.md) | AuditLog хранится 1 год (retention) | Accepted (partitioning superseded by 0021) |
| [0013](./0013-excel-roundtrip.md) | Excel-цикл через row_id + hash, без Google Sheets в MVP | Accepted |
| [0014](./0014-no-contract-creation-from-ismeta.md) | ISMeta не создаёт ContractEstimate/ContractAmendment в ERP | Accepted |
| [0015](./0015-version-link-ismeta-erp.md) | VersionLink — явная связь версий ISMeta ↔ ERP | Accepted |
| [0016](./0016-excel-roundtrip-simplified.md) | Excel round-trip упрощённый в MVP (без 3-way merge) | Accepted |
| [0017](./0017-single-region-mvp.md) | Single-region infrastructure в MVP | Accepted |
| [0018](./0018-docker-compose-not-k8s.md) | Docker Compose вместо Kubernetes в MVP и коробке | Accepted |
| [0019](./0019-feature-flags-db-only.md) | Feature Flags в БД без отдельной админки | Accepted |
| [0020](./0020-django-admin-in-mvp.md) | Django Admin для админки в MVP | Accepted |
| [0021](./0021-partition-from-day-one.md) | Партиционирование append-heavy таблиц с первой миграции | Accepted |
| [0022](./0022-semi-boxed-product.md) | Полукоробочный продукт: под Август, с архитектурой для адаптации | Accepted |
