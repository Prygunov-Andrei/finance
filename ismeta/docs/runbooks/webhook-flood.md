# Runbook: Webhook Flood

**Severity:** P2
**Expected frequency:** редко

## Симптомы

- Алерт: «webhook queue depth > 500».
- Алерт: «webhook processing time > 30s».
- Backend CPU 100%.
- Database connection pool exhausted.

## Impact

- CRUD операции ISMeta замедляются.
- Пользователи жалуются на slow UI.
- Legitimate webhook'и обрабатываются медленно → stale data.

## Причины (типичные)

1. **ERP восстановился после downtime** — накопившиеся webhook'и пришли разом.
2. **ERP bug** — отправляет дубликаты.
3. **Attacker** — flood на наш webhook endpoint.
4. **Large batch update в ERP** — legitimate, но огромный.

## Первые 5 минут

1. **Confirm flood:** check queue depth.
2. **Source check:** откуда идут webhook'и (IP, header'ы).
3. **Legitimate or malicious?**

## Диагностика

```bash
# Celery queue depth
celery -A ismeta inspect active | wc -l

# Database connections
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity"

# Recent webhooks from logs
grep "POST /api/v1/webhooks/erp" /var/log/nginx/access.log | tail -100

# Event IDs distribution
psql -U ismeta -c "
SELECT event_type, count(*)
FROM processed_events
WHERE processed_at > now() - interval '10 minutes'
GROUP BY event_type
ORDER BY count(*) DESC
"
```

## Варианты решения

### Case 1: ERP restored storm

**Expected behavior.** Short burst:

1. Monitor — wait 5-15 minutes.
2. Queue depth уменьшается.
3. После — check что все processed.

**Если не помогает:**

```bash
# Scale up Celery workers temporarily
docker compose up -d --scale celery=10

# После — scale back
docker compose up -d --scale celery=4
```

### Case 2: ERP отправляет duplicates

**Duplicates ловятся idempotency.** Проверяем:

```sql
-- Сколько было duplicate attempts
SELECT count(*) FROM processed_events
WHERE processed_at > now() - interval '1 hour'
GROUP BY event_id
HAVING count(*) > 1;
```

**Если массово:**

1. Contact ERP team — fix on their side.
2. На нашей стороне — нет действий (idempotency работает).

### Case 3: Malicious flood

**Signals:**
- Подписи HMAC fails большинство.
- IP не из ERP allow-list.
- Event IDs — обмани паттерн.

**Actions:**

1. **Immediate block** на nginx:
   ```nginx
   deny <malicious_ip>;
   ```
2. Или iptables:
   ```bash
   iptables -A INPUT -s <malicious_ip> -j DROP
   ```
3. Strengthen rate limits для webhook endpoint.
4. Consider WAF (CloudFlare).

### Case 4: Legitimate massive update

**Scenario:** ERP массово обновил 10 000 товаров.

1. Expected, но неожиданно.
2. Rate-limit processing в ISMeta:
   ```python
   # Ограничить batch size
   BATCH_SIZE = 100
   ```
3. Wait.
4. Communication с ERP team — лучше warn заранее.

## Protection (долгосрочно)

### Rate limiting на webhook endpoint

```nginx
# В nginx config
limit_req_zone $binary_remote_addr zone=webhook_flood:10m rate=100r/s;

location /api/v1/webhooks/ {
    limit_req zone=webhook_flood burst=1000 nodelay;
    proxy_pass http://backend;
}
```

### IP allow-list

```nginx
location /api/v1/webhooks/ {
    allow <erp-ip-1>;
    allow <erp-ip-2>;
    deny all;
    proxy_pass http://backend;
}
```

### Circuit breaker на ISMeta

Если upstream (ERP) явно misbehaving:
- Temporary stop processing (ISMeta отвечает 503 на webhooks).
- ERP ретрайит позже с exponential backoff.
- После восстановления — normal flow.

## Communication

### Internal

```
[ISMETA] Webhook flood
Source: {ERP / unknown / attacker}
Rate: N/sec
Queue depth: M
Impact: slow CRUD
Action: scaling / blocking
```

### External

Обычно не требуется — пользователи видят только latency.

## Post-mortem checklist

- [ ] Что вызвало flood.
- [ ] Idempotency защитила?
- [ ] Какое data delay было.
- [ ] Fix to prevent: rate limit? batch sizes? WAF?

## Prevention

- Rate limits на webhook endpoint (described above).
- Monitoring queue depth.
- ERP batch size limits (договорённость с ERP team).
- Outbox pattern в ERP — не должна отправлять разом > N событий.

## Связанные

- [`../specs/03-webhook-events.md §4`](../../specs/03-webhook-events.md) — outbox pattern.
- [`redis-down.md`](./redis-down.md) — если queue in Redis.
- [`ddos-attack.md`](./ddos-attack.md) — если malicious.
