# Disaster Recovery Plan

**Версия:** 0.1. **Дата:** 2026-04-15. **Источник:** DevOps ревью F.

План восстановления ISMeta после major incident'ов: data loss, server failure, compromised infrastructure.

## 0. Scope

Что покрывает этот документ:
- Бэкапы и restore procedures.
- RTO (Recovery Time Objective) и RPO (Recovery Point Objective).
- Процедуры для disaster scenarios.
- Regular drills.

Что НЕ покрывает:
- Security incidents — см. `SECURITY-REVIEW.md` + runbooks/security-breach.md.
- Minor inciденты — см. `runbooks/`.
- Business continuity (non-IT) — отдельный план.

## 1. RTO/RPO targets

| Scenario | RTO | RPO |
|---|---|---|
| Server/VM failure | 2 часа | 15 минут |
| Data corruption в БД | 4 часа | 15 минут |
| Complete data loss (наш сервер + его snapshot) | 8 часов | 24 часа |
| Regional outage (Yandex Cloud region down) | 24 часа | 24 часа |
| Compromised infrastructure | 24-48 часов | зависит от attack |

RTO = время от incident до full restoration.
RPO = максимальная потеря данных (15 мин = бэкап WAL каждые 15 минут).

---

## 2. Backup strategy

### 2.1 PostgreSQL

**Full dump:**
- Частота: каждые 24 часа в 03:00 UTC.
- Инструмент: `pg_dump --format=custom`.
- Storage: Yandex Object Storage.
- Retention: 30 дней.

**Incremental (WAL archive):**
- Инструмент: `wal-g` или `pgBackRest`.
- Частота: continuous (каждый WAL segment).
- Retention: 7 дней (достаточно для PITR до RPO 15 мин).

**Verification:**
- Automated script: eжедневно проверяет, что backup existit и не corrupted.
- Restore drill: раз в месяц полный restore в staging.

### 2.2 Redis

**Background:** Redis — не критичный долгосрочно (сессии, кеш).

- AOF enabled для recent commands recovery.
- RDB snapshot раз в сутки.
- Restore: в случае потери — приложение recovers самостоятельно (кеш прогреется, сессии устареют).

### 2.3 File uploads

- `/var/ismeta/uploads/` синкуется в S3 через rclone раз в час.
- Retention: 90 дней.

### 2.4 Knowledge base (.md files)

- Git-based (уже versioned).
- Mirror in secondary git repo.

### 2.5 Configuration и code

- Git repository (основной).
- Mirror в другой region.

---

## 3. Disaster scenarios

### 3.1 Scenario A: Корруптирован один Postgres

**Detection:**
- Alerts: «5xx error rate > 5%», «DB query failing».
- User reports: «не могу открыть смету».

**Response (RTO: 2 часа):**

1. Declare P0 incident (§`INCIDENT-SEVERITY.md`).
2. Isolate: остановить writes в DB (put API in maintenance mode).
3. Determine extent: какой row count missing / corrupted.
4. Options:
   - **Partial corruption:** restore only affected tables from snapshot.
   - **Full corruption:** full restore from latest backup + WAL replay до момента corruption.
5. Verify: integrity check, smoke tests.
6. Resume writes.
7. Postmortem.

**Steps detail:**

```bash
# 1. Switch to maintenance
# Update nginx config → return 503 with message

# 2. Verify backup integrity
wal-g backup-list

# 3. Restore
wal-g backup-fetch /var/lib/postgresql/data LATEST
wal-g wal-fetch 000000010000000100000001 /var/lib/postgresql/data/pg_wal

# 4. Start postgres in recovery mode
postgres -D /var/lib/postgresql/data

# 5. Wait for WAL replay to target time
# postgres.conf: recovery_target_time = '2026-04-15 14:25:00 UTC'

# 6. Promote when ready
pg_ctl promote

# 7. Verify
psql -c "SELECT count(*) FROM estimate"
# ...smoke tests

# 8. Remove maintenance
```

### 3.2 Scenario B: Production server полностью died

**Detection:**
- Server unreachable.
- All alerts firing.

**Response (RTO: 8 часов):**

1. Declare P0 incident.
2. Status page update: «Service temporarily unavailable. ETA: 4 hours».
3. Provision new server.
4. Install OS + Docker.
5. Pull latest from git repo.
6. Restore secrets from SOPS (при наличии age-key).
7. Download latest backup.
8. Restore Postgres.
9. Start services.
10. Update DNS.
11. Verify.
12. Status page: «Service restored».

**Documentation:** detailed steps в `runbooks/db-down.md` + `runbooks/full-restore.md`.

### 3.3 Scenario C: Data corruption (user error)

**Пример:** кто-то сделал `DELETE FROM estimate_item WHERE 1=1` в prod.

**Response (RTO: 4 часа):**

1. Declare P0.
2. Isolate: pause writes.
3. Identify scope: какие таблицы, сколько rows.
4. PITR до момента before deletion.
5. Verify.
6. Resume.

### 3.4 Scenario D: Compromised credentials

**Detection:**
- Unauthorized admin login.
- Unusual API activity.

**Response:**

1. Declare P0 security incident.
2. Rotate all secrets immediately (см. `SECRET-MANAGEMENT.md §5.3`).
3. Revoke all active sessions.
4. Audit logs для действий attacker'а.
5. Restore data if was modified.
6. Forensic investigation.
7. Customer notification (per 152-ФЗ).
8. Full postmortem.

### 3.5 Scenario E: Regional outage (облачный провайдер)

**Pre-requisite:** наличие cross-region backup.

**Response (RTO: 24 часа):**

1. Assess: recoverable в same region или нужно двигаться.
2. If > 4 hours predicted downtime:
   - Provision new infra в другом регионе.
   - Restore from cross-region backup.
   - Update DNS.
3. Communication: honest timeline to customers.

### 3.6 Scenario F: Malicious actor с access

**Pre-requisite:** insider threat или compromise.

**Response:**

1. Immediate access revocation.
2. Full audit of actions.
3. Possible data restoration from pre-compromise backup.
4. Legal involvement.
5. Customer notification (compliance).

---

## 4. Cross-region strategy

### 4.1 Current (MVP)

**Single region:** всё в одном регионе Yandex Cloud.
**Backup:** в другой регион того же провайдера.

### 4.2 Этап 3+

**Active-passive:**
- Primary: region A.
- Standby replica: region B (daily refresh).
- Failover: manual (RTO ~4 часа).

### 4.3 Этап 4+ (SaaS)

**Active-active:**
- Multi-region для Enterprise-клиентов по запросу.
- Managed database с multi-region replication.
- Load balancer с geo-routing.

---

## 5. Drills

### 5.1 Monthly restore drill

**Procedure:**
1. Create clean staging environment.
2. Download latest production backup.
3. Restore.
4. Run smoke tests.
5. Measure time: RTO achieved?
6. Document anomalies.

**Calendar:** последний четверг месяца.
**Owner:** DevOps.

### 5.2 Quarterly DR simulation

**Procedure:** один scenario из §3 полностью проигрывается на staging.

**Example:** Q1 — Scenario A (data corruption). Q2 — Scenario B (server died). И т.д.

**Post-drill:**
- Update runbooks с новыми находками.
- Measure actual RTO vs target.
- Identify gaps.

### 5.3 Annual tabletop

**Procedure:**
- Вся команда + PO.
- Imaginary scenario (например, «сервер скомпрометирован, атакующие получили admin доступ»).
- Walk through response без действий на серверах.
- Результат: updated runbooks, improved process.

---

## 6. Communication

### 6.1 Customer communication template

**During incident:**
```
Тема: [ISMeta Incident] Service disruption

Dear Customer,

At HH:MM UTC we detected a problem with ISMeta:
- Impact: ...
- What we're doing: restoring from backup.
- ETA for restoration: HH:MM.

We'll update you at [next update time]. 

For urgent needs, contact support@...
```

**After incident:**
```
Тема: [ISMeta Incident] Service restored

Dear Customer,

The issue that occurred at HH:MM UTC has been fully resolved at HH:MM.

Impact on your data: [нет / специфика].

Root cause: [brief].

Full postmortem will be published within 72 hours.

We apologize for the inconvenience.
```

### 6.2 Status page

- Third-party status page (StatusPage.io или self-hosted).
- Updated automatically from alerts.
- Manual updates от on-call.

---

## 7. Business continuity

### 7.1 Что продолжает работать даже в major incident

- Сайт landing (если у нас есть) — отдельный domain, static.
- Email (Google Workspace или аналог).
- Documentation (в git, accessible).
- Team communication (Slack / Telegram, cloud-hosted).

### 7.2 Что временно не работает

- ISMeta application.
- Customer-facing API.
- Admin dashboard.

### 7.3 Priority of restoration

1. Database (без неё nothing works).
2. Backend Django (API).
3. Frontend (UI).
4. Monitoring (чтобы видеть, что работает).
5. Celery (background tasks).
6. Non-critical (metrics dashboard, audit logs).

---

## 8. Vendor / supply chain DR

### 8.1 LLM provider down

- Fallback chain (см. `specs/04-llm-agent.md §5.1`).
- RPO: 0 (no data loss, just degraded functionality).
- RTO: 5 минут (автоматический failover).

### 8.2 Object Storage down (Yandex Cloud)

- Uploads временно недоступны.
- Backups продолжаются (очередь).
- Degraded mode on frontend.

### 8.3 ERP provider down

- ISMeta продолжает работать (см. `CONCEPT.md §4.7`).
- Graceful degradation.

### 8.4 DNS provider down

- Use DNS с fast TTL (1 hour max).
- Secondary DNS provider configured (RFC 2182).

---

## 9. Insurance

### 9.1 Cyber insurance (для крупных клиентов)

- Обсуждается на этапе 3-4.
- Coverage: data breach, cyber extortion, business interruption.
- Cost: ~2-5% от coverage annually.

### 9.2 Liability caps в контрактах

- Standard: до годового contract value.
- Negotiable для Enterprise.

---

## 10. Что делать сейчас

- [ ] Настроить backup scripts (эпик E23).
- [ ] Первый restore drill после этапа 1.
- [ ] Создать runbooks для каждого scenario.
- [ ] Status page (для публичного режима, этап 2.5).

---

## 11. Связанные документы

- [`runbooks/`](./runbooks/)
- [`INCIDENT-SEVERITY.md`](./INCIDENT-SEVERITY.md)
- [`SLO.md`](./SLO.md)
- [`SECRET-MANAGEMENT.md`](./SECRET-MANAGEMENT.md)
- [`specs/12-security.md §6`](../specs/12-security.md) — backup strategy.
