# Runbook: Redis Down

**Severity:** P1
**Expected frequency:** rare

## Симптомы

- Алерт: «Redis unreachable».
- Health check: `/health/ready` возвращает 503.
- Логи: `ConnectionError: Redis connection refused`.
- Celery задачи не выполняются (queue длинная).
- Idempotency для webhook'ов пропадает.

## Impact

- **Partial outage:**
  - CRUD операции в ISMeta — работают (только БД).
  - Подбор работ — не запускается (нужна Redis-сессия).
  - Chat с агентом — не работает.
  - Webhook'и — обрабатываются, но возможны дубликаты.

## Первые 5 минут

1. **Confirm:** `redis-cli -h ismeta-redis ping`.
2. **Declare P1.**
3. **SSH на сервер:** `ssh prod-redis-host`.
4. **Check status:** `systemctl status redis` или `docker ps | grep redis`.

## Диагностика

```bash
# 1. Process status
docker ps -a | grep redis

# 2. Логи
docker logs <redis-container> --tail 100

# 3. Memory usage
redis-cli info memory | grep used_memory

# 4. Connected clients
redis-cli info clients

# 5. Slow log
redis-cli slowlog get 10
```

### Типичные причины

- **Memory exhausted** (OOM).
- **Disk full** (при AOF/RDB).
- **Too many connections.**
- **Поврежденный dump.rdb.**

## Варианты решения

### Case 1: Memory exhausted

```bash
# Посмотреть memory
redis-cli info memory

# Если used_memory > maxmemory:
# Увеличить maxmemory в redis.conf или flush non-critical keys.

# Flush только Celery results (нужно проверять prefix):
redis-cli --scan --pattern 'celery-task-meta-*' | xargs redis-cli del
```

### Case 2: Восстановление после crash

Если AOF enabled — Redis сам прочитает AOF при restart:

```bash
docker compose restart redis
```

Если AOF повреждён:

```bash
# Check AOF
redis-check-aof --fix /var/lib/redis/appendonly.aof

# Force restart
docker compose down redis
docker compose up -d redis
```

### Case 3: Disk full

См. [`disk-full.md`](./disk-full.md).

### Case 4: Full reset (при невосстановимости)

**⚠️ Потеря данных в Redis:**
- Celery queue.
- Idempotency events.
- Matching sessions.
- Кеш Product.

```bash
# Stop Redis
docker compose stop redis

# Remove data
rm -rf /var/lib/redis/*

# Start clean
docker compose up -d redis
```

**После этого:**
- Celery задачи не закроются (надо переотправить).
- Webhook'и могут прийти дубликатом (idempotency пустой). ISMeta обязан ignore их по AuditLog.
- Кеш Product — восстановится sama после первых запросов к ERP.

## Graceful degradation в приложении

При Redis outage — ISMeta должна:
1. Circuit breaker на Redis-calls.
2. Пользователь видит баннер: «Часть функций временно недоступна».
3. CRUD работает, matching/agent — disabled.

(Реализуется в коде эпика E17.)

## Эскалация

- **После 30 минут** без прогресса — позвать DevOps-senior.
- **При data loss risk** — consulting с Tech Lead.

## Post-mortem checklist

- [ ] Root cause.
- [ ] Как долго Celery queue застряла.
- [ ] Сколько webhook'ов обработано дубликатом.
- [ ] Action items: memory monitoring, AOF settings.

## Prevention

- Memory alert (warning 70%, critical 85%).
- Evict policy: `maxmemory-policy allkeys-lru` для кеша.
- Отдельные DB для критичного и некритичного.
- Backup dump.rdb раз в сутки (даже для Redis).

## Связанные

- [`db-down.md`](./db-down.md)
- [`webhook-flood.md`](./webhook-flood.md)
- [`../SECRET-MANAGEMENT.md`](../SECRET-MANAGEMENT.md) — Redis auth
