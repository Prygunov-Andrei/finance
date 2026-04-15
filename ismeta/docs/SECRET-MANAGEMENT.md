# Secret Management

**Версия:** 0.1. **Дата:** 2026-04-15. **Источник:** Security ревью C.

Полный lifecycle секретов в ISMeta: создание, хранение, использование, ротация, уничтожение.

## 0. Инструмент

**SOPS + age** (выбрано в ADR и `specs/12-security.md`).

- SOPS — шифрование файлов.
- age — ключи шифрования (современнее, чем GPG).
- Зашифрованные файлы — в git.
- Приватные ключи age — **НЕ в git**, в `~/.config/sops/age/keys.txt` у каждого уполномоченного.

## 1. Каталог секретов

### 1.1 Локальная разработка

Все в `backend/.env.local` и `frontend/.env.local`, в `.gitignore`.

| Секрет | Источник |
|---|---|
| `DJANGO_SECRET_KEY` | Случайный |
| `DATABASE_URL` | Локальный postgres |
| `REDIS_URL` | Локальный redis |
| `ERP_MASTER_TOKEN` | Dev-значение, захардкожено |
| `ERP_WEBHOOK_SECRET` | Dev-значение, захардкожено |
| `OPENAI_API_KEY` | Dev-ключ, лимит 5К ₽/мес |
| `GEMINI_API_KEY` | Dev-ключ |
| `SENTRY_DSN` | Sentry проект для dev |

### 1.2 Staging

`.env.staging.enc` в git, расшифровывается SOPS на старте сервиса.

| Секрет | Источник |
|---|---|
| Все из dev | Staging-значения |
| `ISMETA_BACKUP_S3_KEY` | Yandex Object Storage |
| `ISMETA_JWT_PRIVATE_KEY` | Сгенерирован |
| `ISMETA_WEBHOOK_SIGNING_KEY` | Сгенерирован |
| Monitoring credentials | Grafana, Alertmanager |

### 1.3 Production

`.env.production.enc` в git с более строгими age-keys.

| Секрет | Критичность |
|---|---|
| Все из staging | Более строгие значения |
| Production LLM keys | Высокая |
| Production DB credentials | Критическая |
| Production backup keys | Критическая |

### 1.4 Коробка клиента

- Клиент генерирует свои age-keys.
- Клиент сам управляет `.env.production.enc`.
- Мы отдаём шаблон с placeholders.

---

## 2. Создание

### 2.1 Новый секрет

1. Генерация: `openssl rand -hex 32` или соответствующий tool для типа.
2. Добавление в `.env.<env>.enc`:
   ```bash
   sops --encrypt --in-place .env.staging.enc
   # отредактировать, добавить строку
   sops --encrypt --in-place .env.staging.enc
   ```
3. Commit в git (зашифрованный файл).
4. Документирование в этом файле + в соответствующем `.env.example`.

### 2.2 Новый age-key (для нового сотрудника)

1. Сотрудник генерирует: `age-keygen -o keys.txt`.
2. Сотрудник даёт public key.
3. Existing keeper добавляет public в `.sops.yaml`:
   ```yaml
   creation_rules:
     - path_regex: \.env\.staging\.enc$
       age: >-
         age1ql...,age1new...
   ```
4. Пере-шифровать существующие файлы:
   ```bash
   sops updatekeys .env.staging.enc
   ```
5. Commit.

### 2.3 Staging vs Production сегрегация

- Staging keys: можно у всех разработчиков.
- Production keys: только у DevOps + техлид.

---

## 3. Хранение

### 3.1 В git

- `.env.<env>.enc` — зашифрованные, в git.
- `.sops.yaml` — конфиг (public keys), в git.
- `.env.*` без .enc — в `.gitignore`.

### 3.2 Приватные ключи

- `~/.config/sops/age/keys.txt` на каждой машине с доступом.
- **НЕ копируется между машинами.**
- **НЕ в git.**
- Backup приватного ключа — на ваше усмотрение (USB-накопитель, 1Password, etc.).

### 3.3 Secrets в running containers

- При старте: entrypoint script делает `sops --decrypt .env.<env>.enc > .env`.
- Django читает из `.env`.
- После старта `.env` можно удалить из контейнера (tmpfs).

---

## 4. Использование

### 4.1 Dev

Разработчик копирует `.env.example → .env.local`, заполняет значения.

### 4.2 Staging/Production

```bash
# В CI pipeline перед deploy:
sops --decrypt .env.staging.enc > .env
docker compose --env-file .env up -d

# Удалить .env после запуска:
rm .env
```

### 4.3 Доступ к secrets внутри кода

```python
from decouple import config

OPENAI_API_KEY = config("OPENAI_API_KEY")
```

Никогда не hardcode. Никогда не логировать.

---

## 5. Ротация

### 5.1 Расписание

| Секрет | Ротация |
|---|---|
| `DJANGO_SECRET_KEY` | При компрометации |
| `JWT_PRIVATE_KEY` | Ежегодно + при компрометации |
| `ERP_MASTER_TOKEN` | Каждые 180 дней |
| `ERP_WEBHOOK_SECRET` | Каждые 90 дней |
| LLM API-keys | Ежегодно + при компрометации |
| DB passwords | Ежегодно |

### 5.2 Процедура ротации (ERP_WEBHOOK_SECRET — пример)

**Вариант A: dual-secret (zero-downtime)**

1. Генерируем новый secret.
2. Добавляем в ISMeta второй активный: `ERP_WEBHOOK_SECRET_V2=...`.
3. Обновляем deployment, ISMeta принимает webhook'и с обеими подписями.
4. В ERP — перечеркиваем старый secret на новый (webhook'и идут с новой подписью).
5. Ждём 24 часа: все in-flight webhook'и с V1 обработаны.
6. Удаляем `ERP_WEBHOOK_SECRET_V1` из ISMeta.

**Вариант B: maintenance window (проще)**

1. Остановить ERP webhook выпуск.
2. Заменить secret.
3. Обновить оба сервиса.
4. Запустить снова.
5. Monitor для lost webhooks (polling fallback подхватит).

### 5.3 Emergency rotation (секрет скомпрометирован)

1. Немедленно сгенерировать новый.
2. Немедленно deploy (blue-green если возможно).
3. Следить за access logs — признаки компрометации.
4. Follow-up security incident runbook.

---

## 6. Уничтожение

### 6.1 Когда секрет более не нужен

- Клиент ушёл: все его keys — удалить через SOPS updatekeys.
- Сотрудник уволился: его age public key — удалить из `.sops.yaml`.
- Feature deprecated: связанные с ней secrets — удалить.

### 6.2 Очистка

- SOPS перешифровывает без старого key.
- Old .env копии на серверах — `shred -u`.
- Backup data с secret — повторный шифрование после истечения retention.

---

## 7. Audit

### 7.1 Кто имеет доступ

`docs/SECRETS-ACCESS-LIST.md` (создать, не в публичном доступе):
- Human: список людей с age-keys.
- Machines: сервера с keys.
- Expirations.

### 7.2 Logging

- Каждый decrypt через SOPS логируется в `~/.config/sops/audit.log`.
- На production — логирование на хосте.
- Periodic review (monthly).

### 7.3 Access review

- Раз в квартал — проверка списка имеющих доступ.
- При любом изменении команды — немедленно.

---

## 8. Compromised secret handling

### 8.1 Признаки компрометации

- Секрет виден в public репо (даже случайно commited).
- Unauthorized API calls с нашим токеном.
- Подозрительная активность в логах.
- Stolen laptop с age-key.

### 8.2 Немедленная реакция

1. Rotate секрет (см. §5.3).
2. Revoke API-key у провайдера (если применимо).
3. Audit logs: что было сделано с этим secret'ом.
4. Notify security (или DPO при ПДн).
5. Postmortem.

---

## 9. Best practices

### 9.1 Никогда

- Не коммитьте `.env` без .enc.
- Не пишите secrets в code.
- Не логируйте secrets (middleware для masking).
- Не шлите secrets в email / Slack (только через secure channel).
- Не используйте один secret в нескольких environments.

### 9.2 Всегда

- Используйте .env.example с placeholders.
- Code review — grep на паттерны secrets.
- pre-commit hook с git-secrets / detect-secrets.
- Periodic scan репо на leaked secrets.

### 9.3 Инструменты защиты

```bash
# Pre-commit hook
pip install detect-secrets
detect-secrets scan > .secrets.baseline
detect-secrets-hook --baseline .secrets.baseline <files>

# Manual audit
truffleHog --regex --entropy=False git@github.com:your-org/ismeta
```

---

## 10. Связанные документы

- [`specs/12-security.md §2`](../specs/12-security.md)
- [`SECURITY-REVIEW.md §C`](./SECURITY-REVIEW.md)
- [`runbooks/secret-compromised.md`](./runbooks/secret-compromised.md)
- `.sops.yaml` (в репо, public keys)
- `backend/.env.example` (placeholders)
