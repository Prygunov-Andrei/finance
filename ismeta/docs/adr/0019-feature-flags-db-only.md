# ADR-0019. Feature Flags в БД без отдельной админки

- **Статус:** Accepted
- **Дата:** 2026-04-15
- **Источник:** MVP-SIMPLIFICATIONS §13, DevOps-ревью A4.

## Контекст

Feature flags нужны для:
- Постепенный rollout фич.
- A/B testing.
- Gradual rollout (10%, 50%, 100%).
- Emergency kill-switch.
- Workspace-specific overrides.

Варианты реализации:
1. **Unleash / PostHog / LaunchDarkly** — готовый FF-сервис.
2. **БД-таблица + Django admin** — просто.
3. **Конфиг-файлы** — primitive.

## Решение

**БД-таблица `FeatureFlag` + интерфейс через Django admin.**

Schema:
```python
class FeatureFlag(models.Model):
    key = CharField(unique=True)
    workspace_id = UUIDField(null=True)  # null = global
    enabled = BooleanField(default=False)
    value = JSONField(default=dict)  # любые параметры
    created_at, updated_at
```

В коде:
```python
from django.conf import settings
from workspace.flags import is_enabled

if is_enabled("subsection_ui_visible", workspace_id):
    # show subsection in UI
```

## Не реализуется в MVP

- A/B testing framework.
- Gradual rollout (просто on/off).
- Separate UI для управления (только Django admin).
- Real-time flag updates (сейчас — кэш на 1 минуту).

## Триггер пересмотра

Полноценный FF-сервис нужен когда:
- > 10 активных флагов.
- Необходимость gradual rollout.
- A/B testing нужно.
- DevOps жалуется, что невозможно управлять.

## Последствия

### Плюсы

- Minimal scope для MVP.
- Knownпаттерн (Django admin).
- Нет зависимости от external сервиса.

### Минусы

- UX плохой (Django admin — некрасиво).
- Нет gradual rollout.
- Real-time updates требуют cache invalidation.

### Митигации

- Django admin достаточен для технических админов.
- 1-минутный cache — компромисс между consistency и performance.

## Связанные документы

- [`specs/13-release-process.md §7`](../../specs/13-release-process.md)
- [`MVP-SIMPLIFICATIONS.md §13`](../MVP-SIMPLIFICATIONS.md)
