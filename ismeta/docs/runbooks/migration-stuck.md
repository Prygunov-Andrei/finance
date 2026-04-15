# Runbook: Migration Stuck

**Severity:** P1
**Expected frequency:** редко

## Симптомы

- Deploy висит на migration step.
- `python manage.py migrate` не завершается более 10 минут.
- Database lock'и accumulate.
- API unavailable (maintenance mode).

## Impact

- **Service down** (если migration блокирующая).
- **Partial outage** (если можно rollback, но пока в процессе).

## Первые 5 минут

1. **Don't panic.** Миграции могут legitimately long (большие backfill).
2. **Check progress:**
   ```bash
   psql -U postgres -c "SELECT now() - pg_stat_activity.query_start AS duration, query, state
   FROM pg_stat_activity
   WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
   ORDER BY duration DESC;"
   ```
3. **Assess:** waiting on lock? Actively running? Deadlocked?

## Диагностика

### Running vs waiting

```sql
-- Active queries
SELECT pid, usename, state, wait_event_type, wait_event, query
FROM pg_stat_activity
WHERE state != 'idle';

-- Lock conflicts
SELECT blocked.pid AS blocked_pid,
       blocked.query AS blocked_query,
       blocking.pid AS blocking_pid,
       blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_locks blocked_locks ON blocked_locks.pid = blocked.pid AND NOT blocked_locks.granted
JOIN pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database = blocked_locks.database
  AND blocking_locks.relation = blocked_locks.relation
  AND blocking_locks.granted
JOIN pg_stat_activity blocking ON blocking.pid = blocking_locks.pid
WHERE blocked_locks.pid != blocking_locks.pid;
```

### Migration type

- **DDL (ALTER TABLE, CREATE INDEX):** блокирующая, осторожно.
- **Data (RunPython):** обычно non-blocking, может долго идти.
- **CONCURRENTLY:** non-blocking, но долго.

---

## Варианты решения

### Case 1: Legitimate long migration

**Actions:** wait.

- Check progress через `pg_stat_progress_create_index` (для CONCURRENTLY indexes).
- Check DB activity: idle? Working?

**Если пользователи ждут:**
- Communication: «Maintenance: ETA X minutes».

### Case 2: Lock conflict (другой процесс держит lock)

```sql
-- Identify blocking process
SELECT * FROM pg_stat_activity WHERE pid = <blocking_pid>;

-- If long-running user query — decide:
-- Option A: Wait for user query to finish.
-- Option B: Kill user query (careful!):
SELECT pg_terminate_backend(<blocking_pid>);
```

### Case 3: Deadlock

Postgres auto-detects и roll back один из. Rare.

Если migration в deadlock:
- Retry migration.

### Case 4: Migration fails halfway (RunPython)

**Problem:** RunPython не atomic. Some data обновлено, some — no.

```sql
-- Check migration state
SELECT * FROM django_migrations WHERE name = '<migration_name>';
-- If record есть — applied, но data не consistent.
```

**Recovery:**

1. Revert migration:
   ```bash
   python manage.py migrate <app> <previous_migration>
   ```
2. Fix data inconsistency (manual SQL или script).
3. Re-apply migration.
4. Verify.

### Case 5: Migration кукует forever (not progressing)

Signs:
- `pg_stat_progress_create_index.tuples_done` не растёт.
- DB CPU idle.
- No logs.

**Actions:**

1. `Ctrl+C` migration command.
2. Check — applied partially? Full rollback?
3. Decision:
   - **If blocking schema change:** rollback, fix, retry.
   - **If data backfill:** chunks by batches (см. «Prevention» ниже).

---

## Zero-downtime migrations (best practice)

Expand-contract pattern (см. `specs/13-release-process.md §5`):

**Пример:** rename column `old_name` → `new_name`.

1. **Release N:** add `new_name` column (nullable). Code continues writing `old_name`.
2. **Release N+1:** code writes both.
3. **Release N+2:** backfill old → new (в фоне).
4. **Release N+3:** code reads only `new_name`.
5. **Release N+4:** remove `old_name`.

Никогда не rename в одну миграцию.

---

## Big data migrations — chunking

Для backfill miliona rows:

```python
# Плохо:
Estimate.objects.filter(needs_update=True).update(new_field=F('old_field'))

# Хорошо — chunked:
while True:
    ids = list(Estimate.objects.filter(
        needs_update=True
    ).values_list('id', flat=True)[:1000])
    if not ids:
        break
    Estimate.objects.filter(id__in=ids).update(
        new_field=F('old_field'),
        needs_update=False,
    )
    time.sleep(0.1)  # breathe
```

Запускается как management command, не migration.

---

## Recovery: rollback migration

```bash
# If migration <app>_0123 была last:
python manage.py migrate <app> 0122  # reverse to previous

# Verify
psql -c "SELECT * FROM django_migrations WHERE app='<app>' ORDER BY id DESC LIMIT 5"
```

**If reverse_code не написан:**
- Manual SQL для undo changes.
- Verify app starts correctly.
- Write reverse_code в migration и commit hotfix.

---

## Communication

### Internal

```
[ISMETA] Migration stuck
Migration: <name>
Duration: X minutes
Lock holder: <pid> (<query>)
Action: wait / kill / rollback
```

### External

При downtime > 15 минут:

```
Мы проводим технические работы.
ETA восстановления: HH:MM UTC.
```

---

## Post-mortem

- Timeline migration execution.
- Why stuck (lock, resource, deadlock).
- Was это predictable?
- Prevention: чанкировать? CONCURRENTLY? schedule в off-hours?

---

## Prevention

- **CI-job** — simulate migration на production-size БД.
- **Static analysis** — detect blocking migrations (add column NOT NULL without default, etc.).
- **Schedule** — migrations в maintenance window, не peak hours.
- **Rehearsal** — migrations сначала на staging, не directly on production.
- **Chunking** для больших backfill's.
- **Monitoring** — alert если migration > expected time.

## Связанные

- [`../specs/13-release-process.md §5`](../../specs/13-release-process.md)
- [`db-down.md`](./db-down.md)
- [`../DEVOPS-REVIEW.md §A3`](../DEVOPS-REVIEW.md)
