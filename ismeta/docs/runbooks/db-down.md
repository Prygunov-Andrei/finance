# Runbook: Database Down

**Severity:** P0
**Expected frequency:** rare

## Симптомы

- Health check `/api/v1/health/ready` возвращает 503.
- Алерт: «Postgres is not responding».
- Логи backend: `OperationalError: could not connect to server`.
- Пользователи видят 500 / 503 на всех endpoints с записью/чтением.

## Impact

- **Complete service outage.** Никто не может работать.
- Webhook'и не обрабатываются, аккумулируются.
- LLM-задачи падают.

## Первые 5 минут

1. **Confirm outage:** попробовать `curl http://ismeta-api/health/ready`.
2. **Declare P0.** Открыть incident channel, оповестить on-call team.
3. **Status page update:** «Service unavailable. Investigating.»
4. **SSH на сервер БД:** `ssh prod-db-host`.
5. **Check Postgres status:** `systemctl status postgresql` или `docker ps | grep postgres`.

## Диагностика

### Если Postgres процесс running

```bash
# 1. Проверить, может ли connect локально
psql -h localhost -U ismeta -d ismeta -c 'SELECT 1'

# 2. Проверить логи
journalctl -u postgresql -n 100
# или для Docker:
docker logs <postgres-container> --tail 100

# 3. Проверить disk space
df -h

# 4. Проверить memory
free -h

# 5. Проверить connections
psql -U postgres -c 'SELECT count(*) FROM pg_stat_activity'
```

### Если Postgres не запускается

Типичные причины:
- **Disk full** — см. runbook `disk-full.md`.
- **Corrupted WAL** — см. §Recovery ниже.
- **OOM killer** — проверить `dmesg | grep -i oom`.

## Варианты решения

### Case 1: Disk full

```bash
# Найти большие файлы
du -ah / | sort -rh | head -20

# Чаще всего — логи или WAL files
# Clean старые логи:
journalctl --vacuum-time=3d

# Если WAL переполнил:
# (только если backup свежий и wal-g работает)
# Move старые WAL в S3:
wal-g wal-push --delete-before FIND_LATEST
```

### Case 2: Max connections exhausted

```bash
# Показать connections
psql -U postgres -c "SELECT pid, usename, state, query_start FROM pg_stat_activity ORDER BY query_start"

# Убить долго висящие
psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query_start < now() - interval '10 minutes'"

# Увеличить max_connections в postgresql.conf, restart
```

### Case 3: Corrupted WAL

**Serious** — может потребоваться restore.

```bash
# Попытка repair
pg_resetwal -f /var/lib/postgresql/data

# Если не помогло — full restore from backup
# см. §Full restore ниже
```

### Case 4: Postgres container не стартует

```bash
# Inspect
docker logs <container>

# Если permissions:
chown -R 999:999 /var/lib/postgresql/data

# Restart
docker compose restart postgres
```

## Full restore (если всё плохо)

**⚠️ Выполнять только при подтверждении, что текущая БД не восстановима.**

```bash
# 1. Stop application
docker compose stop backend frontend

# 2. Backup current (если что-то ещё читается)
pg_dump -U postgres ismeta > /tmp/corrupted-$(date +%F).sql || echo "cannot dump"

# 3. Drop
sudo -u postgres dropdb ismeta

# 4. Create clean
sudo -u postgres createdb ismeta

# 5. Restore from latest backup
wal-g backup-fetch /var/lib/postgresql/data LATEST

# 6. PITR до нужной точки (если нужно)
# Edit postgresql.conf:
# recovery_target_time = '2026-04-15 14:25:00 UTC'

# 7. Start postgres
systemctl start postgresql
# Wait for recovery to complete

# 8. Promote
pg_ctl -D /var/lib/postgresql/data promote

# 9. Verify
psql -U ismeta -c 'SELECT count(*) FROM estimate'

# 10. Start app
docker compose start backend frontend

# 11. Smoke test
curl http://ismeta/api/v1/health/ready
```

RTO: ~2 часа.
RPO: ~15 минут (зависит от wal-g frequency).

## Эскалация

- **После 15 минут** без прогресса — позвать Tech Lead.
- **После 30 минут** — оповестить CEO + подготовить customer communication.
- **После 1 часа** — подумать о внешней помощи (Yandex Cloud support).

## Post-mortem checklist

- [ ] Timeline зафиксирован.
- [ ] Root cause известен.
- [ ] Action items для prevention созданы.
- [ ] Customers уведомлены с финальным статусом.
- [ ] Runbook обновлён с новыми находками.

## Prevention

- Disk usage alerts (warning 70%, critical 85%).
- Connection pool monitoring.
- Regular WAL archival.
- Monthly restore drill.
- Managed Postgres (Yandex Cloud) — меньше самодеятельности.

## Связанные

- [`disk-full.md`](./disk-full.md)
- [`data-corruption.md`](./data-corruption.md)
- [`backup-failed.md`](./backup-failed.md)
- [`../DR-PLAN.md`](../DR-PLAN.md)
