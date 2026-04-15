# Runbook: Secret Compromised

**Severity:** P0
**Expected frequency:** очень редко (надеемся никогда)

## Симптомы

- Секрет обнаружен в public репо (GitHub, etc.).
- Unauthorized API calls с нашими credentials.
- Подозрительная активность в audit log.
- Украден laptop с age-key.
- Бывший сотрудник с access не уволен корректно.

## Impact

- Potentially **total breach** depending on secret.
- Утечка данных клиентов.
- Финансовые потери (если API key LLM или cloud).
- Compliance violation (152-ФЗ uvedomlenie Роскомнадзор за 24 часа).

## Первые 15 минут

**Критично.** Действовать быстро, не panic.

1. **Declare P0.** Incident channel открыт.
2. **Isolate:**
   - Если secret для API provider — revoke API key немедленно.
   - Если laptop украден — revoke age-key из `.sops.yaml`.
   - Если сотрудник — revoke все credentials.
3. **Generate new secret.**
4. **Deploy new secret** (может потребоваться emergency maintenance).
5. **Audit logs:** что было сделано с compromised secret.

## Действия по типу secret'а

### 1. LLM API key (OpenAI / Gemini / etc.)

**Impact:** unauthorized LLM calls, billing.

1. Revoke в админке провайдера.
2. Generate new.
3. Update в `.env.production.enc` через SOPS.
4. Deploy.
5. Check usage: был ли abuse.
6. Billing team: contest charges если был abuse.

### 2. Database password

**Impact:** потенциальное чтение всех данных.

1. Change password в Postgres:
   ```sql
   ALTER USER ismeta WITH PASSWORD 'new_secure_password';
   ```
2. Update `.env.production.enc`.
3. Restart application (rolling).
4. Audit: SELECT query logs для подозрительной активности.

### 3. Django SECRET_KEY

**Impact:** поддельные sessions, форгерия CSRF.

1. Generate new: `python -c "import secrets; print(secrets.token_urlsafe(50))"`.
2. Update `.env.production.enc`.
3. Deploy.
4. Warning: все пользователи разлогинены. Broadcast сообщение.

### 4. JWT private key

**Impact:** подделка JWT всех пользователей.

1. Generate new RSA pair:
   ```bash
   openssl genrsa -out private.pem 4096
   openssl rsa -in private.pem -pubout -out public.pem
   ```
2. Update в `.env.production.enc` + public key в ISMeta.
3. Deploy.
4. Все access tokens invalidated — пользователи должны re-login.
5. Revoke всех существующих refresh tokens.

### 5. Webhook HMAC secret (ERP ↔ ISMeta)

**Impact:** поддельные webhook'и.

1. Dual-secret mode (temporary):
   - Accept both старый и новый.
2. Rotate в ERP → webhook'и идут с новой подписью.
3. После 24 часа — remove старый.

### 6. Age-key (SOPS)

**Impact:** тот, у кого key, видит все secrets.

1. Generate new age-key для замены.
2. Update `.sops.yaml` — remove compromised key, add new.
3. `sops updatekeys` для всех `.env.*.enc`.
4. Commit.
5. Laptop восстановлен → старый key больше не нужен (но всё равно считается compromised).

### 7. Master-token (service-to-service)

**Impact:** service может impersonate.

1. Generate new.
2. Rotate в ERP first.
3. Update в ISMeta.
4. Verify всё работает.

### 8. GitHub Actions secrets

**Impact:** CI pipeline compromised.

1. Rotate в GitHub settings.
2. Audit recent workflows для подозрительной активности.
3. Review deployments.

---

## 152-ФЗ / GDPR compliance

Если compromise ведёт к утечке ПДн:

### В течение 24 часов

- Notify Роскомнадзор (для РФ-клиентов).
- Document incident officially.

### В течение 72 часов

- Notify affected users (если им грозит вред).
- Public disclosure (на сайте / status page).

### Documentation

- Полный timeline.
- Меры по устранению.
- Меры по предотвращению.

---

## Audit checklist

После rotation — проверить, что **ничего не пропущено**:

- [ ] Production deployment обновлён.
- [ ] Staging обновлён.
- [ ] Все репликации / replicas.
- [ ] Backup scripts обновлены.
- [ ] CI/CD secrets.
- [ ] External integrations (webhook URLs).
- [ ] Monitoring credentials.
- [ ] Third-party services (Sentry, S3).

---

## Forensics

После immediate response:

1. **Timeline:** когда compromised, когда обнаружен, когда rotated.
2. **Access:** что attacker смог сделать.
3. **Scope:** одного user'а или systemic.
4. **Exfiltration:** были ли выгружены данные.
5. **Persistence:** установлен ли backdoor.

## Communication

### Internal

```
[ISMETA] Security Incident
Type: Secret compromise
Secret: {type}
Scope: {scope}
Action taken: {rotated at HH:MM}
Investigation ongoing.
```

### External (при data breach)

```
Dear customer,

We detected unauthorized access to our system at HH:MM UTC on DATE.

What happened: [honest explanation].
What data: [specific fields].
What we did: rotated credentials, investigating scope.
What you should do: [specific actions for them].

We'll update you within 24 hours with full details.

Contact: security@...
```

---

## Post-mortem обязательно

Полный postmortem в 7 дней. Включает:
- Root cause.
- Как long compromised before detection.
- Systemic issues (не human fault).
- Prevention measures.
- Process improvements.

Rare events = важные lessons.

---

## Prevention

- Pre-commit hooks для detecting secrets.
- CI scans на leaked secrets.
- Regular access review.
- Principle of least privilege.
- MFA everywhere.
- Time-limited credentials где возможно.
- Offboarding checklist для уходящих сотрудников.

---

## Связанные

- [`../SECRET-MANAGEMENT.md §8`](../SECRET-MANAGEMENT.md)
- [`../COMPLIANCE-MATRIX.md §7`](../COMPLIANCE-MATRIX.md)
- [`../SECURITY-REVIEW.md §C`](../SECURITY-REVIEW.md)
