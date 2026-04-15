# ADR-0020. Django Admin для админки в MVP

- **Статус:** Accepted
- **Дата:** 2026-04-15
- **Источник:** MVP-SIMPLIFICATIONS §20, UX-ревью N.

## Контекст

Для управления workspaces, members, feature flags, LLM budgets — нужна админская панель.

Варианты:
1. **Django Admin** — бесплатно, из коробки, некрасиво.
2. **Кастомный Next.js** — красиво, требует разработки (2-4 недели).
3. **Готовый framework** (Wagtail, Retool) — средний.

## Решение

**Django Admin для MVP. Кастомный Next.js — backlog.**

Что идёт в Django admin:
- Управление Workspace, WorkspaceMember, FeatureFlag.
- Просмотр Estimate, EstimateItem (read-only в основном).
- ProductKnowledge review (с кастомными actions: verify / reject).
- LLMUsage просмотр + budget editing.
- AuditLog просмотр + filter.

Что НЕ в Django admin:
- Metrics dashboard (отдельный Next.js /admin/metrics с Recharts).
- Custom workflow UI (например, bulk knowledge review).

## Триггер пересмотра

Кастомная админка нужна когда:
- Instance_admin жалуется на Django admin UX более 3 раз.
- Нужно предоставлять админку коробочным клиентам (end-users не оценят Django admin).
- Появляются fluxes где Django admin не работает.

## Последствия

### Плюсы

- 0 дней разработки основной админки.
- Focus development time на user-facing фичах.
- Стандартный паттерн.

### Минусы

- Instance_admin страдает с UX.
- Metrics dashboard приходится делать отдельно (не Django admin).
- Коробочные клиенты с «admin panel» как фичой — не впечатлятся.

### Митигации

- Django admin с `django-jazzmin` (улучшенные темы) — минимум боли.
- Custom actions для частых операций.
- Documentation для instance_admin — «как пользоваться».

## Связанные документы

- [`UX-REVIEW.md §N`](../UX-REVIEW.md)
- [`MVP-SIMPLIFICATIONS.md §20`](../MVP-SIMPLIFICATIONS.md)
