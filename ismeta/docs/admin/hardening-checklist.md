# Production Hardening Checklist

**Версия:** 0.1. **Дата:** 2026-04-15. **Источник:** Security ревью B5.

Обязательный чек-лист перед деплоем ISMeta в production. Проходить полностью для каждого нового environment (наш production, коробочные клиенты).

## 1. Application settings

### Django settings.py

- [ ] `DEBUG = False`.
- [ ] `SECRET_KEY` — из secret manager, длина ≥ 50 символов, не дефолтный.
- [ ] `ALLOWED_HOSTS` — явный список доменов, не `['*']`.
- [ ] `SECURE_SSL_REDIRECT = True`.
- [ ] `SESSION_COOKIE_SECURE = True`.
- [ ] `CSRF_COOKIE_SECURE = True`.
- [ ] `SECURE_HSTS_SECONDS = 31536000` (1 год).
- [ ] `SECURE_HSTS_INCLUDE_SUBDOMAINS = True`.
- [ ] `SECURE_HSTS_PRELOAD = True`.
- [ ] `SECURE_CONTENT_TYPE_NOSNIFF = True`.
- [ ] `X_FRAME_OPTIONS = 'DENY'` (если не embedding).
- [ ] `SECURE_REFERRER_POLICY = 'same-origin'`.
- [ ] `CORS_ALLOWED_ORIGINS` — явный список, не `['*']`.
- [ ] `CSRF_TRUSTED_ORIGINS` — явный список.

### Проверка

```bash
python manage.py check --deploy
# Ожидаемый output: System check identified 0 issues.
```

---

## 2. Secrets

- [ ] Никаких secrets в git (даже в encrypted form — только SOPS .enc файлы).
- [ ] `.env.production` НЕ на диске в plaintext (расшифровывается SOPS → tmpfs).
- [ ] API keys не логируются (PII masking middleware).
- [ ] Pre-commit hook `detect-secrets` active.
- [ ] SOPS age-keys защищены (только у authorized людей).
- [ ] Database password ≥ 32 символа.
- [ ] JWT RSA key ≥ 2048 bit.

---

## 3. Database

- [ ] PostgreSQL версия ≥ 14.
- [ ] TLS-соединение между app и DB (`sslmode=require`).
- [ ] DB user для app — минимум privileges (SELECT, INSERT, UPDATE, DELETE, no DROP/CREATE/ALTER на продакшене, кроме migrations).
- [ ] Миграционный user — отдельный.
- [ ] Backup user — отдельный с read-only.
- [ ] Disk encryption enabled на хосте БД.
- [ ] Backup regular (см. `docs/runbooks/backup-failed.md`).
- [ ] Point-in-time recovery работает (tested через drill).
- [ ] `pg_stat_statements` enabled для мониторинга.
- [ ] Connection pooling (pgbouncer или аналог).

---

## 4. Container

### Dockerfile

- [ ] Non-root user: `USER appuser`.
- [ ] Минимальный base image (python:3.12-slim или distroless).
- [ ] No `apt-get install` в runtime image (только build).
- [ ] Multi-stage build.
- [ ] `.dockerignore` исключает git, secrets, cache.
- [ ] `HEALTHCHECK` directive.
- [ ] Read-only root filesystem где возможно.

### Docker Compose

- [ ] Все services в отдельных networks.
- [ ] Public-facing services за reverse proxy (nginx/Traefik).
- [ ] Health checks defined.
- [ ] Restart policy `unless-stopped`.
- [ ] Volumes mounted read-only где возможно.
- [ ] No `privileged: true`.
- [ ] Resource limits (CPU, memory).

### Проверка

```bash
# Scan image for vulnerabilities
trivy image ismeta:latest

# Check docker-compose config
docker compose config
```

---

## 5. Network

### Reverse proxy (nginx)

- [ ] TLS 1.2+ (disable TLS 1.0, 1.1).
- [ ] Strong ciphers only (no RC4, DES, 3DES).
- [ ] HTTP/2 enabled.
- [ ] Let's Encrypt certs с auto-renewal.
- [ ] Rate limiting на public endpoints.
- [ ] Upload size limit (50MB).
- [ ] Request timeout configured (30s для API, 5min для LLM endpoints).
- [ ] Client IP preserved (X-Forwarded-For).

### Firewall

- [ ] Inbound: только 22 (SSH, IP whitelist), 80 (redirect), 443.
- [ ] Outbound: whitelist для LLM providers (api.openai.com, ...).
- [ ] SSH: key-based auth only, disable password auth.
- [ ] SSH: fail2ban.
- [ ] SSH: PermitRootLogin no.

### Webhook receiver

- [ ] HMAC-signature verification active.
- [ ] IP allow-list для ERP.
- [ ] Timestamp replay protection (5 minutes window).
- [ ] Rate limit per event_id (idempotency).

---

## 6. Monitoring

- [ ] Prometheus or equivalent метрики exported.
- [ ] Grafana dashboards setup.
- [ ] Alertmanager configured.
- [ ] Critical alerts → Telegram / PagerDuty.
- [ ] Log aggregation (Loki, Elastic или equivalent).
- [ ] Structured JSON logs.
- [ ] PII masking в логах active.
- [ ] Sentry DSN configured для error tracking.
- [ ] OpenTelemetry collector running.
- [ ] Uptime monitoring (external — UptimeRobot или аналог).

---

## 7. Access control

- [ ] Admin access through MFA (TOTP).
- [ ] SSH keys rotated annually.
- [ ] Deploy tokens in CI — ограниченный scope.
- [ ] Production SSH access — только лидерству + DevOps.
- [ ] audit.log для privileged actions.

---

## 8. Data

- [ ] Backup работает (pg_dump + wal-g).
- [ ] Backup restore drill прошёл (раз в месяц).
- [ ] Backup stored в другом регионе (S3 cross-region).
- [ ] Sensitive columns encrypted (LLM API keys в Workspace.settings).
- [ ] Data retention enforced (AuditLog 1 год через партиции).
- [ ] Deletion procedure для data export при off-boarding.

---

## 9. Dependencies

- [ ] `pip-audit` passed в CI.
- [ ] `npm audit` passed в CI.
- [ ] Dependabot / Renovate configured.
- [ ] Security patches auto-merge для patch-version.
- [ ] SBOM generated at build.
- [ ] No `latest` tags в Docker images — explicit versions.

---

## 10. Application behavior

- [ ] Rate limits на auth endpoints (login, OTP).
- [ ] Rate limits на expensive endpoints (LLM, export).
- [ ] CSRF protection active.
- [ ] SQL injection защита (ORM only, no raw SQL).
- [ ] XSS защита (Django templates escape).
- [ ] Open Redirect protection.
- [ ] File upload validation (MIME type, size, AV scan).
- [ ] 404 вместо 403 для multi-tenancy (no info disclosure).

---

## 11. Logging & Audit

- [ ] Access logs 90 дней.
- [ ] Error logs 365 дней.
- [ ] AuditLog 1 год (5 лет для instance_admin actions).
- [ ] Log rotation automated.
- [ ] Logs в immutable archive (S3 with versioning).
- [ ] No secrets в логах.
- [ ] trace_id in every log.

---

## 12. CI/CD

- [ ] Все tests проходят.
- [ ] Migrations reversibility tested.
- [ ] Secret scanning в CI (detect-secrets).
- [ ] SAST (Bandit, Semgrep).
- [ ] DAST (OWASP ZAP) на staging.
- [ ] Container scanning (Trivy).
- [ ] Deploy требует approval для production.
- [ ] Rollback procedure tested.

---

## 13. Compliance

- [ ] Privacy Policy на сайте (если public mode).
- [ ] Terms of Service на сайте.
- [ ] GDPR / 152-ФЗ requirements addressed.
- [ ] Data residency documented (см. `DATA-RESIDENCY.md`).
- [ ] DPO contact доступен.

---

## 14. Incident response

- [ ] Runbooks published and tested.
- [ ] On-call rotation defined.
- [ ] Incident channel active.
- [ ] Status page setup (для customer communication).
- [ ] Postmortem template ready.

---

## 15. Documentation

- [ ] `docs/admin/deployment.md` — как развернуть.
- [ ] `docs/admin/backup.md` — как бэкапить.
- [ ] `docs/admin/restore.md` — как восстановить.
- [ ] `docs/admin/upgrade.md` — как обновлять.
- [ ] `docs/admin/troubleshooting.md` — типовые проблемы.
- [ ] Changelog с breaking changes.

---

## 16. Pre-deploy final check

За 24 часа до deploy:

- [ ] Все items выше выполнены.
- [ ] Rollback plan документирован.
- [ ] Database snapshot снят.
- [ ] Communication templates готовы.
- [ ] On-call знает о deploy.
- [ ] Maintenance window уведомлён клиентам (если applicable).

---

## 17. Post-deploy verification

После deploy (в первые 30 минут):

- [ ] Health checks зелёные.
- [ ] Key metrics в норме.
- [ ] Нет новых 5xx.
- [ ] Smoke test прошёл.
- [ ] Customer-facing endpoints работают.
- [ ] Webhook flow работает (test event).
- [ ] LLM integration работает (dev test).

---

## 18. Sign-off

Документ за signatures перед production:

- [ ] Tech Lead: _______________________
- [ ] Security: _______________________
- [ ] DevOps: _______________________
- [ ] PO: _______________________
- [ ] Date: _______________________

---

## 19. Связанные документы

- [`specs/12-security.md`](../../specs/12-security.md)
- [`specs/13-release-process.md`](../../specs/13-release-process.md)
- [`SECURITY-REVIEW.md`](../SECURITY-REVIEW.md)
- [`SECRET-MANAGEMENT.md`](../SECRET-MANAGEMENT.md)
