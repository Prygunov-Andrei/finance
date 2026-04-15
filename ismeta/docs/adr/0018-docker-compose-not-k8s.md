# ADR-0018. Docker Compose вместо Kubernetes в MVP и коробке

- **Статус:** Accepted
- **Дата:** 2026-04-15
- **Источник:** MVP-SIMPLIFICATIONS §12, tension в reconciliation.

## Контекст

Вариант:
- **Docker Compose:** простой, один host, понятный.
- **Kubernetes:** масштабируемый, self-healing, сложный.

Модели использования ISMeta:
- MVP наш: 1 host, несколько сервисов.
- Коробка клиента: 1-2 host'а клиента.
- SaaS (будущее): multi-tenant, auto-scaling нужен.

## Решение

**Docker Compose для MVP (наш + коробка). Kubernetes — только когда SaaS.**

Конкретика:
- **Наш production (MVP, этап 1-3):** Docker Compose на одном Yandex Cloud VPS.
- **Коробка у клиента:** Docker Compose с install.sh.
- **SaaS (этап 4+):** Kubernetes (Yandex Managed K8s или аналог).

## Триггер пересмотра

Переходим на Kubernetes когда:
- Запуск SaaS (многотенантный).
- Более 50 коробочных клиентов (операционно тяжело поддерживать Docker Compose в 50 местах).
- Нагрузка перерастает single-node (> 100 concurrent сметчиков).

## Последствия

### Плюсы

- Onboarding клиента: 1 час на установку.
- Нет необходимости знать Kubernetes команде.
- Локальная разработка совместима с production (одна docker-compose.yml).

### Минусы

- Нет auto-scaling (manual при нагрузке).
- Нет auto-healing (если container падает — docker compose up --restart).
- При 20+ коробочных клиентах — операционная боль.

### Митигации

- Monitoring + alerts compensate за auto-healing.
- Documentation для клиентов (install.sh).
- Early planning перехода в K8s — когда SaaS начнёт обсуждаться.

## Связанные документы

- [`specs/09-dev-setup.md`](../../specs/09-dev-setup.md)
- [`ENVIRONMENTS.md`](../ENVIRONMENTS.md)
- [`SIZING-GUIDE.md`](../SIZING-GUIDE.md)
- [`MVP-SIMPLIFICATIONS.md §12`](../MVP-SIMPLIFICATIONS.md)
