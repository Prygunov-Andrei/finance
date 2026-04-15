# Runbook: Data Corruption

**Severity:** P0
**Expected frequency:** very rare

## Симптомы

- Users report: «Мои данные изменились без моего действия».
- Audit log показывает действия, которых никто не делал.
- Математика сметы не сходится (sum != items).
- Foreign keys ссылаются на несуществующие rows.
- Duplicate rows там, где должны быть unique.

## Impact

- **Critical.** Integrity of customer data в question.
- Юридический risk (152-ФЗ — incident должен быть reported).
- Finansовый risk (смета с неверными ценами → убыток).
- Reputational risk.

## Первые 5 минут

1. **Declare P0.**
2. **Pause writes:**
   ```bash
   # Option A: API maintenance mode
   # Option B: DB read-only
   psql -U postgres -c "ALTER DATABASE ismeta SET default_transaction_read_only = on"
   ```
3. **Assess scope:** одна смета, один workspace, или system-wide?
4. **Stop clock:** нужно понять, как long corruption was happening.

## Диагностика

### Scope

```sql
-- Check для obvious corruption
-- 1. Orphaned estimate_items (no estimate)
SELECT count(*) FROM estimate_item ei
LEFT JOIN estimate e ON ei.estimate_id = e.id
WHERE e.id IS NULL;

-- 2. Workspace_id mismatch
SELECT count(*) FROM estimate_item ei
JOIN estimate e ON ei.estimate_id = e.id
WHERE ei.workspace_id != e.workspace_id;

-- 3. Sum integrity
SELECT estimate_id,
  SUM(material_unit_price * quantity) AS calculated,
  MAX(total_materials_purchase) AS stored
FROM estimate_item
GROUP BY estimate_id
HAVING ABS(SUM(material_unit_price * quantity) - MAX(total_materials_purchase)) > 1;
```

### Timing

```sql
-- Когда были подозрительные изменения
SELECT * FROM audit_log
WHERE created_at > (now() - interval '7 days')
ORDER BY created_at DESC
LIMIT 100;

-- Аномальные patterns
SELECT user_id, action, count(*)
FROM audit_log
WHERE created_at > (now() - interval '7 days')
GROUP BY 1, 2
ORDER BY 3 DESC
LIMIT 20;
```

### Root cause candidates

- **Bad migration** — change recent, что-то сломал.
- **Buggy code** — недавний deploy.
- **Manual SQL** — someone ran direct query (check SSH logs).
- **Malicious actor** — см. `secret-compromised.md`.
- **Hardware** — disk errors (check dmesg).

## Варианты решения

### Case 1: Bad migration (recent)

1. Identify — какая migration вызвала проблему.
2. Rollback migration (reverse_code).
3. Restore affected data from backup (if needed).
4. Redeploy без bad migration.
5. Фикс migration → test → re-deploy.

### Case 2: Buggy code

1. Identify — какой endpoint / сервис повредил data.
2. Rollback code to pre-bug version.
3. Restore data from backup для affected rows.
4. Fix bug.
5. Regression test.
6. Re-deploy.

### Case 3: Manual SQL ошибка

1. **Если action identified и known:**
   - PITR до момента before action.
   - Selective restore только affected tables.
2. **Если unknown:**
   - Full forensic review.
   - Possibly full restore.

### Case 4: Malicious / compromise

- См. `secret-compromised.md`.
- Plus this runbook для data recovery.
- Legal involvement.

---

## Data recovery procedures

### Partial restore (specific rows)

```bash
# 1. Get backup из S3
wal-g backup-fetch /tmp/restore LATEST

# 2. PITR до момента before corruption
# (edit postgresql.conf on restore instance)

# 3. Extract только affected tables
pg_dump -U postgres --data-only \
  --table=estimate --table=estimate_item \
  -h restore-host ismeta > /tmp/clean-data.sql

# 4. На production:
# Review carefully!
# 4a. Delete affected rows
psql -U ismeta -c "DELETE FROM estimate_item WHERE id IN (...)"

# 4b. Re-import
psql -U ismeta < /tmp/clean-data.sql
```

### Full restore

См. [`db-down.md`](./db-down.md) §Full restore.

---

## Юридические действия

### 152-ФЗ

- **Corruption touches ПДн?** Yes → Роскомнадзор за 24 часа.
- **Document:**
  - Timeline.
  - Scope.
  - Measures taken.
  - Preventive measures.

### Customer notification

Обязательно при:
- Loss / unauthorized change of customer data.
- Integrity не гарантирована для time period.

Template:

```
Уважаемый клиент,

С ЧЧ:ММ по ЧЧ:ММ ГГГГ-ММ-ДД мы обнаружили проблему с целостностью данных,
которая могла затронуть ваши сметы за этот период.

Что мы сделали:
- Восстановили данные из backup (RPO {X} минут).
- Проверили integrity всех смет.
- Зафиксировали root cause: {short explanation}.

Что вам стоит проверить:
- [Specific list]

Если вы обнаружите расхождения — сразу свяжитесь с поддержкой.

Приносим извинения.
```

---

## Verification после recovery

### Data integrity checks

```sql
-- Все references валидны
SELECT 'estimate_item' AS tbl, count(*) AS orphans FROM estimate_item ei
LEFT JOIN estimate e ON ei.estimate_id = e.id
WHERE e.id IS NULL
UNION ALL
SELECT 'estimate_section', count(*) FROM estimate_section es
LEFT JOIN estimate e ON es.estimate_id = e.id
WHERE e.id IS NULL;
-- Ожидаем: 0 orphans.

-- Workspace consistency
-- (см. queries выше)

-- Audit trail logical
-- (no impossible transitions)
```

### Application checks

- Random sample estimates — открыть в UI, проверить.
- Reports — sum matches items?
- Exports — PDF generated correctly?

---

## Post-mortem обязательно

- Полный postmortem в 72 часа.
- Root cause на глубоком уровне.
- Systemic prevention.
- External communication (Роскомнадзор, клиенты).

---

## Prevention

- Database constraints (foreign keys, check constraints).
- Immutable audit log (append-only, cannot be deleted).
- Regular data integrity checks (ночью):
  ```sql
  -- Automated check в Celery task
  -- Fail → alert
  ```
- Limited direct DB access (only DevOps, MFA).
- Code review для всех data-modifying operations.
- Regression tests для math (sum = items).

## Связанные

- [`db-down.md`](./db-down.md) — full restore.
- [`secret-compromised.md`](./secret-compromised.md) — if security.
- [`../DR-PLAN.md`](../DR-PLAN.md) — backup strategy.
- [`../COMPLIANCE-MATRIX.md`](../COMPLIANCE-MATRIX.md) — legal.
