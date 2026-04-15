# 01. Модель данных ISMeta

**Версия:** 0.1. **Назначение:** полная схема таблиц собственной БД ISMeta, поля, связи, ограничения.

## 1. Обзор

БД — PostgreSQL 14+. Отдельный экземпляр, не общий с ERP. Все таблицы содержат `workspace_id UUID NOT NULL` и имеют составной индекс `(workspace_id, ...)`.

Общие соглашения:
- первичный ключ — `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, кроме случаев, где явно указан составной PK;
- временные метки — `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` и `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` на всех «мутируемых» таблицах;
- мягкое удаление — поле `deleted_at TIMESTAMPTZ NULL` на смётных сущностях, никакого каскадного hard-delete;
- optimistic locking — поле `version INT NOT NULL DEFAULT 0` на `EstimateItem`, `EstimateSection`, `EstimateSubsection`, `Estimate`;
- `workspace_id` инкрементирует индекс: каждый FilterBackend в DRF обязан фильтровать по нему.

## 2. ER-диаграмма (текстовая)

```
                            ┌──────────────┐
                            │ Workspace    │
                            │ id (UUID PK) │
                            └──────┬───────┘
                                   │ 1
                                   │
                 ┌─────────────────┼────────────────────┐
                 │                 │                    │
                 ▼                 ▼                    ▼
         ┌──────────────┐  ┌──────────────┐    ┌───────────────────┐
         │WorkspaceMember│  │   Folder    │    │ ProductCache      │
         │ user_id      │  │ id, name    │    │ id (ext), name    │
         │ role         │  │ parent_id   │    │ ...last_synced_at │
         └──────────────┘  │ external_ref│    └───────────────────┘
                           └──────┬───────┘
                                  │ 0..1 (опционально)
                                  ▼
                           ┌──────────────┐
                           │  Estimate    │────────┐
                           │ id, name     │        │
                           │ version_no   │        │ N
                           │ parent_ver   │◀───────┘ (self)
                           │ status       │
                           │ source_file  │
                           └──────┬───────┘
                                  │ 1
                                  │
                ┌─────────────────┼─────────────────┬───────────────┐
                │                 │                 │               │
                ▼                 ▼                 ▼               ▼
        ┌──────────────┐ ┌────────────────┐ ┌─────────────────┐ ┌──────────┐
        │EstimateSection│ │EstimateCharacte│ │ EstimateMarkup  │ │ChatSession│
        │ sort_order   │ │ristic          │ │ Defaults         │ │ user_id  │
        │ markup_*     │ │ key, value     │ │ material_percent │ └────┬─────┘
        └──────┬───────┘ └────────────────┘ └─────────────────┘      │
               │                                                      │ 1:N
               │ 1:N                                                  ▼
               ▼                                              ┌─────────────┐
        ┌────────────────┐                                   │ ChatMessage │
        │EstimateSubsect.│◀─── опционально                  │ role, cost  │
        │ sort_order     │                                   └─────────────┘
        └──────┬─────────┘
               │ 0..1
               ▼
        ┌──────────────┐
        │ EstimateItem │──────── source_item_id (на предыдущую версию)
        │ row_id UUID  │
        │ name, qty    │
        │ product_id   │──────── FK на ProductCache (nullable)
        │ work_item_id │──────── внешний id, нет локальной таблицы WorkItem
        │ markup_*     │
        │ version INT  │ (optimistic lock)
        └──────────────┘

Прочие таблицы (не иерархические):
    ProductKnowledge  — правила подбора, md-синхронизация
    ProductWorkMapping— история сопоставлений
    AgentContext      — память LLM-агента по смете
    AuditLog          — журнал всех изменений
    ImportSession     — сессии Excel-импорта и распознавания
    ProcessedEvents   — idempotency для webhook'ов
    LLMUsage          — учёт токенов
    SnapshotTransmission — отслеживание отдачи в ERP
```

## 3. Таблицы тенанта

### 3.1 Workspace

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| name | VARCHAR(255) | NOT NULL |
| slug | VARCHAR(64) | UNIQUE, NOT NULL |
| settings | JSONB | DEFAULT '{}', содержит `llm_provider_id`, `default_markup_*`, feature flags |
| status | VARCHAR(16) | ENUM('active','suspended','archived'), DEFAULT 'active' |
| created_at, updated_at | TIMESTAMPTZ | |

### 3.2 WorkspaceMember

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | FK Workspace, NOT NULL |
| user_id | VARCHAR(64) | ID пользователя в ERP или в standalone; NOT NULL |
| role | VARCHAR(16) | ENUM('admin','estimator','viewer','api'), NOT NULL |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | |

UNIQUE (workspace_id, user_id).

## 4. Иерархия смет

### 4.1 Folder

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | FK Workspace, NOT NULL |
| name | VARCHAR(255) | NOT NULL |
| parent_id | UUID | FK Folder (self), nullable для root |
| external_ref | JSONB | nullable; `{"system":"erp_august","object_id":123,"object_name":"..."}` |
| sort_order | INT | DEFAULT 0 |
| deleted_at | TIMESTAMPTZ | nullable |
| created_at, updated_at | TIMESTAMPTZ | |

INDEX (workspace_id, parent_id, sort_order).

### 4.2 Estimate

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | NOT NULL |
| folder_id | UUID | FK Folder, nullable (root-level сметы) |
| name | VARCHAR(512) | NOT NULL |
| number | VARCHAR(64) | nullable, уникум в рамках workspace |
| status | VARCHAR(16) | ENUM('draft','in_progress','review','ready','transmitted','archived') |
| parent_version_id | UUID | FK Estimate, nullable — предыдущая версия |
| version_number | INT | NOT NULL DEFAULT 1 |
| currency | VARCHAR(3) | DEFAULT 'RUB' |
| usd_rate, eur_rate, cny_rate | DECIMAL(12,4) | nullable, устанавливаются либо webhook'ом из ERP, либо вручную |
| default_material_markup | JSONB | `{"type":"percent","value":30}` |
| default_work_markup | JSONB | `{"type":"percent","value":300}` |
| price_list_id | VARCHAR(64) | внешний id PriceList в ERP, nullable |
| source_file | TEXT | путь в S3/FS к загруженному исходнику (Excel/PDF) |
| source_recognition_id | UUID | id сессии распознавания, nullable |
| created_by | VARCHAR(64) | user_id |
| transmitted_at | TIMESTAMPTZ | когда отдана в ERP |
| transmitted_contract_id | VARCHAR(64) | id договора в ERP после webhook contract.signed |
| version | INT | optimistic lock |
| deleted_at | TIMESTAMPTZ | |
| created_at, updated_at | TIMESTAMPTZ | |

INDEX (workspace_id, folder_id, status). UNIQUE (workspace_id, number) если number не NULL.

#### 4.2.1 Жизненный цикл статусов Estimate

```
draft ─► in_progress ─► review ─► ready ─► transmitted ─► archived
  ▲           ▲           ▲          │
  └───────────┴───────────┴──────────┘  (возврат при правках/отмене согласования)
                                         
  archived   — терминальный, редактирование запрещено.
  transmitted — read-only (после webhook contract.signed из ERP).
```

Переходы enforcement'ятся в сервис-слое. Ограничения:
- в `transmitted` — ни одной мутации содержимого, только создание новой версии;
- в `archived` — никаких мутаций, включая создание новой версии.

### 4.3 EstimateSection

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| estimate_id | UUID | FK Estimate, NOT NULL |
| parent_version_section_id | UUID | ссылка на секцию в родительской версии |
| name | VARCHAR(512) | |
| sort_order | INT | |
| material_markup | JSONB | nullable — переопределяет estimate-level |
| work_markup | JSONB | nullable |
| version | INT | optimistic lock |
| deleted_at | TIMESTAMPTZ | |

INDEX (workspace_id, estimate_id, sort_order).

### 4.4 EstimateSubsection

Аналогично EstimateSection, с `section_id FK` и сохранением для будущего. В MVP-UI скрыта за флагом.

### 4.5 EstimateItem

Самая большая и часто читаемая таблица.

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| estimate_id | UUID | FK, NOT NULL |
| section_id | UUID | FK, NOT NULL |
| subsection_id | UUID | FK, nullable |
| row_id | UUID | NOT NULL DEFAULT gen_random_uuid() — стабильный ID для Excel-цикла |
| source_item_id | UUID | FK на EstimateItem предыдущей версии, nullable |
| sort_order | INT | |
| original_name | VARCHAR(1000) | имя из исходной спецификации |
| name | VARCHAR(1000) | текущее (может быть правкой сметчика) |
| model_name | VARCHAR(255) | nullable |
| brand | VARCHAR(255) | nullable |
| unit | VARCHAR(32) | |
| quantity | DECIMAL(18,4) | |
| material_unit_price | DECIMAL(18,4) | закупочная |
| work_unit_price | DECIMAL(18,4) | закупочная |
| material_markup | JSONB | nullable, переопределяет секционное |
| work_markup | JSONB | nullable |
| product_id | VARCHAR(64) | внешний id Product в ERP, nullable |
| work_item_id | VARCHAR(64) | внешний id WorkItem в ERP, nullable |
| supplier_product_id | VARCHAR(64) | nullable |
| match_source | VARCHAR(32) | ENUM('default','history','pricelist','knowledge','category','fuzzy','llm','web','manual','unmatched') |
| match_confidence | DECIMAL(3,2) | 0.00..1.00 |
| match_reasoning | TEXT | обоснование, опционально сохраняется из LLM |
| is_analog | BOOLEAN | DEFAULT false |
| analog_reason | TEXT | nullable |
| tech_specs | JSONB | {flow, power, voltage, ...} |
| custom_data | JSONB | пользовательские столбцы |
| is_deleted | BOOLEAN | DEFAULT false — soft delete в рамках Excel-цикла |
| version | INT | optimistic lock |
| created_at, updated_at | TIMESTAMPTZ | |

INDEX (workspace_id, estimate_id, section_id, sort_order).
INDEX (workspace_id, product_id).
INDEX (workspace_id, work_item_id).
INDEX (row_id) — частый lookup при Excel-импорте.

### 4.6 EstimateCharacteristic

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| estimate_id | UUID | FK |
| key | VARCHAR(128) | |
| label | VARCHAR(255) | |
| value_text | TEXT | |
| value_type | VARCHAR(16) | ENUM('text','decimal','date','bool') |
| is_auto_calculated | BOOLEAN | |
| sort_order | INT | |

## 5. База знаний

### 5.1 ProductKnowledge

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| item_name_pattern | VARCHAR(500) | нормализованное имя, ключ поиска |
| work_item_id | VARCHAR(64) | внешний id |
| work_section_code | VARCHAR(64) | nullable |
| status | VARCHAR(16) | ENUM('pending','verified','rejected') |
| source | VARCHAR(32) | 'llm','web','manual','fuzzy','category' |
| confidence | DECIMAL(3,2) | |
| llm_reasoning | TEXT | |
| web_search_query | TEXT | |
| usage_count | INT | DEFAULT 0 |
| last_used_at | TIMESTAMPTZ | |
| verified_by | VARCHAR(64) | user_id |
| verified_at | TIMESTAMPTZ | |
| md_file_path | VARCHAR(500) | относительный путь в `data/knowledge/workspaces/{workspace_id}/products/*.md` |
| created_at, updated_at | TIMESTAMPTZ | |

INDEX (workspace_id, item_name_pattern, status).

### 5.2 ProductWorkMapping

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| product_id | VARCHAR(64) | внешний id |
| work_item_id | VARCHAR(64) | |
| source | VARCHAR(16) | ENUM('MANUAL','AUTO') |
| confidence | DECIMAL(3,2) | |
| usage_count | INT | DEFAULT 0 |
| last_used_at | TIMESTAMPTZ | |

UNIQUE (workspace_id, product_id, work_item_id).

## 6. Кеш справочников

### 6.1 ProductCache

Минимальные поля из ERP для offline-work и autocomplete.

| Поле | Тип | Ограничения |
|---|---|---|
| id | VARCHAR(64) | PK — внешний id Product в ERP |
| workspace_id | UUID | |
| name | VARCHAR(1000) | |
| normalized_name | VARCHAR(1000) | |
| unit | VARCHAR(32) | |
| category_id | VARCHAR(64) | nullable |
| default_price | DECIMAL(18,4) | nullable |
| status | VARCHAR(16) | 'new','verified','merged','archived' |
| last_synced_at | TIMESTAMPTZ | из ERP |
| cached_at | TIMESTAMPTZ | когда записали в ISMeta |

INDEX (workspace_id, normalized_name).

WorkItem **не кешируется** (см. CONCEPT §4.3) — запрашивается live при каждом подборе.

## 7. LLM-агент

### 7.1 ChatSession

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| estimate_id | UUID | FK, NOT NULL |
| user_id | VARCHAR(64) | |
| created_at | TIMESTAMPTZ | |
| last_message_at | TIMESTAMPTZ | |
| closed_at | TIMESTAMPTZ | nullable |

INDEX (workspace_id, estimate_id, last_message_at DESC).

### 7.2 ChatMessage

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| session_id | UUID | FK, NOT NULL |
| role | VARCHAR(16) | 'user','assistant','tool','system' |
| content | TEXT | |
| tool_calls | JSONB | nullable, массив [{name, args, result}] |
| model | VARCHAR(64) | |
| tokens_in | INT | |
| tokens_out | INT | |
| cost_usd | DECIMAL(10,6) | |
| created_at | TIMESTAMPTZ | |

### 7.3 AgentContext

Память на уровне сметы, а не сессии — см. CONCEPT §4.4.

| Поле | Тип | Ограничения |
|---|---|---|
| workspace_id | UUID | part of PK |
| estimate_id | UUID | part of PK |
| key | VARCHAR(128) | part of PK — `last_messages`, `notes`, `preferences` |
| value | JSONB | |
| updated_at | TIMESTAMPTZ | |

## 8. Операционные таблицы

### 8.1 AuditLog

Срок хранения — 1 год для типовых записей. Удаление старых записей — фоновая задача, раз в сутки.

**Исключения с повышенным retention'ом (5 лет):**
- записи с `source = 'instance_admin'`;
- записи с `action in ('transmit','restore')` (передача в ERP, восстановление после отката).

Перед удалением — экспорт в холодное хранилище (S3 CSV), см. [`11-metrics.md §7`](./11-metrics.md).

| Поле | Тип | Ограничения |
|---|---|---|
| id | BIGSERIAL | PK — быстрый inсert |
| workspace_id | UUID | |
| user_id | VARCHAR(64) | nullable (системные события) |
| entity_type | VARCHAR(32) | 'estimate','section','item','markup','knowledge', etc. |
| entity_id | UUID | |
| action | VARCHAR(16) | 'create','update','delete','transmit','restore' |
| old_value | JSONB | nullable |
| new_value | JSONB | nullable |
| source | VARCHAR(16) | 'ui','api','agent','import','webhook' |
| created_at | TIMESTAMPTZ | |

INDEX (workspace_id, entity_type, entity_id, created_at DESC).

### 8.2 ImportSession

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| estimate_id | UUID | nullable (может быть ещё не создана) |
| source_type | VARCHAR(32) | 'recognition','excel','csv','manual' |
| external_ref | VARCHAR(64) | id в сервисе распознавания |
| status | VARCHAR(16) | 'pending','processing','done','error','cancelled' |
| rows_total | INT | |
| rows_processed | INT | |
| error_message | TEXT | |
| created_at | TIMESTAMPTZ | |
| finished_at | TIMESTAMPTZ | |

### 8.3 ProcessedEvents

Идемпотентность webhook'ов. TTL 14 дней, чистится фоновой задачей.

| Поле | Тип | Ограничения |
|---|---|---|
| event_id | VARCHAR(64) | PK — внешний id события |
| workspace_id | UUID | nullable для глобальных событий |
| event_type | VARCHAR(64) | |
| processed_at | TIMESTAMPTZ | |

### 8.4 LLMUsage

| Поле | Тип | Ограничения |
|---|---|---|
| id | BIGSERIAL | PK |
| workspace_id | UUID | |
| estimate_id | UUID | nullable |
| user_id | VARCHAR(64) | nullable |
| task_type | VARCHAR(64) | 'work_matching_llm','work_matching_web','agent_chat','recognition',… |
| provider | VARCHAR(32) | 'openai','gemini','grok','gigachat','ollama' |
| model | VARCHAR(64) | |
| tokens_in | INT | |
| tokens_out | INT | |
| cost_usd | DECIMAL(10,6) | |
| request_id | VARCHAR(128) | id от провайдера |
| created_at | TIMESTAMPTZ | |

INDEX (workspace_id, created_at).

### 8.5 MatchingSessionStats

Статистика по каждому прогону подбора работ/материалов. Источник данных для дашборда метрик.

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| estimate_id | UUID | FK Estimate |
| session_type | VARCHAR(16) | 'work_matching' \| 'material_matching' |
| redis_session_id | VARCHAR(64) | для поиска live-состояния |
| started_by_user_id | VARCHAR(64) | |
| started_at | TIMESTAMPTZ | |
| finished_at | TIMESTAMPTZ | nullable при неуспехе |
| pass1_duration_ms | INT | nullable |
| pass2_duration_ms | INT | nullable |
| tier_counts | JSONB | `{"default": 10, "history": 15, "pricelist": 20, "knowledge": 32, "category": 8, "fuzzy": 12, "llm": 5, "web": 2, "unmatched": 3}` |
| items_total | INT | |
| applied_matches | INT | сколько сметчик принял |
| rejected_matches | INT | сколько отклонил |
| llm_cost_usd | DECIMAL(10,6) | суммарно |
| status | VARCHAR(16) | 'success' \| 'error' \| 'cancelled' |
| error_message | TEXT | nullable |

INDEX (workspace_id, started_at DESC), INDEX (estimate_id, started_at DESC).

### 8.6 VersionLink

Связь версии Estimate в ISMeta с ContractEstimate в ERP. См. [ADR-0015](../docs/adr/0015-version-link-ismeta-erp.md).

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| ismeta_estimate_id | UUID | базовый Estimate (группирующий для всех версий) |
| ismeta_version_id | UUID | конкретная версия (FK Estimate) |
| ismeta_version_number | INT | |
| erp_contract_id | VARCHAR(64) | nullable до подписания |
| erp_contract_estimate_id | VARCHAR(64) | nullable до принятия ERP |
| erp_contract_estimate_version | INT | nullable |
| relation_type | VARCHAR(16) | ENUM: 'new_contract' \| 'amendment' \| 'replacement' |
| status | VARCHAR(16) | ENUM: 'pending' \| 'linked' \| 'terminated' \| 'orphaned' |
| transmitted_at | TIMESTAMPTZ | |
| linked_at | TIMESTAMPTZ | nullable |
| terminated_at | TIMESTAMPTZ | nullable |
| last_reconciled_at | TIMESTAMPTZ | nullable |

UNIQUE (workspace_id, ismeta_version_id).
INDEX (erp_contract_id), INDEX (erp_contract_estimate_id), INDEX (workspace_id, status).

### 8.7 VersionLinkDrift

Обнаруженные расхождения между нашей `VersionLink` и зеркальной таблицей в ERP. Заполняется ежедневным reconciliation-task'ом.

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| version_link_id | UUID | FK VersionLink, nullable |
| drift_type | VARCHAR(32) | 'erp_missing', 'ismeta_missing', 'status_mismatch', 'linkage_conflict' |
| ismeta_snapshot | JSONB | состояние на нашей стороне |
| erp_snapshot | JSONB | состояние на стороне ERP |
| detected_at | TIMESTAMPTZ | |
| resolved_at | TIMESTAMPTZ | nullable |
| resolution_note | TEXT | |

### 8.8 ScheduledRateChange

Запланированные изменения ставок грейдов, пришедшие через `worker_grade.rate_changed` с `effective_from` в будущем. См. [`03-webhook-events.md §2.4`](./03-webhook-events.md).

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| price_list_id | VARCHAR(64) | |
| grade | INT | |
| old_rate | DECIMAL(12,2) | |
| new_rate | DECIMAL(12,2) | |
| effective_from | TIMESTAMPTZ | |
| applied_at | TIMESTAMPTZ | nullable, когда дата наступила и баннеры показались |
| event_id | VARCHAR(64) | id исходного webhook-события |

### 8.9 SnapshotTransmission

Отслеживание отдачи сметы в ERP. Нужна для идемпотентности retry.

| Поле | Тип | Ограничения |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | |
| estimate_id | UUID | |
| version_id | UUID | = estimate_id конкретной версии |
| idempotency_key | VARCHAR(64) | UNIQUE; `{workspace_id}:{version_id}:{attempt}` |
| erp_contract_estimate_id | VARCHAR(64) | заполняется после 200 OK |
| status | VARCHAR(16) | 'pending','in_flight','success','failed','abandoned' |
| attempts | INT | |
| last_error | TEXT | |
| last_attempt_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

## 8.10 Партиционирование (обязательно с первой миграции)

Три таблицы — кандидаты на рост до десятков и сотен миллионов строк. Партиционируем сразу, не откладывая «до проблемы».

### EstimateItem — hash partitioning по workspace_id

```sql
CREATE TABLE estimate_item (...) PARTITION BY HASH (workspace_id);
CREATE TABLE estimate_item_p0 PARTITION OF estimate_item
    FOR VALUES WITH (MODULUS 8, REMAINDER 0);
-- ... p1..p7
```

8 партиций — покрывает рост до SaaS с 100+ workspace. Каждая партиция имеет собственные индексы по `(estimate_id, is_deleted, sort_order)`.

### AuditLog, LLMUsage, MatchingSessionStats — range partitioning по created_at (monthly)

```sql
CREATE TABLE audit_log (...) PARTITION BY RANGE (created_at);
CREATE TABLE audit_log_y2026_m04 PARTITION OF audit_log
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- автосоздание будущих партиций через pg_partman (Celery beat-task раз в сутки).
```

- Retention реализуется через DETACH+DROP старых партиций (мгновенный cleanup, без `DELETE`).
- Читающие запросы фильтруются по `created_at >= date` → partition pruning.

### Автоматизация

Celery-beat task `maintain_partitions` раз в сутки:
- создаёт партиции на 3 месяца вперёд;
- архивирует партиции старше retention в S3 (см. [`11-metrics.md §7`](./11-metrics.md));
- дропает заархивированные.

## 9. Индексы и производительность

Критические индексы (дополнительно к перечисленным выше):
- `EstimateItem(workspace_id, estimate_id, is_deleted, sort_order)` — основной scan редактора;
- `EstimateItem(workspace_id, product_id)` — webhook `product.updated` для поиска всех затронутых строк;
- `EstimateItem(workspace_id, work_item_id)` — аналогично для `worker_grade.rate_changed`;
- `ProductKnowledge(workspace_id, item_name_pattern text_pattern_ops)` — fuzzy-поиск;
- `LLMUsage(workspace_id, created_at DESC)` — отчёты;
- `AuditLog(workspace_id, entity_type, entity_id, created_at DESC)` — история объекта.

## 10. Миграции

- Django migrations стандартно через `python manage.py makemigrations` + review.
- Каждая миграция с `RunPython` обязана иметь `reverse_code` (см. `13-release-process.md`).
- Data migrations отделены от schema migrations (разные файлы).
- Миграция `workspace_id` на существующие таблицы не нужна — стартуем с пустой БД.

## 11. Ожидаемые объёмы (прикидка для MVP)

Оценка на одного активного сметчика в год:
- Estimate: 50–200 с учётом версий → 500–2 000 записей;
- EstimateItem: 2 000–4 000 строк в смете × 200 версий ≈ 400 000–800 000 записей/год. Основной объём.
- AuditLog: 10–50 действий на смету в день × 250 рабочих дней ≈ 3 000–15 000 записей/год.
- LLMUsage: сопоставимо с числом запусков подбора, ~5 000–10 000/год.

Партиционирование и materialized views в MVP не нужны; вводятся при необходимости (см. приложение Г CONCEPT.md).
