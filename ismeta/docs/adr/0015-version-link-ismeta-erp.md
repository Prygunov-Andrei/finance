# ADR-0015. VersionLink — явная таблица связи версий ISMeta ↔ ContractEstimate ERP

- **Статус:** Accepted
- **Дата:** 2026-04-15
- **Источник:** архитектурное ревью, пункт A2.

## Контекст

Отсутствие явной таблицы связей версий приводит к drift между ISMeta и ERP.

ISMeta хранит `Estimate.transmitted_contract_id`, а ERP хранит `ContractEstimate.source_estimate`. Но:
- при `contract.terminated` ISMeta снимает пометку, а ContractEstimate в ERP остаётся живым → rogue state;
- если сметчик в ERP создал 3 ContractAmendment, а в ISMeta одна версия — маппинг теряется;
- при ретрайе `POST /snapshots/` с новым idempotency_key — в ERP могут появиться две записи;
- через год никто не вспомнит, какая ISMeta-версия была основой какой ContractEstimate.

## Решение

Вводим таблицу `VersionLink` в БД ISMeta + зеркально в БД ERP (`ismeta.version_link` схема). Обе стороны обновляют свою копию по webhook'ам, ежедневная reconciliation проверяет дрифт.

## Схема таблицы (в БД ISMeta)

| Поле | Тип | Описание |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | multi-tenancy |
| ismeta_estimate_id | UUID | FK Estimate (группирующая сущность) |
| ismeta_version_id | UUID | конкретная версия Estimate (= ismeta_estimate_id этой версии) |
| ismeta_version_number | INT | для удобства отладки |
| erp_contract_id | VARCHAR(64) | nullable до `contract.signed` |
| erp_contract_estimate_id | VARCHAR(64) | nullable до принятия ERP |
| erp_contract_estimate_version | INT | версия ContractEstimate в ERP |
| relation_type | VARCHAR(16) | ENUM: 'new_contract' \| 'amendment' \| 'replacement' |
| status | VARCHAR(16) | 'pending' \| 'linked' \| 'terminated' \| 'orphaned' |
| transmitted_at | TIMESTAMPTZ | когда отправили snapshot |
| linked_at | TIMESTAMPTZ | когда пришёл `contract.signed` |
| terminated_at | TIMESTAMPTZ | при `contract.terminated` |
| created_at, updated_at | TIMESTAMPTZ | |

UNIQUE (workspace_id, ismeta_version_id). INDEX (erp_contract_id), INDEX (erp_contract_estimate_id).

## Жизненный цикл

```
1. Сметчик нажимает «Отдать в ERP» (для version v_n).
   → VersionLink(ismeta_version_id=v_n, status='pending', transmitted_at=NOW).

2. Snapshot отправлен в ERP. ERP создаёт черновик ContractEstimate.
   ERP обновляет свою ismeta.version_link зеркально.

3. ERP-пользователь решает, что это (новый договор / ДОП / замена).
   → ERP создаёт Contract (или привязывает к существующему),
     создаёт ContractEstimate, подписывает его.
   → отправляет webhook contract.signed к ISMeta.

4. ISMeta получает contract.signed:
   → VersionLink.erp_contract_id = …, erp_contract_estimate_id = …
   → VersionLink.relation_type = 'new_contract' | 'amendment' | 'replacement'
   → VersionLink.status = 'linked'
   → VersionLink.linked_at = NOW.
   → Estimate.transmitted_contract_id = … (для быстрого отображения в UI)

5. При contract.terminated:
   → VersionLink.status = 'terminated', terminated_at = NOW.
   → Estimate.transmitted_contract_id остаётся (для истории),
     но read-only снимается.

6. При долгом висении pending (> 7 дней) без ответа:
   → VersionLink.status = 'orphaned'.
   → Алерт в #ismeta-alerts.
```

## Reconciliation (ежедневно)

Celery-task `reconcile_version_links` (ночью):
1. ISMeta спрашивает ERP: «дай мне все ismeta.version_link, созданные за последние 30 дней».
2. Сравнивает с локальной таблицей `VersionLink`.
3. Различия пишет в `VersionLinkDrift` — для ручного разбора.
4. Критические расхождения (ERP забыл уведомить ISMeta при `contract.signed`) — алерт в `#ismeta-alerts`.

## Последствия

- **Плюс:** явная связь, видимая в обоих системах; drift ловится быстро; orphaned transmissions не теряются.
- **Плюс:** для reporting (сколько смет перешло в договоры, средний срок от передачи до подписи) — ready-made.
- **Минус:** дублирование таблицы в двух БД. Риск рассинхрона — закрывается reconciliation'ом.
- **Минус:** миграция существующих `transmitted_contract_id` в `VersionLink` — разовая задача.

## Связанные документы

- [`../../specs/01-data-model.md`](../../specs/01-data-model.md) — схема таблицы.
- [`../../specs/03-webhook-events.md`](../../specs/03-webhook-events.md) — события `contract.signed`, `contract.terminated`.
- [`../../specs/07-mvp-acceptance.md`](../../specs/07-mvp-acceptance.md) — новый acceptance-пункт: reconciliation проходит в CI.
- [ADR-0007](./0007-readonly-after-transmission.md) — базовая семантика.
- [ADR-0014](./0014-no-contract-creation-from-ismeta.md) — ISMeta не создаёт ContractEstimate.
