# 06. План миграции кода из `backend/estimates/` в ISMeta

**Версия:** 0.1. **Назначение:** пошагово описать, что переносится, что переписывается, что остаётся.

## 1. Исходное состояние

Модуль `backend/estimates/` на проде (см. RESEARCH_NOTES.md §1.1, §6):
- ~16 000 LOC;
- 13 моделей, 11 миграций (включая data-migration 0010);
- 4 файла views (~1400 LOC), 9 сервисов (~3400 LOC), 5 модулей work_matching (~1200 LOC), 2 Celery-таска (~600 LOC), ~8350 LOC тестов.

В ERP пока работают:
- 4 реальные сметы в DRAFT;
- 0 ContractEstimate, 0 MountingEstimate, 0 ТКП;
- весь downstream (contracts, proposals, marketing) с подключением к estimates, но без реальных записей.

Используют estimates как зависимость:
- `backend/contracts/` — ContractEstimate.create_from_estimate;
- `backend/proposals/` — ТКП из сметы;
- `backend/api_public/` — SpecificationItem, external_user estimates;
- `backend/marketing/` — Vacancy.attachment_estimate (MountingEstimate);
- `backend/payments/` — Invoice.estimate.

## 2. Стратегия

- **ERP не в продуктивной эксплуатации**, обратной совместимости не нужно (по решению руководителя).
- ISMeta создаётся параллельно, с собственной БД, собственным backend-контуром, собственным frontend'ом.
- `backend/estimates/` на первом этапе **замораживается** (no new features). После готовности ISMeta MVP — удаляется.
- Потребители estimates (contracts, proposals, marketing, api_public, payments) переключаются на новые API/webhook'и в момент cut-over.

## 3. Что переносим в ISMeta (с переписыванием под multi-tenant)

### 3.1 Модели

| Источник | Назначение в ISMeta | Ключевые изменения |
|---|---|---|
| `Estimate` | модель `Estimate` | добавить workspace_id, убрать ссылки на Object/LegalEntity/Counterparty (→ external_ref), убрать public_source/external_user (public handled отдельно) |
| `EstimateSection` | `EstimateSection` | workspace_id |
| `EstimateSubsection` | `EstimateSubsection` | workspace_id, опциональна в UI |
| `EstimateItem` | `EstimateItem` | workspace_id, `product_id`/`work_item_id` становятся VARCHAR (внешние id), добавить `row_id`, `source_item_id`, `version` (optimistic lock), `match_*` поля |
| `EstimateCharacteristic` | `EstimateCharacteristic` | workspace_id |
| `EstimateMarkupDefaults` | убрать как отдельную сущность, переехать в `Workspace.settings.default_markups` | |
| `ColumnConfigTemplate` | `ColumnConfigTemplate` | workspace_id |
| `Project`, `ProjectFile`, `ProjectNote`, `ProjectFileType` | **НЕ переносим** | остаются в ERP как часть проектной документации |
| `MountingEstimate` | **НЕ переносим** | остаётся в ERP |
| `SpecificationItem` | **НЕ переносим** | возвращается сервисом распознавания как JSON, не таблица |

### 3.2 Сервисы

| Источник | Назначение в ISMeta | Изменения |
|---|---|---|
| `services/markup_service.py` | `ismeta/backend/estimate/services/markup_service.py` | минимальные — адаптация под новые FK и workspace_id |
| `services/estimate_excel_exporter.py` | `estimate/services/excel_exporter.py` | подключение к новой xlsx-схеме (см. `05-excel-schema.md`): добавить row_id, row_hash, meta-лист |
| `services/estimate_import_service.py` | `estimate/services/excel_importer.py` | **полностью переписать**: теперь это не "загрузил → создал смету", а "загрузил файл → распарсил → diff → превью → применение"; PDF-логику выносим в сервис распознавания |
| `services/specification_transformer.py` | `estimate/services/specification_importer.py` | принимает JSON от сервиса распознавания и создаёт Estimate + Section + Item |
| `services/ditto_resolver.py` | переносим как есть | |
| `services/redis_session.py` | `ismeta/backend/common/redis_session.py` | общая утилита |
| `services/work_matching/pipeline.py` | `estimate/matching/pipeline.py` | ссылки на внешний ERP API вместо локальных таблиц catalog/pricelists |
| `services/work_matching/tiers.py` | `estimate/matching/tiers.py` | Tier 2 (PriceList) и Tier 4 (Category) теперь делают live-запросы к ERP; Tier 5 (Fuzzy) работает по live WorkItem (238 строк); Tier 6-7 (LLM/Web) — перекладываются на новый агент в `ismeta/backend/agent/` |
| `services/work_matching/knowledge.py` | `estimate/knowledge/service.py` | `.md`-пути теперь per-workspace |
| `services/work_matching/man_hours.py` | `estimate/matching/man_hours.py` | без изменений |
| `services/work_matching/service.py` | `estimate/matching/service.py` | Redis-ключи с префиксом workspace |
| `services/estimate_auto_matcher.py` | `estimate/matching/material_matcher.py` | переезд на live ERP API; убрать локальные SupplierProduct.base_price (заменить на catalog API call) |

### 3.3 Views / API

Вся структура views переписывается под DRF в ISMeta с учётом новых URL'ов (см. `02-api-contracts.md`). **Прямой перенос невозможен** — структура API меняется (новые ресурсы, новые auth, новая пагинация). Зато логика внутри — почти та же.

### 3.4 Celery-таски

| Источник | Назначение в ISMeta | Изменения |
|---|---|---|
| `tasks.process_estimate_pdf_pages` | **НЕ переносим** | PDF-парсинг уезжает в сервис распознавания |
| `tasks.create_import_session` | `estimate/tasks/import.py` | под новую xlsx-схему |
| `tasks_work_matching.process_work_matching` | `estimate/matching/tasks.py` | с изоляцией по workspace (отдельная очередь `matching-ws-{slug}`) |
| `tasks_work_matching.recover_stuck_work_matching` | переносим как есть | |
| `tasks_work_matching.sync_knowledge_md_task` | `estimate/knowledge/tasks.py` | путь per-workspace |

### 3.5 Миграции БД

**Не переносим ни одну.** ISMeta стартует с пустой БД. Начальная миграция — полный snapshot новых моделей.

## 4. Что переносим в фронтенд (с рефакторингом)

| Источник (`frontend/`) | Назначение (`ismeta/frontend/`) | Изменения |
|---|---|---|
| `components/erp/components/estimates/estimate-detail/*` | `components/estimate-detail/*` | убрать зависимости на Contracts, Object detail, Supply из этого модуля (если есть) |
| `components/erp/components/estimates/items-editor/*` | `components/items-editor/*` | перевести на новый API (новые URL), optimistic locking headers |
| `components/erp/components/estimates/work-matching/*` | `components/work-matching/*` | подключить к новому endpoint'у `/api/v1/estimates/{id}/match-works` |
| `components/erp/components/estimates/Estimates.tsx` | `app/estimates/page.tsx` | Next.js app-роут |
| `EstimateImportDialog.tsx` (827 строк) | разделить на ImportFromRecognition, ImportFromExcel | убрать PDF-парсинг (теперь в сервисе распознавания) |
| `AutoMatchDialog.tsx`, `ColumnConfigDialog.tsx` | переносим | |
| `MountingEstimates.tsx`, `MountingEstimateDetail.tsx` | **НЕ переносим** | остаются в ERP |
| `ProjectDetail.tsx`, `Projects.tsx` | **НЕ переносим** | остаются в ERP |
| `lib/api/services/estimates.ts` | `lib/api/services/estimates.ts` | новые URL, cursor-пагинация, Idempotency-Key |
| `lib/api/types/estimates.ts` | `lib/api/types/estimates.ts` | новые поля (row_id, source_item_id, match_*), UUID вместо int |
| `lib/api/estimate-api-context.tsx` | `lib/api/estimate-api-context.tsx` | уже подготовлен как injection point — переносится почти как есть |

### 4.1 Виджет

После стабилизации standalone-фронта создаётся пакет `@ismeta/widget`:
- пересобирает те же компоненты, но без Next.js роутинга (только React);
- принимает API-клиент через `EstimateApiProvider`;
- bundling — tsup или rollup.

## 5. Что НЕ переносим (остаётся в ERP)

- `Project`, `ProjectFile`, `ProjectFileType`, `ProjectNote` — проектная документация.
- `MountingEstimate` — монтажная смета, нужна маркетингу и исполнителям.
- `SpecificationItem`, `EstimateRequest`, `EstimateRequestFile`, `ExternalUser` — публичный портал уезжает в ISMeta как «публичный режим», а не эти таблицы.
- `EstimatePurchaseLink`, `ContractEstimate*`, `Act`, `ContractAmendment` — вся договорная обвязка.
- Любые views, связанные с этими сущностями.

## 6. Что меняем в оставшемся ERP

### 6.1 Переключение потребителей с estimates на API ISMeta

Эти модули в текущем ERP импортируют из `estimates.models`:

| Модуль | Что использует | Как переводим |
|---|---|---|
| `contracts` | `Estimate`, `EstimateItem`, `EstimateSection` в `ContractEstimate.create_from_estimate` | Заменяем метод: теперь он принимает `snapshot: dict` из ISMeta, не Django-модель |
| `proposals` | `Estimate.sections`, `Estimate.items` в ТКП | Тоже на snapshot |
| `marketing` | `MountingEstimate` (остаётся), но `MountingEstimate` получает данные из `ContractEstimate` | Переключение на ContractEstimate как источник |
| `api_public` | `Estimate` для external_user | Полностью выпиливаем: публичный режим теперь в ISMeta |
| `payments` | `Invoice.estimate` FK | Тип FK меняется на VARCHAR(64), хранит ismeta_estimate_version_id |

### 6.2 Новые endpoints в ERP

Из `02-api-contracts.md §2, 4`:
- `POST /api/v1/ismeta/snapshots/` — приём снимка сметы.
- `POST /api/erp-auth/v1/ismeta/issue-jwt` — JWT для виджета.
- `GET /api/erp-catalog/v1/...` — каталог и прайсы наружу.
- `GET /api/erp-catalog/v1/events?since_event_id=...` — polling fallback.

### 6.3 Outbox pattern

Создать `erp.outbox` таблицу и фоновый воркер, отправляющий webhook'и в ISMeta (см. `03-webhook-events.md §4`).

### 6.4 Сервис распознавания

Выделить `backend/llm_services/services/specification_parser.py` в новое Django-приложение `backend/recognition/` с API (см. `02-api-contracts.md §5`).

## 7. План этапов

### 7.1 Pre-migration

1. Заморозить `backend/estimates/` — код-ревью блокирует новые фичи, только баги и блокеры.
2. Создать `ismeta/backend/` и `ismeta/frontend/` скелеты.
3. Настроить отдельную БД и dev-стек (см. `09-dev-setup.md`).

### 7.2 Параллельная разработка ISMeta MVP (этап 1 CONCEPT.md)

Пока `estimates/` заморожен, мы строим ISMeta с нуля, используя переносимый код через копи-паст с адаптацией (не через git history — история не переносится, это новый проект).

### 7.3 Cut-over

Одномоментно:
1. Остановить ERP-модуль estimates (удалить URL'ы, frontend-роуты).
2. Развернуть ISMeta на проде.
3. Подключить webhook-канал ERP → ISMeta.
4. Переключить contracts/proposals/api_public/payments/marketing на работу через ISMeta API.
5. Удалить `backend/estimates/`, `frontend/components/erp/components/estimates/`, все связанные миграции оставить как историю.

### 7.4 Post-cut-over

- Мониторим логи на предмет попыток обращения к старым URL'ам.
- Если что-то сломалось — возможен hotfix в ERP, но не откат (ERP не в проде — допустим сломать).

## 8. Что делать с 4 существующими сметами в проде

Они остаются как исторические записи в ERP до cut-over. После cut-over:
- либо они удаляются через админку;
- либо переносятся скриптом в ISMeta с присвоением Workspace и новых UUID (решение — по состоянию сметчика).

По умолчанию — удаляем (они DRAFT, ничего ценного не содержат).

## 9. Риски миграции

| Риск | Митигация |
|---|---|
| В estimates остались тонкие зависимости от Object/LegalEntity, о которых не вспомнили | План cut-over предполагает integration-tests перед переключением |
| Frontend переиспользует компоненты estimates в других модулях ERP | Grep на импорты; предупредить команду ERP заранее |
| Подбор работ в ISMeta окажется медленнее из-за live-API | Бенчмарк на golden-set в конце этапа 1; при проблемах вводим кеш WorkItem |
| Рефакторинг под multi-tenant вскроет баги в логике markup/version | Обязательный двух-workspace test (early-test mode) |
| Celery-очереди конфликтуют (общий Redis у ERP и ISMeta) | Префикс ключей и отдельные vhost'ы |

## 10. Чек-лист cut-over

- [ ] ISMeta проходит все golden-set тесты.
- [ ] ISMeta прошла двух-workspace isolation test.
- [ ] Endpoints ERP (snapshot receiver, catalog API, JWT issuer, outbox) в проде.
- [ ] Сервис распознавания выделен и стабилен.
- [ ] Frontend ERP модули estimates удалены, роуты редиректят на ISMeta.
- [ ] Contracts.create_from_estimate переписан под snapshot.
- [ ] Proposals.create_tkp переписан под snapshot.
- [ ] Payments.Invoice.estimate перемигрирован.
- [ ] Документация dev/user/admin обновлена.
- [ ] Команда прошла training по новому процессу.
