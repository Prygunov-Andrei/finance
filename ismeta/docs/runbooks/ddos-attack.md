# Runbook: DDoS Attack

**Severity:** P1 (обычно), P0 если целенаправленный на public mode с data exfiltration
**Expected frequency:** возможно при запуске публичного режима

## Симптомы

- Алерт: «Traffic spike abnormal».
- Response time drops / 5xx rate up.
- Suspicious pattern: много запросов с одного IP или группы.
- CPU 100% на nginx / application.
- Network bandwidth maxed.

## Impact

- **Public users:** не могут access.
- **Internal users:** если DDoS на public + shared infra — slow.
- **Cost:** bandwidth bills могут скакать.

## Первые 5 минут

1. **Confirm DDoS** (vs legitimate spike).
2. **Declare severity.**
3. **Identify characteristics:**
   - Volume (bandwidth).
   - Source IPs (concentrated or distributed).
   - Attack vector (GET flood, POST flood, slow loris).
   - Target (public mode endpoint, admin).

## Диагностика

```bash
# Top IPs
tail -1000 /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head

# Top endpoints
tail -1000 /var/log/nginx/access.log | awk '{print $7}' | sort | uniq -c | sort -rn | head

# Current connections
netstat -an | grep ESTABLISHED | wc -l

# Backend response times
# (from monitoring dashboard)

# Check nginx status
curl http://localhost/nginx_status
```

### Характер атаки

| Pattern | Vector | Mitigation |
|---|---|---|
| Много с одного IP | Script kiddie | IP block |
| Много с разных IP, один endpoint | Targeted | Rate limit per endpoint |
| Slowloris (медленные connections) | TCP exhaustion | nginx timeout |
| HTTPS handshake flood | TLS attacks | CloudFlare / WAF |
| Volumetric | Bandwidth saturation | Upstream scrubbing |

## Варианты решения

### Case 1: Single IP attack

```bash
# Identified: 1.2.3.4 sends 1000 req/sec

# Block at firewall
iptables -A INPUT -s 1.2.3.4 -j DROP

# Or at nginx
# В nginx.conf:
deny 1.2.3.4;
nginx -s reload
```

### Case 2: Multi-IP (distributed)

**Harder.** Options:

1. **Rate limiting** на уровне nginx (per IP):
   ```nginx
   limit_req_zone $binary_remote_addr zone=public:10m rate=10r/s;
   location /public/ {
       limit_req zone=public burst=20 nodelay;
   }
   ```

2. **CloudFlare в режиме «Under Attack»**:
   - Challenge (JavaScript / CAPTCHA) для всех посетителей.
   - Legitimate проходят, боты — нет.

3. **fail2ban**:
   ```bash
   # Auto-block IPs с > 100 5xx за 5 минут
   fail2ban-client set ismeta banip 1.2.3.4
   ```

### Case 3: Volumetric (huge bandwidth)

**Critical.** Local mitigation не помогает. Actions:

1. Activate **upstream DDoS protection** (CloudFlare / Yandex Cloud anti-DDoS).
2. Increase bandwidth (emergency contact с провайдером).
3. Consider null-routing affected IP (last resort — отключает сервис).

### Case 4: Application-layer (slow)

```nginx
# В nginx.conf:
client_body_timeout 10s;
client_header_timeout 10s;
keepalive_timeout 15s;
send_timeout 10s;

limit_conn_zone $binary_remote_addr zone=per_ip:10m;
limit_conn per_ip 20;  # max 20 concurrent connections per IP
```

### Case 5: Credential stuffing на login

- Rate limit на `/login` per email (not per IP).
- CAPTCHA после 3 неудачных попыток.
- Account lockout после 10 неудачных.

---

## Defensive measures (постоянные)

### На уровне приложения

- Rate limits на публичных endpoint'ах (см. `hardening-checklist.md`).
- CAPTCHA на чувствительных (OTP, upload).
- Input validation.
- Query timeout в БД (max 30s).

### Инфраструктура

- CloudFlare или Yandex Cloud anti-DDoS.
- WAF (Web Application Firewall).
- Geo-blocking если applicable (публичный режим — только РФ).
- IP allow-list для admin endpoints.

### Monitoring

- Anomaly detection на traffic patterns.
- Alert на sudden CPU / bandwidth spike.

---

## Communication

### Internal

```
[ISMETA] Possible DDoS attack
Pattern: {single IP / distributed / volumetric}
Target: {public mode / API / all}
Mitigation: {block / rate limit / CloudFlare}
Impact: {slow / partial outage}
```

### External

При P0/P1 долго — status page:

```
Мы испытываем высокую нагрузку на наши сервисы.
Некоторые пользователи могут замечать задержки.
Команда работает над проблемой.
```

Не упоминаем «DDoS» публично — повторно mana.

## Post-mortem

- **Confirmed DDoS?** Yes/no.
- **Source analysis.**
- **Duration.**
- **Impact в RPS, revenue, customer experience.**
- **What worked / didn't work.**

---

## Prevention

- CloudFlare / аналог с Day 1 публичного режима.
- WAF rules pre-configured.
- Rate limits everywhere.
- No personal info в public endpoints.
- Limited API surface для public (только необходимое).
- Regular review access logs.

## Emergency contacts

- Yandex Cloud security: ...
- CloudFlare support (если используем): ...
- Tech Lead: ...
- Legal (если attack серьёзный): ...

## Связанные

- [`webhook-flood.md`](./webhook-flood.md) — related pattern.
- [`../SECURITY-REVIEW.md §D1`](../SECURITY-REVIEW.md)
- [`../specs/10-public-mode.md §11`](../../specs/10-public-mode.md)
- [`../admin/hardening-checklist.md`](../admin/hardening-checklist.md)
