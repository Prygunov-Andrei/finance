# Sizing Guide

**Версия:** 0.1. **Дата:** 2026-04-15. **Источник:** DevOps ревью D1.

Гипотезы по требованиям к инфраструктуре для разных размеров установки ISMeta. **Цифры — гипотезы**, валидируются load testing (эпик в фазе B roadmap).

## 0. Принцип

- Лучше запустить «достаточно» и масштабировать, чем переплачивать.
- Все числа per ISMeta instance (не per workspace).
- Resource usage зависит от: активность (DAU), размер смет, LLM usage.

---

## 1. Profiles

### 1.1 Nano (< 3 сметчиков, pilot)

**Use case:** первый pilot клиент.

| Component | Spec |
|---|---|
| Backend Django | 2 CPU, 4 GB RAM |
| PostgreSQL | 2 CPU, 4 GB RAM, 50 GB SSD |
| Redis | 1 CPU, 1 GB RAM |
| Frontend Next.js | 1 CPU, 2 GB RAM |
| Recognition (in ERP) | shared |
| Mock services | optional (dev only) |
| **Total** | **~6 CPU, 11 GB RAM, 50 GB disk** |

**Hosting estimate:** 1 VPS Yandex Cloud Standard 2 (4 CPU, 16 GB RAM) ≈ 15K ₽/мес.

**Capacity:**
- До 3 сметчиков одновременно.
- До 20 смет/месяц.
- До 100 смет/год в БД.

### 1.2 Small (3-10 сметчиков)

**Use case:** малый бизнес.

| Component | Spec |
|---|---|
| Backend Django (2 instances) | 4 CPU, 8 GB RAM |
| PostgreSQL | 4 CPU, 8 GB RAM, 100 GB SSD |
| Redis | 2 CPU, 2 GB RAM |
| Frontend Next.js | 2 CPU, 4 GB RAM |
| Celery workers (2) | 2 CPU, 4 GB RAM |
| **Total** | **~14 CPU, 26 GB RAM, 100 GB disk** |

**Hosting estimate:** 2 VPS или 1 dedicated server ≈ 40K ₽/мес.

**Capacity:**
- До 10 сметчиков одновременно.
- До 100 смет/месяц.
- До 1200 смет/год в БД.

### 1.3 Medium (10-30 сметчиков)

**Use case:** средний бизнес.

| Component | Spec |
|---|---|
| Backend Django (3 instances) | 6 CPU, 12 GB RAM |
| PostgreSQL primary | 4 CPU, 16 GB RAM, 200 GB SSD |
| PostgreSQL replica (read) | 2 CPU, 8 GB RAM, 200 GB SSD |
| Redis (Sentinel) | 4 CPU, 4 GB RAM |
| Frontend Next.js (2 instances) | 4 CPU, 8 GB RAM |
| Celery workers (4) | 4 CPU, 8 GB RAM |
| OpenTelemetry collector | 1 CPU, 2 GB RAM |
| Grafana + Prometheus | 2 CPU, 4 GB RAM, 50 GB SSD |
| **Total** | **~27 CPU, 62 GB RAM, 450 GB disk** |

**Hosting estimate:** 3-4 VPS или managed services ≈ 100K ₽/мес.

**Capacity:**
- До 30 сметчиков одновременно.
- До 300 смет/месяц.
- До 4000 смет/год в БД.

### 1.4 Large (30-100 сметчиков)

**Use case:** крупная компания / SaaS ранний.

| Component | Spec |
|---|---|
| Backend Django (5+ instances) | 10 CPU, 20 GB RAM |
| PostgreSQL primary (managed) | 8 CPU, 32 GB RAM, 500 GB SSD |
| PostgreSQL replicas (2) | 4 CPU × 2, 16 GB RAM × 2 |
| Redis Cluster | 8 CPU, 16 GB RAM |
| Frontend Next.js (3+ instances) | 6 CPU, 12 GB RAM |
| Celery workers (10+) | 10 CPU, 20 GB RAM |
| Monitoring stack | 4 CPU, 8 GB RAM |
| Load balancer | managed |
| **Total** | **~54+ CPU, 140+ GB RAM, 1 TB+ disk** |

**Hosting estimate:** managed cluster ≈ 400K ₽/мес.

**Capacity:**
- До 100 сметчиков одновременно.
- До 1000 смет/месяц.
- До 15000 смет/год в БД.

---

## 2. Ресурсы per-component

### 2.1 PostgreSQL

**Основной load:**
- Storage: ~500 KB на смету (средняя 2000 строк).
- CPU: fuzzy queries (ProductKnowledge) — ~50 ms под нагрузкой.
- Connections: pool ~20 на backend instance.

**Scaling signals:**
- Query latency p95 > 500 ms → add replicas.
- Storage growth > 50% monthly → add disk.
- Connection pool exhaustion → add pgbouncer.

### 2.2 Redis

**Основной load:**
- Celery broker: ~10 KB per job.
- Redis idempotency (webhook): ~1 KB per event.
- Matching sessions: ~10 KB per session.
- Cache (если будет): ~1 KB per cached item.

**Scaling signals:**
- Memory > 70% → scale or evict.
- Commands/sec > 10K → clustering.

### 2.3 Backend (Django)

**Основной load:**
- Request handlers: API endpoints.
- Each request: ~50-200 MB ram peak (depending on smету size).
- CPU per request: < 200ms (вне LLM).

**Scaling signals:**
- Request queue > 10 → scale out.
- Response time p95 > 500 ms → profile.

### 2.4 Celery workers

**Основной load:**
- Work matching (long-running): ~1 GB RAM peak.
- PDF parsing: ~500 MB RAM peak per file.
- Webhook processing: ~50 MB RAM.

**Scaling signals:**
- Queue depth > 50 tasks → scale.
- Task latency > threshold → profile.

### 2.5 Frontend (Next.js)

**Main load:**
- SSR rendering: ~100 MB per concurrent user.
- Static assets: served from CDN (не считаем).

**Scaling signals:**
- SSR latency p95 > 1s → scale.

### 2.6 LLM

**Not infra, но нужно учитывать:**
- Rate limits провайдера.
- Parallel requests lmit.
- Cost budget.

---

## 3. Storage growth

### 3.1 Per смета

- Estimate + sections + items: ~500 KB.
- AuditLog per смета: ~50 KB (10-100 actions).
- Snapshot transmission: ~200 KB.
- LLMUsage per смета: ~5 KB.
- Chat history: ~10-100 KB.

**Всего: ~1 MB на смету.**

### 3.2 Per год

- Nano: 100 смет × 1 MB = 100 MB.
- Small: 1200 × 1 MB = 1.2 GB.
- Medium: 4000 × 1 MB = 4 GB.
- Large: 15000 × 1 MB = 15 GB.

### 3.3 Attachments (uploads)

- Средний PDF спецификации: 2-5 MB.
- Редкие big files: до 20 MB.
- Storage per год: ~20-100 GB для Medium.

### 3.4 Backup

- Full dump ежедневно × 30 дней retention = 30× primary size.
- WAL archive: ~20-50 GB/месяц в прод.

---

## 4. Network

### 4.1 Inbound

- HTTP API calls: типично 10-50 KB per request.
- File uploads: peak 20 MB.
- Webhook events: 1-10 KB.

### 4.2 Outbound

- LLM API calls: ~100 KB per call (input + output).
- Backups to S3: depends on size.
- ERP catalog calls: ~10-50 KB.

### 4.3 Bandwidth estimate

- Nano: 10 GB/месяц.
- Small: 100 GB/месяц.
- Medium: 500 GB/месяц.
- Large: 2 TB/месяц.

---

## 5. Load test plan

### 5.1 Happy path

**Scenario 1: Concurrent smету creation**

- 10 concurrent users.
- Each creates 1 смета за 10 минут.
- Assertion: все successful, p95 < 500ms.

**Scenario 2: Work matching load**

- 10 concurrent матчингов.
- Each 2000 rows.
- Assertion: queue не упал, среднее время < 5 минут.

**Scenario 3: Excel export storm**

- 20 concurrent exports средней сметы.
- Assertion: no OOM, responses within 10s.

### 5.2 Edge cases

**Scenario 4: Giant estimate**

- 10 000 строк смета.
- Assertion: не crash, acceptable performance.

**Scenario 5: Webhook storm**

- 1000 webhooks in 1 minute.
- Assertion: все processed, no duplicates.

**Scenario 6: LLM outage**

- OpenAI возвращает 5xx.
- Assertion: fallback работает.

### 5.3 Tool

- **k6** — recommended для API tests.
- **Locust** — alternative (Python).
- Run в staging, результаты фиксируются в `docs/LOAD-TEST-RESULTS.md`.

---

## 6. Monitoring для capacity

Критические метрики для scaling decisions:

| Metric | Warning | Critical |
|---|---|---|
| CPU usage backend | 60% | 80% |
| Memory usage | 70% | 85% |
| DB connections | 80% of pool | 95% |
| Celery queue depth | 50 | 100 |
| API p95 latency | 500 ms | 1s |
| Disk usage | 70% | 85% |
| Redis memory | 70% | 85% |

Все — в dashboards из `docs/SIZING-ALERTS.md` (TBD).

---

## 7. Cost projection

| Size | Compute | Storage | Network | LLM | Monitoring | **Total/mo** |
|---|---|---|---|---|---|---|
| Nano | 15K ₽ | 2K ₽ | 1K ₽ | 10K ₽ | 2K ₽ | **30K ₽** |
| Small | 40K ₽ | 5K ₽ | 3K ₽ | 30K ₽ | 5K ₽ | **83K ₽** |
| Medium | 100K ₽ | 15K ₽ | 10K ₽ | 100K ₽ | 10K ₽ | **235K ₽** |
| Large | 400K ₽ | 50K ₽ | 30K ₽ | 400K ₽ | 30K ₽ | **910K ₽** |

**Примечания:**
- LLM — самая variable часть. При оптимизации (gpt-4o-mini вместо gpt-4o) — снижение на 70%.
- Цены облачных провайдеров меняются; перепроверять квартально.

---

## 8. Upgrade paths

**Nano → Small:** добавить replica Postgres, +2 Celery, бо'льший VPS.
**Small → Medium:** отдельный DB server, scale-out backend, Redis Sentinel.
**Medium → Large:** managed Postgres, Redis Cluster, load balancer, CDN.

---

## 9. Что делать сейчас

- [ ] Валидировать цифры load test'ом в staging.
- [ ] Реальные данные заменяют гипотезы.
- [ ] Update этот документ после первого клиента.

---

## 10. Связанные документы

- [`DEVOPS-REVIEW.md §D`](./DEVOPS-REVIEW.md)
- [`ENVIRONMENTS.md`](./ENVIRONMENTS.md)
- [`specs/11-metrics.md`](../specs/11-metrics.md)
- [`LLM-COST-MODEL.md`](./LLM-COST-MODEL.md)
