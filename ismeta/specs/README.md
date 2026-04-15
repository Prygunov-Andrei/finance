# ISMeta — архитектурная спецификация

Комплекс документов, раскрывающий CONCEPT.md до уровня, по которому можно резать задания разработчикам.

**Первый раз в проекте?** Начни с [`../README.md`](../README.md), затем [`../ONBOARDING.md`](../ONBOARDING.md). Эти spec'и — для углубления, не для первого знакомства.

## Структура

| # | Документ | Назначение | Аудитория |
|---|---|---|---|
| 01 | [data-model.md](./01-data-model.md) | ER-диаграмма и поля всех таблиц ISMeta | backend |
| 02 | [api-contracts.md](./02-api-contracts.md) | OpenAPI-контракты всех пяти границ | backend, интеграторы |
| 03 | [webhook-events.md](./03-webhook-events.md) | Полные payload'ы событий ERP→ISMeta | backend ISMeta, backend ERP |
| 04 | [llm-agent.md](./04-llm-agent.md) | System prompt, инструменты, конфиги LLM-агента | LLM-инженер |
| 05 | [excel-schema.md](./05-excel-schema.md) | Формат .xlsx для двустороннего цикла | backend, frontend |
| 06 | [migration-plan.md](./06-migration-plan.md) | Перенос кода из `backend/estimates/` в ISMeta | backend, тимлид |
| 07 | [mvp-acceptance.md](./07-mvp-acceptance.md) | Измеримые критерии готовности MVP и последующих этапов | все |
| 08 | [stage1-dependencies.md](./08-stage1-dependencies.md) | Dependency graph эпиков этапа 1 | тимлид, PM |
| 09 | [dev-setup.md](./09-dev-setup.md) | Локальная разработка и интеграционное тестирование | все разработчики |
| 10 | [public-mode.md](./10-public-mode.md) | UX и технические требования публичного режима | backend, frontend, дизайн |
| 11 | [metrics.md](./11-metrics.md) | Сбор, хранение, отображение метрик | backend, devops |
| 12 | [security.md](./12-security.md) | Секреты, бэкапы, антивирус, периметр | backend, devops |
| 13 | [release-process.md](./13-release-process.md) | Semver API, миграции, rollback | тимлид, devops |
| 14 | [golden-set.md](./14-golden-set.md) | Процесс формирования и пополнения корпуса эталонных смет | QA, LLM-инженер |

## Как читать

- **Для первого знакомства с продуктом** — начните с [CONCEPT.md](../CONCEPT.md), затем `07-mvp-acceptance.md` для понимания целей.
- **Для проектирования БД** — `01-data-model.md`.
- **Для интеграции с ERP** — `02-api-contracts.md`, `03-webhook-events.md`.
- **Для работы с LLM** — `04-llm-agent.md`, `14-golden-set.md`.
- **Для запуска локально** — `09-dev-setup.md`.
- **Для планирования спринтов** — `08-stage1-dependencies.md`, `07-mvp-acceptance.md`.

## Принципы поддержания документов

1. **OpenAPI — первоисточник правды.** Если спецификация и код расходятся — меняется спецификация или код, но не терпится.
2. **Каждый документ владеет своим разделом.** Не дублировать информацию между документами, ссылаться.
3. **Примеры обязательны.** Каждый контракт сопровождается JSON-примером.
4. **Изменения — через PR с code-review.** Документы в репозитории, история в git.
5. **Версия документа в заголовке.** При существенном изменении — bump версии, фиксируем дату.

## Связанные документы вне `specs/`

- [`../README.md`](../README.md) — главный README проекта.
- [`../ONBOARDING.md`](../ONBOARDING.md) — чек-лист первой недели.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — правила контрибьюции.
- [`../GLOSSARY.md`](../GLOSSARY.md) — глоссарий терминов.
- [`../DOMAIN-GUIDE.md`](../DOMAIN-GUIDE.md) — гид по предметной области.
- [`../CONCEPT.md`](../CONCEPT.md) — концепция продукта.
- [`../RESEARCH_NOTES.md`](../RESEARCH_NOTES.md) — заметки из исследования ERP.
- [`../CHANGELOG.md`](../CHANGELOG.md) — история изменений.
- [`../docs/adr/`](../docs/adr/) — architecture decision records.
- [`../docs/samples/`](../docs/samples/) — примеры данных (JSON, Excel).
- [`../docs/EPICS.md`](../docs/EPICS.md) — детальные описания эпиков.
- [`../docs/TEAM.md`](../docs/TEAM.md) — команда и контакты.
- [`../docs/TROUBLESHOOTING.md`](../docs/TROUBLESHOOTING.md) — типовые проблемы.
- [`../docs/LLM-COST-MODEL.md`](../docs/LLM-COST-MODEL.md) — модель расходов на LLM.
- [`../docs/SLO.md`](../docs/SLO.md) — цели доступности и latency.
- [`../docs/DATA-RESIDENCY.md`](../docs/DATA-RESIDENCY.md) — где хранятся данные.
- [`../docs/RECOGNITION-BUILD-VS-BUY.md`](../docs/RECOGNITION-BUILD-VS-BUY.md) — сервис распознавания: делать или купить.
- [`../docs/ARCHITECTURE-REVIEW.md`](../docs/ARCHITECTURE-REVIEW.md) — архитектурный ревью-артефакт.
- [`../docs/PRODUCT-REVIEW.md`](../docs/PRODUCT-REVIEW.md) — продуктовое ревью.
- [`../docs/SECURITY-REVIEW.md`](../docs/SECURITY-REVIEW.md) — security-ревью.
- [`../docs/UX-REVIEW.md`](../docs/UX-REVIEW.md) — UX-ревью.
- [`../docs/DEVOPS-REVIEW.md`](../docs/DEVOPS-REVIEW.md) — DevOps/SRE ревью.
- [`../docs/REVIEWS-RECONCILIATION.md`](../docs/REVIEWS-RECONCILIATION.md) — сведение 5 ревью в единый roadmap.
