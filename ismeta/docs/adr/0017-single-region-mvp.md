# ADR-0017. Single-region инфраструктура в MVP

- **Статус:** Accepted
- **Дата:** 2026-04-15
- **Источник:** MVP-SIMPLIFICATIONS §11, DevOps-ревью F1.

## Контекст

Multi-region развёртывание (две-три geo-распределённые копии) — стандарт для enterprise-продуктов с requirement uptime 99.9%+.

Для MVP:
- 1 клиент (мы сами).
- Uptime target SLO 99.5%.
- Бюджет MVP ограничен.
- Development capacity — конечная.

## Решение

**Single-region infrastructure в MVP:**

- Production: один сервер в Yandex Cloud (регион Moscow).
- Staging: там же.
- Backups: в другой регион (Yandex Object Storage cross-region).
- DR: восстановление из backup в тот же регион при server failure.

## Триггер пересмотра

Multi-region needed когда:
- Первый Enterprise клиент с SLA > 99.9%.
- Regional outage Yandex Cloud произошёл и длился > 4 часов.
- Расширение в регионы с data residency requirements (Казахстан, Беларусь).

## Последствия

### Плюсы

- Простая инфраструктура — 1 сервер вместо 3+.
- Низкий cost: 100K ₽/мес vs 400K+ ₽/мес для multi-region.
- Простое deploy и monitoring.

### Минусы

- RTO 8 часов (vs 1 час для multi-region).
- RPO 15 минут (приемлемо).
- Полный outage при regional event Yandex Cloud.

### Митигации

- Cross-region backups гарантируют recoverability.
- DR runbooks хорошо проработаны.
- Monitoring sensitivity увеличен для раннего detection issues.

## Связанные документы

- [`DR-PLAN.md`](../DR-PLAN.md)
- [`SIZING-GUIDE.md`](../SIZING-GUIDE.md)
- [`ENVIRONMENTS.md`](../ENVIRONMENTS.md)
- [`MVP-SIMPLIFICATIONS.md §11`](../MVP-SIMPLIFICATIONS.md)
