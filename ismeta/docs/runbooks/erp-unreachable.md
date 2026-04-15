# Runbook: ERP Unreachable

**Severity:** P1
**Expected frequency:** medium (несколько раз в год)

## Симптомы

- Алерт: «ERP catalog API failing».
- Логи: `httpx.ConnectError` при обращении к ERP endpoints.
- Пользователи: «Не могу открыть справочник».
- LLM tools: `get_supplier_prices` возвращает error.

## Impact

- **Partial degradation:**
  - Новые сметы — не могут запросить live данные (каталог, прайсы, объекты).
  - Существующие сметы — работают с кешем Product.
  - Передача сметы в ERP — в очереди retry.
  - Webhook'и — не приходят (они push-based; без push ISMeta не знает о новых событиях).

## Первые 5 минут

1. **Confirm:** `curl http://erp/api/erp-catalog/v1/health`.
2. **Declare severity** (P1 если > 15 минут).
3. **Connect with ERP team:** канал `#erp-ismeta-sync` — их проблема или наша?
4. **Check connectivity:** ping, traceroute — сеть работает?

## Диагностика

### Сеть ли это?

```bash
# С ISMeta-хоста
ping erp-host
traceroute erp-host
curl -v http://erp-host/api/erp-catalog/v1/health
```

Если ping работает, но curl — нет → ERP сервис down, не сеть.

### Сервис ли это?

- Статус у ERP команды.
- Их monitoring показывает что-то?
- Их последний deploy недавно?

### Аутентификация ли это?

```bash
# Master-token валиден?
curl -H "Authorization: Bearer $MASTER_TOKEN" \
  http://erp-host/api/erp-catalog/v1/products?limit=1
# Если 401 — ротировать secret.
```

## Варианты решения

### Case 1: ERP просто рестартуется/deploy

**Ожидание + graceful degradation.**

1. Оповестить пользователей: «Временные проблемы связи с ERP».
2. ISMeta продолжает работать с кешем.
3. После восстановления — polling fallback подберёт пропущенные события.

### Case 2: Наша сеть / firewall

**Если ERP работает, но мы не можем connect:**

```bash
# Check firewall rules on our side
iptables -L -n

# Check DNS resolution
nslookup erp-host

# Reset network if needed
systemctl restart networking
```

### Case 3: ERP API reboot в процессе

- Оценить estimated time of restoration (их monitoring).
- Communicate customers honestly.

### Case 4: Secrets expired/rotated

- Координация с ERP team.
- Rotate master-token с обеих сторон.
- Deploy новый secret.

### Case 5: ERP полностью упал (катастрофа)

- **ISMeta остаётся работать** (см. `CONCEPT.md §4.7`).
- CRUD продолжается.
- Новые смета не могут получить справочники — user вводит вручную.
- Webhook polling ждёт ERP возврата.

## Communication template

### Internal

```
[ISMETA] Связь с ERP потеряна
Начало: HH:MM
Impact: нельзя запрашивать справочники, передача сметы в retry
Ищем причину с ERP team.
Updates каждые 30 мин.
```

### External (если > 1 часа)

```
Уважаемые пользователи,

Мы временно испытываем проблемы с получением справочных данных.
Большинство функций ISMeta работает нормально.

ETA восстановления: N минут/часов.

Извините за неудобства.
```

## Post-mortem checklist

- [ ] Timeline с обеих сторон (ISMeta + ERP).
- [ ] Root cause — на чьей стороне.
- [ ] Coordination improvements.
- [ ] Action items: better monitoring, faster detection.

## Prevention

- Heartbeat check каждую минуту.
- Алерт на 3 consecutive fail.
- Polling fallback каждые 60 сек — уже заложен.
- Circuit breaker pattern на HTTP client ISMeta (httpx with retry).

## Связанные

- [`webhook-flood.md`](./webhook-flood.md) — если потом storm приходит.
- [`../CONCEPT.md §4.7`](../../CONCEPT.md) — graceful degradation.
- [`../specs/03-webhook-events.md §3.3`](../../specs/03-webhook-events.md) — polling fallback.
