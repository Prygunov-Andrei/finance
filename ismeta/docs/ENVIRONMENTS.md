# Environments Map

**Версия:** 0.1. **Дата:** 2026-04-15. **Источник:** DevOps ревью B2.

Карта четырёх environments ISMeta: что где, как связаны, кто имеет доступ.

## 1. Overview

| Env | URL | Branch | Data | Purpose | Users |
|---|---|---|---|---|---|
| **Local** | localhost | feature/* | seed | Dev, разработка | разработчик |
| **Dev/CI** | (CI only) | main | ephemeral | Run tests | CI runner |
| **Staging** | staging.ismeta.august.ru | staging | anonymized prod | Pre-prod validation | team + dogfood |
| **Production** | ismeta.august.ru | production | real | Live users | customers |

## 2. Local

### 2.1 Инфра

- Machine: разработчик.
- OS: любая (Linux, macOS, Windows/WSL).
- Compose: локальный Postgres + Redis + ISMeta + mocks (optional).
- Ресурсы: 4 CPU, 8 GB RAM, 20 GB disk.

### 2.2 Данные

- `make ismeta-seed` — фикстуры.
- 2 workspace (для multi-tenancy testing).
- Синтетические смёты.
- Mock-сервисы (recognition, erp-catalog).

### 2.3 Секреты

- `.env.local` (не в git).
- Dev-значения (ничего ценного).
- Dev LLM-ключ с лимитом 5K ₽/мес.

### 2.4 Access

- Каждый разработчик.

### 2.5 Reset

- `make ismeta-db-reset` — с нуля.
- `make ismeta-clean` — удаление всего.

---

## 3. Dev/CI

### 3.1 Инфра

- GitHub Actions runners (или self-hosted).
- Ephemeral — поднимается для каждого PR.
- PostgreSQL in-Docker.
- Redis in-Docker.

### 3.2 Данные

- Фикстуры из `backend/tests/fixtures/`.
- Multi-tenancy data.
- Удаляется после CI run.

### 3.3 Секреты

- Secrets GitHub Actions (отдельные для CI).
- Mock LLM endpoints (cassettes).

### 3.4 Access

- GitHub Actions.
- Логи доступны разработчикам.

### 3.5 Use cases

- Unit tests.
- Integration tests.
- Pact contract tests.
- Lint + static analysis.
- OpenAPI validation.
- Migration reversibility check.

---

## 4. Staging

### 4.1 Инфра

- Сервер: TBD (отдельный от production).
- Hosted: Yandex Cloud (рекомендуется).
- Спецификации:
  - 2-4 CPU.
  - 4-8 GB RAM.
  - 50 GB disk.
  - Managed Postgres.
  - Managed Redis.
- Docker Compose.

### 4.2 Данные

- Анонимизированный снимок prod data.
- Обновление: раз в неделю (ручное или automated).
- Retention: 30 дней ротация.

### 4.3 Секреты

- `.env.staging.enc` (SOPS).
- Отдельные LLM ключи (не production).
- Staging Sentry DSN.

### 4.4 Access

- Вся команда через VPN.
- Dogfood пользователи (реальные сметчики для тестирования).

### 4.5 Use cases

- Pre-deploy validation.
- QA testing.
- Demo для клиентов (в early stage).
- Load testing (careful).
- Integration testing с реальными external services.

### 4.6 SLO

- Uptime: 95% (не 99%).
- Breakage expected sometimes.

### 4.7 Deploy

- Auto-deploy из `main` branch при успешном CI.
- Tag: `staging-YYYY-MM-DD-<commit>`.

---

## 5. Production

### 5.1 Инфра

- Сервер: TBD (Yandex Cloud или dedicated).
- Спецификации (gypothesis, уточнить через load test):
  - 4-8 CPU.
  - 16 GB RAM.
  - 200 GB disk (expandable).
  - Managed Postgres with replica.
  - Managed Redis with backup.
  - Object storage для файлов.
- Docker Compose (пока не k8s).

### 5.2 Данные

- Real customer data.
- Full backup schedule:
  - pg_dump ежедневно.
  - wal-g каждые 15 минут.
- Retention: 30 дней hot, 365 дней cold.

### 5.3 Секреты

- `.env.production.enc` (SOPS).
- Production LLM keys (с бюджетами).
- Production Sentry DSN.
- Monitoring credentials.

### 5.4 Access

- Development: через staging → production promote.
- Runtime SSH: только DevOps + техлид (MFA).
- DB direct: только DevOps (emergency).
- Admin panel: instance_admin role.
- On-call rotation.

### 5.5 Use cases

- Live customer traffic.
- No testing (only monitoring).
- No direct debugging (reproduce in staging).

### 5.6 SLO

- Uptime: 99.5% (см. `SLO.md`).
- Response time: P95 < 500ms.
- Error rate: < 1% 5xx.

### 5.7 Deploy

- Manual trigger от `production` branch.
- Approval from Tech Lead required.
- Blue-green deployment (когда реализуем).
- Rollback procedure tested.

---

## 6. Parity matrix

Что отличается между environments (должно минимизироваться):

| Feature | Local | CI | Staging | Prod |
|---|---|---|---|---|
| Django DEBUG | True | False | False | False |
| Postgres version | 14+ | 14 | 14 | 14 |
| Redis version | 7+ | 7 | 7 | 7 |
| LLM provider | dev key | mock | real (limited) | real |
| ERP connection | mock OR real | mock | real | real |
| HTTPS | no | no | yes | yes |
| CDN | no | no | optional | yes |
| Backup | no | no | weekly | every 15 min |
| Monitoring | minimal | none | full | full + alerts |
| Real users | no | no | dogfood | yes |

**Цель:** различия минимальны и задокументированы. Особенно Postgres/Redis versions — должны совпадать точно.

---

## 7. Promotion workflow

```
Local (разработчик)
   ↓ (commit, PR)
CI (автотесты)
   ↓ (merge to main)
Staging (auto-deploy)
   ↓ (manual smoke test + approval)
Production (manual promote)
```

### 7.1 Local → CI

- Разработчик pushes branch.
- GitHub Actions запускает tests.
- Green CI + review → merge to main.

### 7.2 CI (main) → Staging

- Автоматически после merge.
- Deploy скрипт в CI.
- Post-deploy smoke test.
- Уведомление в `#ismeta-dev`.

### 7.3 Staging → Production

- Manual. После:
  - 24 часа stable staging.
  - Tech Lead approval.
  - Release notes готовы.
  - DB backup snapshot.
- Merge staging → production branch.
- Deploy via `make release-to-production`.
- Post-deploy verification (hardening-checklist §17).

---

## 8. Data refresh

### 8.1 Production → Staging (раз в неделю)

```bash
# На prod
pg_dump --data-only ismeta_prod > /tmp/prod_data.sql

# Anonymize
python tools/anonymize.py /tmp/prod_data.sql > /tmp/anon_data.sql

# Copy to staging
scp /tmp/anon_data.sql staging:/tmp/

# On staging
psql ismeta_staging < /tmp/anon_data.sql
```

### 8.2 Staging → Local (по требованию)

Для тестирования real-size data:
- SQL dump из staging.
- `make ismeta-load-staging-data`.

### 8.3 Anonymization rules

- Email: `user1@example.com`, `user2@example.com`, ...
- Phone: `+7 (XXX) XXX-XXXX`.
- Counterparty names: `Counterparty 1`, `Counterparty 2`, ...
- Object names: `Object 1`, `Object 2`, ...
- Внутренние поля (цены, ТТХ) — не anonymize.

---

## 9. Disaster recovery paths

| Scenario | Action |
|---|---|
| Local broken | `make ismeta-db-reset` |
| Staging broken | Auto re-deploy from main |
| Production degraded | Rollback to previous release |
| Production data loss | Restore from backup (см. runbook) |

---

## 10. Environment variables

Каждый env имеет свой `.env.<env>` файл. Источник — `backend/.env.example` + переопределения.

### 10.1 Общие переменные

Все envs имеют:
- `DATABASE_URL`, `REDIS_URL`
- `DJANGO_SECRET_KEY`
- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- LLM configuration.

### 10.2 Env-specific

| Variable | Local | Staging | Prod |
|---|---|---|---|
| `DEBUG` | 1 | 0 | 0 |
| `SECURE_SSL_REDIRECT` | 0 | 1 | 1 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | localhost:4318 | staging-otel | prod-otel |
| `SENTRY_ENVIRONMENT` | local | staging | production |
| `LLM_MONTHLY_BUDGET_RUB` | 5000 | 10000 | 100000 |

---

## 11. Access control

### 11.1 VPN

- Staging и production — за VPN (WireGuard или Tailscale).
- VPN access на основе MFA.
- Disable VPN access при offboarding сотрудника — в течение часа.

### 11.2 SSH

- Key-based only.
- Bastion host для production (jump через staging).
- Audit logs of SSH access.

### 11.3 Database access

- Staging: read-only для developers, read-write для QA.
- Production: read-only emergency для техлида, read-write только для миграций через CI.

---

## 12. Monitoring per environment

| Env | Tool | Alerting |
|---|---|---|
| Local | Django debug toolbar | no |
| CI | Job logs | failure in GitHub |
| Staging | Grafana dashboards | Telegram #staging-alerts |
| Production | Grafana + Sentry | Telegram #ismeta-alerts + on-call |

---

## 13. Cost per environment

Budget гипотезы (ежемесячные):

| Env | Compute | Storage | LLM | Monitoring | Total |
|---|---|---|---|---|---|
| Local | 0 | 0 | 5K ₽ | 0 | 5K ₽ |
| CI | 3K ₽ (GA minutes) | 0 | 0 | 0 | 3K ₽ |
| Staging | 15K ₽ | 2K ₽ | 10K ₽ | 3K ₽ | 30K ₽ |
| Production | 30K ₽ | 10K ₽ | 50K ₽ | 10K ₽ | 100K ₽ |

---

## 14. Connected documents

- [`specs/09-dev-setup.md`](../specs/09-dev-setup.md)
- [`specs/13-release-process.md`](../specs/13-release-process.md)
- [`admin/hardening-checklist.md`](./admin/hardening-checklist.md)
- [`SECRET-MANAGEMENT.md`](./SECRET-MANAGEMENT.md)
- [`DR-PLAN.md`](./DR-PLAN.md)
