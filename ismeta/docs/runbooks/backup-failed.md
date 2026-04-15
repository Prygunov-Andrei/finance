# Runbook: Backup Failed

**Severity:** P2 (обычно). P1 если 2 дня подряд.
**Expected frequency:** раз в несколько месяцев.

## Симптомы

- Алерт: «Backup healthcheck missed».
- Healthchecks.io / аналог не получил ping 25+ часов.
- Cron task в failed state.
- S3 bucket не содержит свежий dump.

## Impact

- **Не немедленный.** Сервис продолжает работать.
- **Но:** при следующем disaster — восстановление с более старого backup = больше data loss.

## Первые 5 минут

1. Verify: последний успешный backup когда?
   ```bash
   aws s3 ls s3://ismeta-backups/ --recursive | sort | tail -10
   ```
2. Если > 48 часов — P1.
3. Connect on-call DevOps.
4. Проверить disk, network, cron.

## Диагностика

### Где запускается backup?

```bash
# Cron job
crontab -l | grep backup

# Или systemd timer
systemctl list-timers | grep backup

# Или k8s cronjob
kubectl get cronjobs
```

### Прошёл ли последний раз?

```bash
# Логи
tail -100 /var/log/ismeta-backup.log

# или для k8s
kubectl logs job/ismeta-backup-<date>
```

### Disk space

```bash
df -h /var/lib/postgresql/backup
```

### S3 access

```bash
aws s3 ls s3://ismeta-backups --profile ismeta-backup
# Должен работать без ошибки.
```

## Варианты решения

### Case 1: Cron не запустился

```bash
# Проверить status cron
systemctl status cron

# Restart
systemctl restart cron

# Запустить backup вручную
/usr/local/bin/ismeta-backup.sh
```

### Case 2: Скрипт падает

**Частая причина:** изменения в структуре БД, permissions.

```bash
# Запустить вручную с полным выводом
bash -x /usr/local/bin/ismeta-backup.sh
```

Разбираем error и чиним.

### Case 3: Disk full

См. [`disk-full.md`](./disk-full.md).

Backup пытается записать в локальный staging перед upload в S3.

### Case 4: S3 credentials expired/rotated

```bash
# Check credentials
aws sts get-caller-identity --profile ismeta-backup

# Если expired → rotate S3 access key, update secrets
```

### Case 5: Network issue (S3 недоступен)

- Retry manual backup.
- Mirror в другой storage (временно local).

### Case 6: wal-g не работает

```bash
# Check wal-g configuration
wal-g st ls

# Check last WAL sent
psql -U postgres -c "SELECT last_archived_wal FROM pg_stat_archiver"

# Restart
systemctl restart postgresql-wal-g
```

## Восстановление propusk'ов

Если backup провалился на X дней:

1. Запустить manual backup немедленно.
2. Force WAL archive:
   ```sql
   SELECT pg_switch_wal();
   ```
3. Убедиться, что WAL sent в S3.
4. Проверить PITR capability: можно ли restore до now()?

## Communication

- **Internal:** `#ismeta-alerts` автомат.
- **External:** не требуется (customer ничего не видит).

## Post-mortem checklist

- [ ] Когда последний успешный backup был.
- [ ] Почему именно в этот раз упал.
- [ ] Какой data at risk во время gap.
- [ ] Action items: improve monitoring, alert tuning.

## Prevention

- Healthcheck пинг от backup script.
- Daily verification: «latest backup in S3 is < 25h old».
- Test restore monthly (DR drill).
- Backup script пишет в Sentry на errors.

## Verification после fix

```bash
# 1. Backup script проходит без errors
bash /usr/local/bin/ismeta-backup.sh
echo $?  # должен быть 0

# 2. S3 имеет новый файл
aws s3 ls s3://ismeta-backups/$(date +%F)/

# 3. Healthcheck ping отправлен
grep "ping sent" /var/log/ismeta-backup.log

# 4. Попробовать restore (в staging!)
# см. DR-PLAN.md
```

## Связанные

- [`../DR-PLAN.md §2`](../DR-PLAN.md)
- [`disk-full.md`](./disk-full.md)
- [`db-down.md`](./db-down.md) — если срочно нужен restore.
