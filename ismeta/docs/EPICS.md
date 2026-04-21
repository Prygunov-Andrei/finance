# Эпики этапа 1 (MVP)

Детальные описания эпиков этапа 1. Каждый — самостоятельная единица работы.

**Версия:** 0.2. **Дата:** 2026-04-17.

**История:** v0.2 — пересмотр MoSCoW после 4 customer development интервью (см. `interviews/RETROSPECTIVE-4-INTERVIEWS.md`). Добавлены E25-E27, скорректированы E5/E8/E9/E10/E15. ADR-0022 (полукоробка) применён.

Граф зависимостей — [`../specs/08-stage1-dependencies.md`](../specs/08-stage1-dependencies.md).

## MoSCoW priorities

- **M (Must):** без этого нет MVP — отложить невозможно.
- **S (Should):** важно, но при острой нужде может быть короче/позже.
- **C (Could):** желательно, но готовы резать скоуп.
- **W (Won't in MVP):** явно отложено (см. MVP-SIMPLIFICATIONS.md).

### Сводка приоритетов (v0.2 — после customer development)

| Эпик | Сложность | MoSCoW | Impact | Изменение v0.2 |
|---|---|---|---|---|
| E1 Infrastructure | L | **M** | High | ✅ Закрыт |
| E2 Модели БД | L | **M** | High | ✅ В работе |
| E3 OpenAPI + pact | M | **S** | Medium | — |
| E4 Core API CRUD + агрегаты | XL | **M** | High | +агрегаты (аванс, сроки, прибыльность) |
| E5 Matching pipeline + автозаполнение | XL | **M** | High | ⚡ Переформулирован: автозаполнение + group matching + keyboard-first review + ProductKnowledge rules |
| E6 Markup + Excel export | M | **M** | High | — |
| E7 Excel import | L | **S** | Medium | — |
| E8 LLM agent: проверяющий + подсказчик | XL | **M** | High | ⚡ Переформулирован: ИИ-проверяющий готовой сметы + подсказчик с вариантами + автомат для публичной части |
| E9 Frontend редактор | XL | **M** | High | +keyboard-first навигация |
| E10 Frontend matching UI | L | **M** | High | ⚡ Переформулирован: keyboard-first review (стрелки + Enter) |
| E11 Widget | M | **S** | Medium | — |
| E12 ERP snapshot receiver | L | **M** | High | — |
| E13 ERP catalog + outbox | XL | **M** | High | — |
| E14 ERP JWT issuer | M | **M** | High | — |
| E15 Recognition service | L | **S** | High | ⬇ M→S. Для линейных — боль, но mock в MVP достаточен |
| E16 LLM gateway (MVP) | M | **M** | High | — |
| E17 Webhook receiver | L | **M** | High | — |
| E18 Snapshot transmission | M | **M** | High | — |
| E19 ProductKnowledge sync | M | **S** | Medium | — |
| E20 Golden set | XL | **S** | Medium | — |
| E21 E2E Playwright | L | **S** | Medium | — |
| E22 Multi-tenancy isolation tests | M | **M** | High | — |
| E23 Backups, rollback, obs | L | **M** | High | — |
| E24 Docs | L | **M** | High | — |
| **E25 Два трека оборудования** | M | **M** | High | 🆕 customer dev: 4/4 подтвердили |
| **E26 Каскадное обновление документов** | L | **M** | High | 🆕 customer dev: волшебная палочка Кати |
| **E27 Формат экспорта per customer** | M | **S** | Medium | 🆕 customer dev: волшебная палочка Оли (АСГ) |

### Must (M) — 18 эпиков

E1, E2, E4, E5, E6, E8, E9, E10, E12, E13, E14, E16, E17, E18, **E25, E26**, E22, E23, E24.

### Should (S) — 8 эпиков

E3, E7, E11, **E15**, E19, E20, E21, **E27**.

### Could — 1

Перерасчёт единиц (м.п. → м²) — в рамках E4 или отдельно.

### Won't in MVP

- Шаблоны/заготовки КП (у Августа свои есть).
- Мобильное (0/4 интервью).
- Опросные листы (ICP-2, не MVP).
- API поставщиков (этап 2).
- Full recognition service (mock в MVP, live — этап 2).

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

## E5. Matching pipeline: автозаполнение + group matching + ProductKnowledge rules ⚡

- **Цель:** `match-works` автоматически подбирает работу к каждой строке сметы, группирует одинаковые позиции, сметчик проверяет через keyboard-first UI.
- **Источник переосмысления:** customer development. Автоподбор = Must, но с обязательным ручным review. Правила в ProductKnowledge (30-100 правил, растут). Group matching: 100 одинаковых позиций → подбор 1 раз → apply ко всем.
- **Артефакты:**
  - `estimate/matching/pipeline.py`, `tiers.py`, `service.py`;
  - Celery-task `process_work_matching`;
  - Redis-сессия;
  - **ProductKnowledge rules** — правила подбора per workspace (пр.: «кабель → смотри жилы → "Прокладка кабеля X-жил"»). Хранятся в БД + .md файлы;
  - **Group matching** — автоматическое обнаружение одинаковых позиций в смете → подбор 1 раз → bulk-apply;
  - **Confidence score** на каждой подобранной работе (green/yellow/red);
  - запросы к ERP catalog через `integration/erp/client.py`.
- **Acceptance:**
  - smoke: смета из 100 строк с 20 повторами → автозаполнение за < 2 мин;
  - группировка: 20 одинаковых кабелей → 1 подбор → apply ко всем 20;
  - confidence: green (>0.9) → auto-apply, yellow (0.5-0.9) → review, red (<0.5) → manual;
  - тесты для каждого tier;
  - `MatchingSessionStats` записывается.
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

## E8. LLM-агент: проверяющий + подсказчик + чат ⚡

- **Цель:** два режима LLM для сметчика:
  1. **Проверяющий:** загрузить готовую смету → ИИ указывает подозрительные позиции (цена выше/ниже рынка, пропущен монтаж, несоответствие оборудования).
  2. **Подсказчик + чат:** сметчик кликает на строку, открывает чат, агент предлагает аналоги с confidence. Для публичной части сайта (этап 2) — автомат без ручного confirm.
- **Источник переосмысления:** customer development. Оля: «было бы здорово, если ИИ проверил смету и указал где ошибка». Катя: скептична к автоматике, хочет контроль.
- **Артефакты:**
  - `agent/prompts/system_v1.md`;
  - `agent/tools.py` (`get_item`, `find_alternatives_by_specs`, **`validate_estimate`**);
  - `agent/service.py` с ReAct-циклом;
  - SSE-endpoint `/chat/messages`;
  - **`/api/v1/estimates/{id}/validate`** — endpoint проверки готовой сметы;
  - frontend-компонент `ChatPanel` + `ValidationReport`.
- **Acceptance:**
  - cassette-тесты на 3 сценария;
  - validate endpoint возвращает список подозрительных позиций;
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

## E10. Frontend: keyboard-first review подбора ⚡

- **Цель:** сметчик «бежит» по таблице, проверяя автоподобранные работы. Стрелки ↑↓ = навигация, Enter = подтвердить, Esc = отклонить. Группы одинаковых — одним действием.
- **Источник переосмысления:** customer development (Андрей: «два пальца на стрелках, третий на Enter»).
- **Артефакты:**
  - `WorkMatchingReview` — таблица с colour-coded confidence (green/yellow/red);
  - Keyboard shortcuts: ↑↓ навигация, Enter accept, Esc reject, Tab next-yellow;
  - Group view: одинаковые позиции свёрнуты, accept-all/reject-all;
  - Polling прогресса matching session.
- **Acceptance:**
  - 100 строк пролистываются за 2 минуты ручной проверки (зелёные скипаются);
  - bulk-apply на группу одинаковых — одно действие;
  - прогресс обновляется ≤ 1 сек.
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

## E25. Два трека оборудования (стандарт + основное) 🆕

- **Цель:** в смете видно разделение на «быстрый трек» (материалы, кабели — цены с сайтов/кабинетов) и «длинный трек» (основное оборудование — запрос → бронирование → КП → согласование).
- **Источник:** customer development (4/4 интервью: главная боль = поставщики; О��я: «сразу отправляю, прошу забронировать»).
- **Артефакты:**
  - Поле `EstimateItem.is_key_equipment` (bool).
  - Поле `EstimateItem.procurement_status` (none → requested → quoted → booked → ordered).
  - UI: два блока/фильтра в редакторе (стандартные позиции / основное оборудование).
  - Виджет статуса трека 2 (сколько позиций ждёт КП, сколько забронировано).
- **Acceptance:**
  - сметчик может пометить позицию как «основное оборудование»;
  - procurement_status обновляется вручную (MVP) или через интеграцию (этап 2);
  - фильтр «показать только основное оборудование» в UI.
- **Владелец:** Backend senior + Frontend senior.
- **Зависимости:** E2, E4, E9.
- **Сложность:** M.

## E26. Каскадное обновление связанных документов 🆕

- **Цель:** изменение в смете автоматически отражается во всех связанных артефактах (ТКП-snapshot, ведомость давальческого, КС-ки) + журнал «что и когда изменилось».
- **Источник:** customer development (волшебная палочка Кати: «исправляю в одном месте → во всех шести автоматически + журнал»).
- **Уточнение (ADR-0022):** ISMeta хранит master-таблиц�� сметы. Производные документы (ТКП, КС) — в ERP. ISMeta отдаёт snapshot → ERP обновляет свои документы. Каскад = ISMeta пересчитывает агрегаты + формирует новый snapshot + уведомляет ERP через webhook `estimate.updated`.
- **Артефакты:**
  - Автоматический пересчёт агрегатов при изменении любой строки (total_*, man_hours, advance, estimated_days).
  - Webhook `estimate.updated` → ERP подхватывает и обновляет свои документы.
  - Журнал изменений (AuditLog) с фильтром «что менялось с последней передачи в ERP».
  - UI: индикатор «смета изменилась после последней передачи — пересобрать snapshot?».
- **Acceptance:**
  - изменение цены в строке → все агрегаты пересчитываются моментально;
  - AuditLog фиксирует: кто, когда, что, старое → новое;
  - webhook уходит в ERP < 5 сек.
- **Владелец:** Backend senior.
- **Зависимости:** E4, E17, E18.
- **Сложность:** L.

## E27. Формат экспорта per customer 🆕

- **Цель:** смета экспортируется в формат, который требует конкретный заказчик (например, АСГ: разделение монтаж/оборудование + обязательные строки).
- **Источник:** customer development (волшебная палочка Оли: «ведомости АСГ сами заполнялись»).
- **Артефакты:**
  - Модель `ExportTemplate` (per workspace + per customer): маппинг колонок, правила разделения, обязательные строки.
  - Service `export_service.py`: применить шаблон → Excel.
  - MVP: 2 шаблона (внутренний Август + АСГ).
- **Acceptance:**
  - сметчик выбирает «экспорт для АСГ» → получает Excel в формате А��Г;
  - монтаж и оборудование автоматически разделены;
  - ведомость давальческого материала заполнена.
- **Владелец:** Backend senior + Frontend senior.
- **Зависимости:** E6.
- **Сложность:** M.

## Сводка оценок (v0.2)

| Эпик | Сложность |
|---|---|
| S | — |
| M | E3, E6, E11, E14, E16, E18, E19, E22, **E25**, **E27** |
| L | E1✅, E2, E7, E10, E12, E15, E17, E21, E23, E24, **E26** |
| XL | E4, E5, E8, E9, E13, E20 |

XL-эпики — первые кандидаты на декомпозицию при планировании спринтов.

## Статус эпиков (live)

_Обновлено 2026-04-21 после прогона демо-цикла + QA-сессии._

| Эпик | Статус | Дата |
|---|---|---|
| E1 Infrastructure | ✅ Закрыт | 2026-04-17 |
| E2 Модели БД | ✅ Закрыт (estimate/workspace/material/integration) | 2026-04-21 |
| E4 Core API CRUD | ✅ Закрыт (+ optimistic lock, bulk, tech_specs) | 2026-04-21 |
| E5 Matching pipeline работ | 🟡 Закрыт MVP (7 tiers, синхронно; async через Celery + Redis-session — позже) | 2026-04-21 |
| E6 Markup + Excel export | ✅ Закрыт | 2026-04-21 |
| E7 Excel import | ✅ Закрыт | 2026-04-21 |
| E8 LLM agent (validate + chat) | ✅ Закрыт | 2026-04-21 |
| E9 Frontend редактор | ✅ Закрыт | 2026-04-21 |
| E10 Keyboard-first matching review | ✅ Закрыт | 2026-04-21 |
| E15.01 Recognition MVP + /parse/spec | ✅ Закрыт | 2026-04-20 |
| E15.02a /parse/invoice + /parse/quote | ✅ Закрыт | 2026-04-20 |
| E15.02b Клиенты в ISMeta + ERP payments | ✅ Закрыт | 2026-04-20 |
| **E15.03 Hybrid text-layer parser** | ⏳ **В работе** (IS-Петя — после QA blocker #3 2026-04-21) | 2026-04-21 |
| E25 Два трека оборудования | ✅ Закрыт (is_key_equipment + procurement_status) | 2026-04-21 |
| E28 (слой 1) Удаление legacy парсеров | ✅ Закрыт (SpecificationParser удалён, api_public на Recognition) | 2026-04-21 |
| E-MAT-01 Material catalog + matching | ✅ Закрыт (rapidfuzz, 45 seed-материалов) | 2026-04-21 |
| E-MAT-UI-01 Autocomplete + match dialog | ✅ Закрыт | 2026-04-21 |
| E-SEED-01 Реалистичная демо-смета ОВиК | ✅ Закрыт (3 сметы, 47 позиций) | 2026-04-21 |
| UX-PDF-PROGRESS Honest progress bar | ⏳ В работе (IS-Федя) | 2026-04-21 |
| UI-01 Resizable sidebar | ✅ Закрыт | 2026-04-20 |
| UI-02 Name/model разделение | ✅ Закрыт | 2026-04-20 |
| E3, E11, E12-E14, E16-E24, E26, E27 | ⬜ Не начаты | — |
| E28 (слой 2) Вырезание estimates из ERP | ⬜ Не начат (зависит от E15.03 + MVP Айсметы dogfood) | — |

**Известные живые блокеры** (см. `QA-FINDINGS-2026-04-21.md`):
- 🔴 `#3` Recognition игнорирует text layer → закрывается E15.03 в работе.
- 🔴 `#2` Vision даёт ~4% recall → закрывается E15.03 (Vision становится fallback).
- 🟠 `#1` Непрозрачный прогресс → закрывается UX-PDF-PROGRESS в работе.
