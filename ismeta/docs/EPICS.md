# Эпики этапа 1 (MVP)

Детальные описания 24 эпиков этапа 1. Каждый — самостоятельная единица работы.

Граф зависимостей — [`../specs/08-stage1-dependencies.md`](../specs/08-stage1-dependencies.md).

## MoSCoW priorities

По каждому эпику указано:

- **M (Must):** без этого нет MVP — отложить невозможно.
- **S (Should):** важно, но при острой нужде может быть короче/позже.
- **C (Could):** желательно, но готовы резать скоуп.
- **W (Won't in MVP):** явно отложено (см. MVP-SIMPLIFICATIONS.md).

### Сводка приоритетов

| Эпик | Сложность | MoSCoW | Impact для первого клиента |
|---|---|---|---|
| E1 Infrastructure | L | **M** | High |
| E2 Модели БД | L | **M** | High |
| E3 OpenAPI + pact | M | **S** | Medium |
| E4 Core API CRUD | XL | **M** | High |
| E5 Matching pipeline | XL | **M** | High |
| E6 Markup + Excel export | M | **M** | High |
| E7 Excel import | L | **S** | Medium (упрощённый вариант — см. ADR-0016) |
| E8 LLM agent MVP (2 tools) | XL | **M** | High |
| E9 Frontend редактор | XL | **M** | High |
| E10 Frontend matching UI | L | **M** | High |
| E11 Widget | M | **S** | Medium (для интеграции с ERP) |
| E12 ERP snapshot receiver | L | **M** | High |
| E13 ERP catalog + outbox | XL | **M** | High |
| E14 ERP JWT issuer | M | **M** | High |
| E15 Recognition service | L | **M** | High |
| E16 LLM gateway (MVP) | M | **M** | High |
| E17 Webhook receiver | L | **M** | High |
| E18 Snapshot transmission | M | **M** | High |
| E19 ProductKnowledge sync | M | **S** | Medium |
| E20 Golden set | XL | **S** | Medium (критично для качества, но не блокирует release) |
| E21 E2E Playwright | L | **S** | Medium |
| E22 Multi-tenancy isolation tests | M | **M** | High |
| E23 Backups, rollback, obs | L | **M** | High |
| E24 Docs | L | **M** | High |

### Must (M) — 16 эпиков: безусловный скоуп MVP

E1, E2, E4, E5, E6, E8, E9, E10, E12, E13, E14, E15, E16, E17, E18, E22, E23, E24.

### Should (S) — 5 эпиков: резерв для сокращения

E3, E7, E11, E19, E20, E21. Если срок срывается — рассматриваем сокращение именно этих.

### Could — 0 эпиков. Всё M/S в MVP.

### Won't — см. `MVP-SIMPLIFICATIONS.md`

## Как читать

Для каждого эпика:
- **Цель** — что должно работать по окончании;
- **Артефакты** — какие файлы/endpoint'ы/таблицы появляются;
- **Acceptance** — как убедиться, что эпик закрыт;
- **Владелец** — роль (конкретный человек в `TEAM.md`);
- **Зависимости** — какие эпики должны быть закрыты до начала;
- **Оценка сложности** — S/M/L/XL (субъективная, для sprint-планирования).

## E1. Инфраструктура и скелеты проектов

- **Цель:** dev-стек работает, CI зелёный, два тестовых workspace поднимаются.
- **Артефакты:** всё из `/ismeta/backend/`, `/ismeta/frontend/`, Makefile, CI-workflows.
- **Acceptance:**
  - `./dev-local.sh` поднимает ERP + ISMeta (`make ismeta-smoke` зелёный);
  - `make ismeta-ci-local` проходит (линт + unit + openapi validate);
  - в dev-БД создаются 2 Workspace с разными UUID;
  - `docs/ismeta/{dev,user,admin}/` создана.
- **Владелец:** DevOps + Backend senior.
- **Зависимости:** нет.
- **Сложность:** L.

## E2. Модели БД ISMeta

- **Цель:** все таблицы из [`01-data-model.md`](../specs/01-data-model.md) созданы и протестированы.
- **Артефакты:**
  - Django-приложения `workspace/`, `estimate/`, `agent/`, `integration/` с моделями;
  - миграции (обратимые);
  - фикстуры для тестов.
- **Acceptance:**
  - `make ismeta-db-reset` выполняется без ошибок;
  - все модели покрыты unit-тестами (проверка FK, constraint, default);
  - Multi-tenancy isolation-тест: создаём две сметы в разных workspace, убеждаемся, что запросы фильтруются.
- **Владелец:** Backend senior.
- **Зависимости:** E1.
- **Сложность:** L.

## E3. OpenAPI-контракты и pact-тесты

- **Цель:** OpenAPI-спеки сгенерированы из DRF, pact-тесты стыкуются с ERP.
- **Артефакты:**
  - `ismeta/backend/docs/openapi/v1.yaml` (регулярно регенерируется);
  - `ismeta/backend/tests/pacts/` — pact-файлы для consumer-стороны;
  - ERP-pact-провайдер-тест отвечает по нашим pact'ам (координация с ERP-командой).
- **Acceptance:**
  - OpenAPI покрывает все endpoints из [`02-api-contracts.md §1, §5`](../specs/02-api-contracts.md);
  - pact-тесты прогоняются в CI без реальных сервисов (consumer-side).
- **Владелец:** Backend senior + QA.
- **Зависимости:** E2.
- **Сложность:** M.

## E4. Core API ISMeta: CRUD смет, разделов, строк, наценок

- **Цель:** весь публичный CRUD [`02-api-contracts.md §1.2–1.4`](../specs/02-api-contracts.md) работает.
- **Артефакты:**
  - `estimate/views.py`, `estimate/serializers.py`, `estimate/urls.py`;
  - optimistic locking через `If-Match`;
  - bulk-операции (`bulk-create`, `bulk-update`, `bulk-move`, `bulk-delete`, `bulk-merge`);
  - service `markup_service.py` (перенос из ERP).
- **Acceptance:**
  - integration-тесты на каждый endpoint;
  - 409 при `If-Match` рассинхроне;
  - 422 при нарушении бизнес-правил (например, quantity <= 0);
  - все запросы фильтруются по `workspace_id`.
- **Владелец:** Backend senior.
- **Зависимости:** E2, E3.
- **Сложность:** XL.

## E5. Миграция движка подбора работ (Tier 0-5) + агенты для Tier 6-7

- **Цель:** `match-works` работает от начала до конца.
- **Артефакты:**
  - `estimate/matching/pipeline.py`, `tiers.py`, `service.py`;
  - Celery-task `process_work_matching`;
  - Redis-сессия;
  - запросы к ERP catalog через `integration/erp/client.py`.
- **Acceptance:**
  - smoke: создать смету из 20 строк, запустить подбор, получить результаты;
  - тесты для каждого tier;
  - `MatchingSessionStats` записывается по каждому прогону.
- **Владелец:** Backend senior + LLM-инженер.
- **Зависимости:** E4, E13, E16.
- **Сложность:** XL.

## E6. Миграция движка наценок и Excel-экспорта

- **Цель:** корректный расчёт продажных цен + рабочий экспорт .xlsx.
- **Артефакты:**
  - `estimate/services/markup_service.py` (можно объединить с E4);
  - `estimate/excel/exporter.py` по схеме из [`05-excel-schema.md`](../specs/05-excel-schema.md);
  - Celery-task для долгих экспортов.
- **Acceptance:**
  - unit-тесты на все 3 уровня наценок (смета, раздел, строка);
  - экспортированный .xlsx совпадает с `sample-estimate.xlsx`;
  - скрытые столбцы (row_id, row_hash) присутствуют.
- **Владелец:** Backend senior.
- **Зависимости:** E2, E4.
- **Сложность:** M.

## E7. Excel-импорт с diff-preview

- **Цель:** сметчик может выгрузить, правит в Excel, импортировать с diff.
- **Артефакты:**
  - `estimate/excel/importer.py`;
  - frontend-компонент `ImportDialog` с diff-таблицей;
  - fallback-режим (см. [`05-excel-schema.md §6.3`](../specs/05-excel-schema.md)).
- **Acceptance:**
  - все фикстуры из `tests/fixtures/excel/` корректно импортируются;
  - happy-path без конфликтов — моментально;
  - конфликты показываются в UI, сметчик выбирает действие.
- **Владелец:** Backend senior + Frontend senior.
- **Зависимости:** E6.
- **Сложность:** L.

## E8. LLM-агент MVP: 2 инструмента, чат

- **Цель:** сметчик кликает на строку, открывает чат, агент предлагает аналоги.
- **Артефакты:**
  - `agent/prompts/system_v1.md`;
  - `agent/tools.py` (`get_item`, `find_alternatives_by_specs`);
  - `agent/service.py` с ReAct-циклом;
  - SSE-endpoint `/chat/messages`;
  - frontend-компонент `ChatPanel`.
- **Acceptance:**
  - cassette-тесты на 3 сценария из [`04-llm-agent.md §9.2`](../specs/04-llm-agent.md);
  - LLMUsage записывается;
  - стоимость в пределах таргета.
- **Владелец:** LLM-инженер + Backend senior + Frontend senior.
- **Зависимости:** E5, E16.
- **Сложность:** XL.

## E9. Frontend: редактор сметы

- **Цель:** полноценный редактор — создание, разделы, строки, наценки, версии.
- **Артефакты:** компоненты `EstimateDetail`, `ItemsEditor`, `SectionEditor`, `MarkupDialog`, `VersionsPanel`.
- **Acceptance:**
  - все CRUD-операции работают через UI;
  - виртуализация таблицы на смете 4000 строк;
  - optimistic locking: conflict-dialog при рассинхроне.
- **Владелец:** Frontend senior.
- **Зависимости:** E4.
- **Сложность:** XL.

## E10. Frontend: диалог подбора работ/материалов

- **Цель:** UI для запуска подбора и просмотра результатов.
- **Артефакты:** `WorkMatchingDialog`, `MaterialsMatchingDialog`, polling прогресса.
- **Acceptance:**
  - прогресс обновляется ≤ 1 сек;
  - можно применить/отклонить каждое предложение;
  - bulk-apply доступен.
- **Владелец:** Frontend senior.
- **Зависимости:** E5, E9.
- **Сложность:** L.

## E11. Frontend: виджет `@ismeta/widget`

- **Цель:** тот же функционал встраивается в ERP как npm-пакет.
- **Артефакты:** `frontend/widget/`, сборка tsup, публикация в приватный npm.
- **Acceptance:**
  - виджет работает внутри dev-контура ERP;
  - версионируется semver;
  - размер bundle < 2 МБ gzipped.
- **Владелец:** Frontend senior.
- **Зависимости:** E9.
- **Сложность:** M.

## E12. ERP: endpoint приёма snapshot'ов

- **Цель:** ERP принимает `POST /api/v1/ismeta/snapshots/`, создаёт ContractEstimate-черновик.
- **Артефакты:** эндпоинт в ERP, валидатор snapshot'а, UI «черновик ДОП/договора».
- **Acceptance:**
  - snapshot из [`docs/samples/snapshot-to-erp.json`](./samples/snapshot-to-erp.json) корректно принимается;
  - идемпотентность по `Idempotency-Key`;
  - валидация (см. [`02-api-contracts.md §2.2`](../specs/02-api-contracts.md)) возвращает понятные ошибки.
- **Владелец:** Backend lead (ERP).
- **Зависимости:** нет (в ERP-репо).
- **Сложность:** L.

## E13. ERP: catalog API v1 + outbox webhook'и

- **Цель:** публичный API каталога + outbox для webhook'ов.
- **Артефакты:** эндпоинты из [`02-api-contracts.md §4`](../specs/02-api-contracts.md), таблица `erp.outbox`, Celery-воркер.
- **Acceptance:**
  - mock-fixture-тесты проходят;
  - webhook `product.updated` доходит до ISMeta < 5 сек;
  - polling `/events?since_event_id=` работает.
- **Владелец:** Backend lead (ERP).
- **Зависимости:** нет.
- **Сложность:** XL.

## E14. ERP: JWT issuer для ISMeta

- **Цель:** endpoint `POST /api/erp-auth/v1/ismeta/issue-jwt` работает.
- **Артефакты:** эндпоинт, RS256-ключи, тесты, документация.
- **Acceptance:**
  - ISMeta валидирует JWT публичным ключом;
  - refresh-flow работает;
  - с неверным master-token — 401.
- **Владелец:** Backend lead (ERP).
- **Зависимости:** нет.
- **Сложность:** M.

## E15. Recognition: выделить SpecificationParser в app recognition/

- **Цель:** `backend/recognition/` работает как самостоятельное приложение с API.
- **Артефакты:** новое Django-app, перенос логики из `backend/llm_services/services/specification_parser.py`.
- **Acceptance:**
  - API соответствует [`02-api-contracts.md §5`](../specs/02-api-contracts.md);
  - `docs/samples/recognition-response.json` — то, что возвращается для тестовой спецификации.
- **Владелец:** Backend lead (ERP).
- **Зависимости:** нет.
- **Сложность:** L.

## E16. LLM-шлюз в ERP: учёт токенов (MVP)

- **Цель:** таблица `llm_usage` в ERP + обёртки провайдеров.
- **Артефакты:** модель, обёртка, минимальный дашборд `/admin/llm-usage`.
- **Acceptance:**
  - каждый LLM-вызов ISMeta логируется;
  - бюджет workspace можно посмотреть в дашборде.
- **Владелец:** Backend lead (ERP).
- **Зависимости:** нет.
- **Сложность:** M.

## E17. Webhook receiver ISMeta + idempotency

- **Цель:** endpoint `/api/v1/webhooks/erp` принимает все события, обрабатывает идемпотентно.
- **Артефакты:** `integration/webhooks/receiver.py`, `handlers.py`, `ProcessedEvents`.
- **Acceptance:**
  - все 8 событий из [`03-webhook-events.md`](../specs/03-webhook-events.md) обрабатываются;
  - дубликаты по `event_id` возвращают 200 без повторной обработки;
  - polling fallback работает.
- **Владелец:** Backend senior.
- **Зависимости:** E2, E13.
- **Сложность:** L.

## E18. Snapshot transmission с retry

- **Цель:** «Отдать в ERP» работает надёжно, с retry и идемпотентностью.
- **Артефакты:** `integration/transmission/service.py`, Celery-task, `SnapshotTransmission`.
- **Acceptance:**
  - при 5xx от ERP — exponential backoff;
  - при успехе — smета помечается `transmitted`;
  - webhook `contract.signed` обновляет `transmitted_contract_id`.
- **Владелец:** Backend senior.
- **Зависимости:** E4, E12.
- **Сложность:** M.

## E19. ProductKnowledge sync + .md файлы per workspace

- **Цель:** база знаний двусторонне синхронизируется БД ↔ файловая система.
- **Артефакты:** `knowledge/service.py`, Celery-task `sync_knowledge_md_task`.
- **Acceptance:**
  - изменение в БД → появляется в `.md` в течение 30 мин;
  - ручная правка `.md` → подхватывается в БД;
  - разные workspace'ы изолированы.
- **Владелец:** Backend senior.
- **Зависимости:** E2.
- **Сложность:** M.

## E20. Golden set (10 смет) + cassette-tests

- **Цель:** корпус для регрессии качества подбора.
- **Артефакты:** `tests/golden/estimates/`, `tests/cassettes/golden/`, скрипты, baseline.
- **Acceptance:**
  - все 10 смет размечены;
  - baseline зафиксирован;
  - CI прогоняет cassette-версию на каждый PR.
- **Владелец:** QA + LLM-инженер.
- **Зависимости:** E5 (чтобы было что тестировать).
- **Сложность:** XL.

## E21. E2E-сценарии Playwright

- **Цель:** автоматические E2E на основной workflow.
- **Артефакты:** `frontend/tests/e2e/`.
- **Acceptance:**
  - полный сценарий из [`07-mvp-acceptance.md §3.1`](../specs/07-mvp-acceptance.md) проходит;
  - время прогона < 15 мин.
- **Владелец:** QA + Frontend senior.
- **Зависимости:** E9, E10, E11.
- **Сложность:** L.

## E22. Multi-tenancy isolation tests

- **Цель:** защита от кросс-workspace утечек.
- **Артефакты:** `tests/isolation/` + фикстуры с двумя workspace.
- **Acceptance:**
  - каждый ViewSet покрыт тестом;
  - любая утечка = failed build.
- **Владелец:** QA + Backend senior.
- **Зависимости:** E2, растёт с развитием.
- **Сложность:** M.

## E23. Бэкапы, rollback, observability

- **Цель:** staging умеет бэкапиться и восстанавливаться, миграции обратимы.
- **Артефакты:** `tools/backup.sh`, runbook в `docs/admin/`, алерты.
- **Acceptance:**
  - drill: восстановление staging из вчерашнего бэкапа < 2 часов;
  - rollback release'а отработан минимум 2 раза.
- **Владелец:** DevOps.
- **Зависимости:** нет (параллельно всему).
- **Сложность:** L.

## E24. Developer / User / Admin docs стартовые версии

- **Цель:** документация покрывает роль сметчика и админа.
- **Артефакты:** наполнение `docs/ismeta/{dev,user,admin}/`.
- **Acceptance:**
  - новый сметчик может пройти все сценарии по User Guide;
  - новый админ разворачивает ISMeta по Admin Guide за <2 часов;
  - developer может найти ответ на типовые вопросы в Developer Docs.
- **Владелец:** Продакт/техписатель + вся команда.
- **Зависимости:** нет (параллельно всему, финализируется перед cut-over).
- **Сложность:** L.

## Сводка оценок

| Эпик | Сложность |
|---|---|
| S | — |
| M | E3, E6, E11, E14, E16, E18, E19, E22 |
| L | E1, E2, E7, E10, E12, E15, E17, E21, E23, E24 |
| XL | E4, E5, E8, E9, E13, E20 |

XL-эпики — первые кандидаты на декомпозицию при планировании спринтов.
