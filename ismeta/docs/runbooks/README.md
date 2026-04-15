# Runbooks — каталог для инцидентов

Пошаговые инструкции на случай типовых проблем. Каждый runbook — одна страница, read-time 3-5 минут.

## Философия

- **Runbook ≠ документация архитектуры.** Это пошаговая инструкция для дежурного в 3 часа ночи.
- **Cover 80% случаев.** Edge cases — эскалация к архитектору.
- **Обновляется после каждого инцидента.** Если прошли шаги, а проблема не решилась — runbook неполный.

## Структура runbook'а

Каждый файл содержит:
1. **Название и severity** (P0-P3).
2. **Симптомы** — как распознать, что это именно оно.
3. **Impact** — что страдает.
4. **Первые 5 минут** — immediate actions.
5. **Диагностика** — команды для проверки.
6. **Варианты решения** — по убыванию вероятности.
7. **Эскалация** — когда и к кому.
8. **Post-mortem checklist** — что зафиксировать.

## Каталог

| Runbook | Severity | Частота |
|---|---|---|
| [db-down.md](./db-down.md) | P0 | редко |
| [redis-down.md](./redis-down.md) | P1 | редко |
| [erp-unreachable.md](./erp-unreachable.md) | P1 | средне |
| [llm-outage.md](./llm-outage.md) | P2 | часто |
| [backup-failed.md](./backup-failed.md) | P2 | редко |
| [data-corruption.md](./data-corruption.md) | P0 | очень редко |
| [webhook-flood.md](./webhook-flood.md) | P2 | редко |
| [secret-compromised.md](./secret-compromised.md) | P0 | редко |
| [ddos-attack.md](./ddos-attack.md) | P1 | средне |
| [migration-stuck.md](./migration-stuck.md) | P1 | редко |
| [postmortem-template.md](./postmortem-template.md) | — | после каждого P0/P1 |

## Severity классификация

- **P0 (critical):** production down, data loss, security breach. Реакция: 15 минут, все руки на палубу.
- **P1 (high):** major функциональность не работает, значительная часть пользователей. Реакция: 1 час.
- **P2 (medium):** minor функциональность, workaround возможен. Реакция: 4 часа (рабочие дни).
- **P3 (low):** косметическое, не блокирует работу. Реакция: в ближайший спринт.

## Процесс инцидента

```
1. Detection (alert / user report)
        ↓
2. Классификация severity (P0-P3)
        ↓
3. Открытие incident (channel + лог)
        ↓
4. Найти соответствующий runbook
        ↓
5. Шаги runbook'а
        ↓
6. Если не решилось → эскалация
        ↓
7. Resolution
        ↓
8. Incident close
        ↓
9. Postmortem (P0/P1 обязательно)
        ↓
10. Update runbook по итогам
```

## Incident log

Ведётся в `docs/incidents/YYYY-MM-DD-short-slug.md` по шаблону `postmortem-template.md`.

## Кто пишет runbook

- **Первый раз:** архитектор / техлид по gap'у из DEVOPS-REVIEW.
- **Обновление:** дежурный по итогам инцидента.
- **Review:** техлид при merge.

## Training

- Tabletop exercise раз в квартал: имитация инцидента, команда проходит по runbook'у.
- Новый член команды — читает все runbook'и в onboarding.

## Связанные документы

- [`../SLO.md`](../SLO.md) — цели SLO, error budget.
- [`../DR-PLAN.md`](../DR-PLAN.md) — disaster recovery plan.
- [`../INCIDENT-SEVERITY.md`](../INCIDENT-SEVERITY.md) — подробно о severity.
- [`../../specs/12-security.md §11`](../../specs/12-security.md) — security incident response.
