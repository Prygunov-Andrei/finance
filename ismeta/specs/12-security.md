# 12. Безопасность

**Версия:** 0.1. **Назначение:** секреты, периметр, бэкапы, антивирус, аудит, ответы на типовые угрозы.

## 1. Классификация данных

| Класс | Примеры | Требования |
|---|---|---|
| **Конфиденциальные** | API-ключи LLM, master-token ERP, пароли | шифрование at-rest в секрет-менеджере; никогда в git, никогда в логах |
| **Коммерческая тайна** | Закупочные цены, маржа, ProductKnowledge | шифрованное хранение БД (at-rest), TLS в транзите, доступ только у authorized workspace |
| **Персональные данные** | Email посетителей публичного режима | минимум необходимого, удаление по запросу, 152-ФЗ для РФ (см. §10) |
| **Служебные** | Аудит-лог, метрики | обычная защита уровня Workspace |
| **Публичные** | РРЦ, контакты Августа | никаких ограничений |

## 2. Секреты

### 2.1 Где хранятся

| Окружение | Механизм | Комментарий |
|---|---|---|
| Локальная разработка | `.env.local`, в `.gitignore` | см. `backend/.env.example` |
| Staging/Production (наш инстанс) | **Выбрано: SOPS с age-ключами + хранение в git (зашифрованное)** | решение зафиксировано на старте этапа 1; Vault/AWS Secrets Manager — в backlog на случай сложных сценариев ротации |
| Коробка у клиента | шифрованный `.env.production` + SOPS-ключ на стороне клиента + инструкция по ротации | Admin Guide описывает процесс |

### 2.2 Ротация

| Секрет | Период ротации |
|---|---|
| `ERP_MASTER_TOKEN` | 180 дней или при увольнении devops |
| `ERP_WEBHOOK_SECRET` | 90 дней |
| LLM API-ключи | при компрометации или раз в год |
| JWT signing key | при компрометации |
| Пароли БД | раз в год |

Процедура ротации — см. `docs/ismeta/admin/secret-rotation.md`.

### 2.3 Что никогда не коммитится

- Файлы `.env.local`, `.env.production` (в `.gitignore`).
- Дампы БД.
- Content cassette-тестов с реальными API-ключами (прогоняется через `git-secrets` на pre-commit).

## 3. Авторизация и аутентификация

### 3.1 Пользователи ISMeta

Два контура пользователей:
- **ERP-пользователи** — авторизуются в ERP, получают JWT от `/api/erp-auth/v1/ismeta/issue-jwt`, ISMeta доверяет этим JWT по shared-signing-key.
- **Standalone-пользователи** — авторизуются напрямую в ISMeta через email+password (для коробки без ERP). TBD: в MVP этот сценарий не используется.

### 3.2 JWT

- Алгоритм: RS256 (асимметричное подписание, у ISMeta только public-key для верификации).
- Claim'ы: `sub` (user_id), `wsp` (workspace_id), `role`, `iat`, `exp`.
- Access TTL: 15 минут.
- Refresh TTL: 8 часов.
- Refresh-flow через `POST /api/v1/auth/refresh` — возврат пары.

### 3.3 Роли

| Роль | Доступ |
|---|---|
| `admin` | полный CRUD, настройки workspace, ProductKnowledge review |
| `estimator` | CRUD смет, чат, transmission |
| `viewer` | read-only |
| `api` | service-to-service: viewing and specific mutations |
| `instance_admin` | (супер-админ, только на нашей инсталляции) — видит все workspace |

### 3.4 Multi-tenancy enforcement

- Каждый DRF ViewSet имеет обязательный FilterBackend `WorkspaceFilter`.
- Middleware вытаскивает `workspace_id` из JWT → кладёт в `request.workspace_id`.
- Любой запрос без `workspace_id` → 401.
- Любая модель, запрошенная с `workspace_id != request.workspace_id` → 404 (не 403, чтобы не светить существование).
- Автотесты: `test_cross_workspace_access_denied` для каждого ViewSet.

### 3.5 Доступ администратора Instance

- Роль `instance_admin` — только у нашей команды support на нашей инсталляции.
- В коробке у клиента `instance_admin` = конкретный user, которого определяет клиент при установке.
- Все действия `instance_admin` пишутся в AuditLog с source=`instance_admin` и повышенным retention (5 лет).

## 4. Сетевой периметр

### 4.1 ERP ↔ ISMeta

- **В нашей инсталляции:** ERP и ISMeta в одном VPN, общение по внутренним адресам.
- **В коробке у клиента:** ERP и ISMeta разворачиваются в одной приватной сети; трафик не выходит наружу.

### 4.2 Webhook'и ERP → ISMeta

- Приём только по HTTPS.
- IP allow-list: только IP-адреса известного ERP-инстанса.
- Обязательная HMAC-подпись `X-Webhook-Signature`.
- Replay-защита: отклонение запросов старше 5 минут по `X-Webhook-Timestamp`.
- Идемпотентность по `X-Webhook-Event-Id`.

### 4.3 Исходящие запросы ISMeta

- ISMeta → ERP Catalog API: HTTPS + Bearer-токен.
- ISMeta → Recognition: HTTPS + Bearer-токен.
- ISMeta → LLM-провайдер: HTTPS + API-ключ провайдера (не делится между workspace в MVP).

### 4.4 Публичный режим

- За edge (Cloudflare/аналог): DDoS-защита, WAF-правила.
- CAPTCHA на чувствительных endpoints (OTP, загрузка файла).
- Rate limit per IP и per email (см. `10-public-mode.md §4`).
- CORS: только для известных origin'ов.

## 5. Загружаемые файлы

### 5.1 Антивирус

- Каждый загруженный файл сканируется **до** распаковки.
- В MVP — **ClamAV** (решение зафиксировано на старте этапа 1): бесплатно, адекватно для офисных документов, Docker-образ `clamav/clamav` ставится в compose.
- Если антивирус недоступен — файл отклоняется (fail-closed).
- Результаты сканирования логируются в `ImportSession.av_scan_result`.
- Обновление сигнатур — через стандартный `freshclam`, daily cron.

### 5.2 Sandboxing

- Загруженные файлы хранятся в изолированной директории с квотами (`/var/ismeta/uploads/{workspace_id}/...`).
- TTL файлов: 30 дней для успешных, 7 дней для отклонённых.
- Прямой доступ к файлам через web — запрещён. Только через API с check на workspace.

### 5.3 Лимиты

| Параметр | Значение |
|---|---|
| Максимальный размер файла | 50 МБ (sметчики), 20 МБ (публичный) |
| Максимальное число файлов на заявку | 20 (сметчики), 5 (публичный) |
| Поддерживаемые форматы | .xlsx, .xls (только чтение через libreoffice headless), .pdf |
| Запрещённые форматы | всё остальное |

## 6. БД: шифрование и бэкапы

### 6.1 Шифрование

- **At-rest:** полнодисковое шифрование на хосте БД (LUKS / AWS EBS encryption / аналог).
- **In-transit:** TLS между ISMeta и Postgres.

### 6.2 Бэкапы

- **Полный дамп:** `pg_dump --format=custom` раз в сутки, хранится 30 дней в S3 с версионированием.
- **Incremental:** `wal-g` или `pgBackRest`, каждые 15 минут WAL в S3.
- **Тестовое восстановление:** раз в месяц в staging из свежего бэкапа, прогон smoke-теста.
- **Recovery point objective (RPO):** 15 минут.
- **Recovery time objective (RTO):** 2 часа.

### 6.3 Бэкап файлов

- `/var/ismeta/uploads/` — ежедневно rclone в S3.
- `data/knowledge/` (.md-файлы) — через git: отдельный приватный репо, auto-commit раз в час.

### 6.4 В коробке у клиента

- Бэкап — ответственность клиента.
- Admin Guide описывает: как делать бэкап, как восстанавливать, как тестировать.
- Поставляется скрипт `tools/backup.sh` с примером.

## 7. Аудит

### 7.1 AuditLog ISMeta

- Полный журнал изменений (см. `01-data-model.md §8.1`).
- Срок — 1 год.
- Доступ — read-only через API для admin роли.

### 7.2 Журналы доступа

- Все HTTP-запросы пишутся в nginx access log с `user_id`, `workspace_id`, `request_id`.
- Уровень: INFO. Ротация раз в сутки, 30 дней хранения.
- ERROR — отдельный канал, agregates в Sentry/аналог.

### 7.3 Журналы LLM

- Все вызовы в LLMUsage — для биллинга и отладки.
- `prompt` и `response` НЕ логируются полностью (могут содержать чувствительные данные); логируются хэши.
- По запросу аудитора (admin role) — full log можно включить временно для одного workspace (feature flag `llm_full_logs_workspace=...`, TTL 24 часа).

## 8. Защита от OWASP Top 10

| Риск | Митигация |
|---|---|
| **A01 Broken Access Control** | Multi-tenancy middleware, DRF permissions, regression tests |
| **A02 Cryptographic Failures** | TLS повсюду, ключи в secret-manager, HTTPS only |
| **A03 Injection** | Django ORM (запрет raw SQL), Pydantic-валидация входов, HTML escaping в рендере PDF |
| **A04 Insecure Design** | Этот документ, ревью архитектурных решений |
| **A05 Security Misconfiguration** | CI scan на Django settings (`manage.py check --deploy`), pre-commit hooks |
| **A06 Vulnerable Components** | Dependabot / Renovate, еженедельное обновление, security-only auto-merge |
| **A07 Identification and Authentication Failures** | JWT с коротким TTL, OTP с rate-limit, refresh-flow с revocation |
| **A08 Software and Data Integrity Failures** | Webhook signatures, pact-tests, semver API |
| **A09 Security Logging and Monitoring Failures** | Sentry, AuditLog, алерты |
| **A10 SSRF** | Белый список URL для outbound запросов (ERP, LLM, recognition), никаких `http://internal` вне allow-list |

## 9. Prompt injection защита (LLM)

- User input проходит через regex-guard (список запрещённых паттернов «ignore previous», «system:», «act as»).
- Tool-вызовы валидируются по JSON Schema до исполнения.
- Результаты tool'ов вставляются в prompt как structured JSON, не free-form.
- LLM не имеет доступа к секретам и внутренним endpoint'ам — только публичные API tool'ов.

## 10. Соответствие 152-ФЗ (РФ)

В MVP — **не блокер** (наша внутренняя эксплуатация).

Для коробочных продаж крупным клиентам (этап 3+):
- Обработка ПДн: email посетителей публичного режима.
- Согласие на обработку: чек-бокс на форме ввода email.
- Хранение ПДн: в БД ISMeta, на территории РФ (если клиент РФ).
- Передача в облачный LLM (OpenAI, Gemini) — это передача ПДн третьим лицам. Требует:
  - явного согласия посетителя;
  - ИЛИ использования российского LLM (GigaChat, Yandex GPT, локальный Ollama).
- Право на удаление: endpoint `DELETE /api/public/v1/me` удаляет всё, связанное с email.

## 11. Реагирование на инциденты

### 11.1 Потенциальные инциденты

- Утечка `ERP_MASTER_TOKEN` → немедленная ротация, аудит всех запросов за период.
- Утечка дампа БД → оценка, уведомление клиентов при коробке, ротация всех секретов.
- Подозрительный доступ к workspace (cross-workspace) → блокировка user, аудит.
- Потенциальный malicious upload → сандбокс очищается, файл архивируется для форензики.
- Prompt injection с негативным действием (агент предложил неправильную замену) → разбор в retrospective, обновление guard-правил.

### 11.2 Runbook

В `docs/ismeta/admin/incident-response.md`:
- классификация тяжести (P1/P2/P3);
- контакты дежурных;
- пошаговые инструкции;
- шаблоны коммуникации пользователям.

## 12. Проверки в CI

- `bandit` — Python security lint.
- `safety` / `pip-audit` — уязвимости в зависимостях.
- `npm audit` — для frontend.
- `git-secrets` — pre-commit hook.
- `semgrep` с набором OWASP-правил.
- `django manage.py check --deploy` для production settings.

## 13. Внешнее тестирование

- Перед крупным релизом (или ежегодно) — pentest сторонней командой.
- Bug bounty — рассмотреть при наличии коробочных клиентов (этап 3+).

## 14. Обучение команды

- Новый разработчик проходит `docs/ismeta/dev/security-onboarding.md` в первую неделю.
- Ежегодный review security-практик командой.
