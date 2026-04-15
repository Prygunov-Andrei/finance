# Security Engineer ревью ISMeta

**Дата:** 2026-04-15. **Роль ревьюера:** Security Engineer (синтетически). **Версия документа:** 0.1.

Ревью с позиции безопасности: threat modeling, OWASP, compliance, incident response. Фокус — системные угрозы, которые проявятся не в MVP, а при реальной эксплуатации и коробочных продажах.

## 0. Методика

- Threat modeling по STRIDE для основных компонентов.
- OWASP Top 10 подробно.
- Secrets lifecycle.
- Data classification и защита.
- Supply chain security.
- Incident response readiness.

---

## A. Threat Modeling (STRIDE)

Применяю STRIDE к 5 ключевым компонентам: API ISMeta, webhook receiver, LLM-интеграция, загрузка файлов, виджет в ERP.

### A1. Публичный API ISMeta `/api/v1/*`

| Угроза (STRIDE) | Сценарий | Текущая защита | Gap |
|---|---|---|---|
| **S**poofing | Поддельный JWT | RS256, валидация подписи | OK, но нет token revocation list |
| **T**ampering | Изменение body запроса | TLS in-transit | Нет body signature — допустимо для TLS-only трафика |
| **R**epudiation | Клиент отрицает действие | AuditLog с user_id | **Gap:** AuditLog может быть удалён instance_admin'ом без следа |
| **I**nfo disclosure | Кросс-workspace чтение | WorkspaceFilter middleware | OK, но нет фуззинга (IDOR по UUID) |
| **D**oS | Массовые запросы | Нет rate-limit на приватном API | **Gap: критично** |
| **E**levation | Повышение до instance_admin | Role checks | OK, но BreakGlass-процедура не описана |

### A2. Webhook receiver `/api/v1/webhooks/erp`

| Угроза | Сценарий | Защита | Gap |
|---|---|---|---|
| S | Поддельный webhook | HMAC-подпись + timestamp | OK |
| T | Изменён payload | HMAC | OK |
| R | ERP отрицает отправку | `ProcessedEvents` | Только ISMeta-сторона; ERP должна иметь логи исходящих |
| I | Утечка event_id | Очевидный sequential — нет | UUID event_id = непредсказуемый |
| D | Webhook storm | ~~rate-limit~~ | **Gap:** batch processing не реализован |
| E | Privilege escalation через webhook | Webhook только обновляет свои таблицы | OK |

### A3. LLM-интеграция

| Угроза | Сценарий | Защита | Gap |
|---|---|---|---|
| S | Подмена LLM-ответа | TLS к провайдеру | OK для облачных; при локальном Ollama — риск |
| T | Prompt injection в content строки | Guard-регулярки | **Gap:** реальные регулярки не написаны |
| R | LLM дал плохой совет, кто виноват | LLMUsage + ChatMessage | OK для аудита, нет юридической ответственности |
| I | Данные в LLM облако = утечка коммерческой тайны | Не отправляем закупочные | **Gap:** ТТХ оборудования клиента — тоже коммерческая тайна, но отправляем |
| D | Flood LLM-запросов, исчерпание бюджета | Budget-enforcement в LLMUsage | OK |
| E | LLM через tool-use получает больше прав | Tool whitelist | OK, но `propose_change`/`apply_change` в будущем — риск |

### A4. Загрузка файлов (upload)

| Угроза | Сценарий | Защита | Gap |
|---|---|---|---|
| S | Поддельный uploader | JWT auth | OK |
| T | Злонамеренный контент в PDF | ClamAV scanning | OK для известных угроз; zero-day = миф |
| R | Загрузивший отрицает | AuditLog + hash файла | OK |
| I | Чужой файл скачать по URL | Signed URLs с TTL | **Gap:** URL не описаны. Сейчас `source_file` — плоский путь |
| D | Миллион крошечных файлов | Rate limits per user | **Gap:** не описаны |
| E | Через spec-файл RCE | Sandbox в openpyxl/pymupdf | Parsing — в отдельном процессе? Не описано |

### A5. Виджет в ERP (`@ismeta/widget`)

| Угроза | Сценарий | Защита | Gap |
|---|---|---|---|
| S | XSS в виджете → кража JWT | CSP, React escaping | **Gap:** CSP-политика не описана |
| T | Подмена виджета через manipulation | CDN integrity hash (SRI) | **Gap:** не описан |
| R | Действия через виджет — неясно из какого клиента | `X-Client: @ismeta/widget v0.1.0` | Хорошая идея, добавить |
| I | Виджет логирует пользовательский ввод | Нет локального логирования | OK |
| D | Виджет «крутится» и ест память клиента | — | Риск для клиентов с многовкладочным UI |
| E | Виджет получает админские права | JWT с role=viewer | OK |

### Сводка: 10 gap'ов по STRIDE

1. JWT token revocation list.
2. AuditLog tamper protection (instance_admin).
3. IDOR fuzzing тесты.
4. Rate limits на приватном API.
5. Реальные prompt-injection guard'ы.
6. Коммерческая тайна в LLM (ТТХ).
7. Batch-processing webhook storm.
8. Signed URLs для файлов.
9. CSP-политика для виджета.
10. Subresource Integrity для widget bundle.

---

## B. OWASP Top 10 (2021)

### B1. A01 Broken Access Control

**Реализовано:**
- Multi-tenancy через workspace_id.
- Role-based (admin/estimator/viewer).
- DRF permissions.

**Gaps:**
- **Отсутствие IDOR-тестов**: если кто-то подставит чужой UUID в API — мы ругаемся 404 или 403, но есть ли фуззер, проверяющий это?
- **Нет Attribute-Based Access Control** для Folder-level разрешений (сметчик №1 не видит Folder №5 в рамках одного Workspace).
- **Viewer может скачать полный экспорт Excel** — это equivalent export всех данных; не ограничен.

**Что делать:**
- Добавить в acceptance: IDOR-fuzz test на каждый endpoint.
- Folder-level ACL — в backlog для enterprise-клиентов.

### B2. A02 Cryptographic Failures

**Реализовано:**
- TLS everywhere.
- HMAC для webhook.
- JWT RS256.

**Gaps:**
- **Encryption at rest** упомянут в `SECURITY.md`, но не конкретизирован. Диск-шифрование на уровне OS? Postgres TDE? Column-level для sensitive полей?
- **LLM API keys в БД (workspace settings) — шифрование?** Если нет — plaintext доступ для instance_admin + любого с read-access к БД.
- **SOPS ключи age — где хранятся?** В `12-security.md` выбран SOPS, но доступ к age-ключам не описан.

**Что делать:**
- Column-level encryption для `Workspace.settings.llm_api_keys` через pgcrypto или приложенческое шифрование.
- SOPS age-ключи в Hardware Security Module (HSM) или dedicated secret manager.

### B3. A03 Injection

**Реализовано:**
- Django ORM — защита от SQL-инъекций.
- Pydantic для входных схем.

**Gaps:**
- **Raw SQL в places** — в будущем могут появиться. Нужно правило в CI: `grep -r "\.raw(" --include="*.py"`.
- **JSONB операторы в queryset'ах** (`custom_data__key__contains='...'`) могут быть injection-векторами при невалидированном вводе.
- **Prompt injection** в LLM — нет guard'ов.
- **XSS в smart-рендере markdown** (если будет в chat) — не упомянут.

**Что делать:**
- Формализовать prompt guards в `agent/prompts/injection_guard.py`.
- DOMPurify в frontend для user-generated HTML/MD.

### B4. A04 Insecure Design

**Реализовано:**
- ADR для ключевых решений.
- Threat modeling (частично, сейчас дополняю).

**Gaps:**
- **Нет формальной Security Review Board** процедуры: кто утверждает security-sensitive изменения?
- **Нет «abuse case»** для каждой user story. «Happy path» описан, «что, если я злонамеренный пользователь» — нет.

### B5. A05 Security Misconfiguration

**Реализовано:**
- `django manage.py check --deploy` упомянут.
- Bandit, pip-audit в CI.

**Gaps:**
- **Default Django DEBUG=True в skeleton** — в `settings.py` стоит `config("DEBUG", default=False)`, но в `.env.example` `DEBUG=1`. Риск: новый разработчик скопирует `.env.local` на staging.
- **CORS_ALLOW_ALL_ORIGINS = DEBUG** — в production отключено, но в staging при `DEBUG=0` — будет пусто, нужен явный список.
- **nginx / reverse proxy настройки** — не описаны.

**Что делать:**
- Чек-лист deployment hardening в `docs/admin/hardening-checklist.md`.

### B6. A06 Vulnerable Components

**Реализовано:**
- `pip-audit`, `npm audit` в CI.
- Dependabot / Renovate упомянут.

**Gaps:**
- **Нет supply-chain security** beyond dependencies.
- **LLM-модели сами — это «component»**. При смене gpt-4o на gpt-4o-v2 — поведение может деградировать. Никакого version pinning на поведение нет.
- **Docker images pinning** — в Docker Compose для коробки. Используем `latest` или `:specific-version`?

**Что делать:**
- Все Docker images — с конкретными версиями и digest.
- `docs/SECURITY-ADVISORIES.md` — лог уязвимостей зависимостей и реакция.

### B7. A07 Identification and Authentication Failures

**Реализовано:**
- JWT с коротким TTL.
- Refresh flow.

**Gaps:**
- **Нет MFA** для instance_admin. В коробке клиента — admin с одним паролем.
- **OTP в публичном режиме** — правильный паттерн, но нет защиты от «OTP mining» (запрашиваю OTP каждые 10 минут на разные email'ы).
- **Session fixation** при refresh — `refresh_token` ротация не описана.

**Что делать:**
- MFA для admin и instance_admin в этапе 3.
- Rate-limit OTP requests per email per day (упомянут — подтверждаю).
- Refresh-token rotation on use.

### B8. A08 Software and Data Integrity

**Реализовано:**
- Webhook signatures.
- Pact-tests для межсервисных контрактов.

**Gaps:**
- **Нет signing** для релизов ISMeta. Клиент коробки скачивает бандл — как он проверит, что это от нас, а не подделка?
- **Docker image signing** не упомянут. Cosign / Notary.
- **Database integrity** — нет audit-trail на схему (кто и когда менял migrations).

**Что делать:**
- Cosign для всех Docker images.
- GPG-подпись тегов в git.
- SBOM (Software Bill of Materials) — генерируется в CI.

### B9. A09 Security Logging and Monitoring

**Реализовано:**
- AuditLog.
- OpenTelemetry (недавно добавлено).
- Sentry.

**Gaps:**
- **Нет log retention policy** для security-events.
- **AuditLog можно стереть** instance_admin'ом без отдельного лога «кто стёр AuditLog».
- **Brute-force detection** — нет. 100 failed JWT — что делаем?

**Что делать:**
- Immutable append-only лог для security events (отдельная таблица + archive в S3).
- Автоматическая блокировка при подозрительной активности.

### B10. A10 Server-Side Request Forgery

**Реализовано:**
- httpx с явными URL.

**Gaps:**
- **Webhook endpoint принимает payload от ERP** — если ERP скомпрометирована, ISMeta может стать каналом к внутренним системам через вложенные URL (например, в `product.image_url`).
- **Recognition service** скачивает файлы — если payload содержит URL, есть SSRF-вектор.

**Что делать:**
- Whitelist outbound URL схем и хостов.
- DNS-rebinding protection.

---

## C. Secrets lifecycle

### C1. Создание

- **Dev:** `.env.local`, `.gitignore`. OK.
- **Staging/Prod:** SOPS + age, в git. OK.
- **Коробка клиента:** `.env.production` на стороне клиента, без git.

### C2. Ротация

**Gap критичный:**
- HMAC-secret для webhook — как ротировать без простоя?
- LLM API-keys — ротация описана как «раз в 90 дней», но без процедуры.

**Решение:** dual-secret support. ISMeta принимает webhook'и с двумя HMAC-ключами одновременно, окно ротации 24 часа. В админке — кнопка «ротировать секрет».

### C3. Хранение

**Gap:**
- API-keys LLM в `Workspace.settings.llm_api_keys` — plaintext в JSONB?
- **Совсем плохо** для instance_admin доступа.

**Решение:** column-level encryption через pgcrypto, ключ — в env ISMeta-инстанса.

### C4. Уничтожение

- **Gap:** нет процедуры secure wipe при оффбоардинге клиента. `DROP TABLE` не гарантирует уничтожение данных на диске.

**Решение:** для коробки — инструкция shred; для SaaS — использовать storage provider с gdpr-wipe capabilities.

---

## D. Data classification и защита

Дополнение к [`DATA-RESIDENCY.md`](./DATA-RESIDENCY.md).

### D1. Классы и требуемые защиты

| Класс | Минимум защиты | Где в нашей схеме |
|---|---|---|
| Public | TLS in transit | РРЦ в публичном режиме |
| Internal | TLS + workspace_id isolation | AuditLog, MetricAggregate |
| Confidential | TLS + encryption at rest | Закупочные цены, маржа |
| Secret | TLS + E2E encryption + audit | LLM API-keys, HMAC secrets |
| PII | TLS + AES at rest + retention + right-to-delete | Email, phone в публичном режиме |

### D2. PII inventory

| Поле | Источник | Класс | Retention | Right-to-delete |
|---|---|---|---|---|
| `WorkspaceMember.user_id` | ERP | PII | пока активен | по запросу |
| `ChatMessage.content` | Сметчик | Internal | 1 год | при удалении смета |
| `AuditLog.user_id` | Все действия | Internal | 1 год | НЕ удаляется |
| Email в публичном режиме | Посетитель | PII | 30 дней | да |
| Phone в callback | Посетитель | PII | 30 дней | да |
| IP в access logs | Все запросы | PII | 30 дней | да |
| `AgentContext.value` | Агент | Internal (может содержать PII) | 90 дней после сметы | да |

### D3. Gap

- **IP addresses в логах** — это PII по GDPR. Retention 30 дней — обсуждаемый минимум.
- **AuditLog отказывается удалять** — конфликт с GDPR right-to-be-forgotten. Требуется отдельная процедура «анонимизации записи», сохраняя действие, но стирая `user_id`.

---

## E. Compliance матрица

### E1. 152-ФЗ (РФ)

| Требование | Статус | Примечание |
|---|---|---|
| Локализация ПДн граждан РФ в РФ | Частично | БД — РФ, LLM — США (при OpenAI) |
| Согласие на обработку | В backlog | Добавить в этап 2 |
| Назначение ответственного (DPO) | TBD | Юрист + PO |
| Журнал инцидентов с ПДн | Нет | Нужен отдельный, не AuditLog |
| Реагирование на утечку (Роскомнадзор) | Нет процедуры | Runbook нужен |
| Трансграничная передача | Нет согласия | Блокер публичного режима |

### E2. GDPR (на будущее, если EU-клиент)

| Требование | Статус |
|---|---|
| Legal basis для каждой обработки | Нужна матрица |
| Data Processing Agreement (DPA) с клиентами | Template нужен |
| Right to access | API export — есть план |
| Right to rectification | CRUD — OK |
| Right to erasure | Частично (AuditLog сохраняет) |
| Data Protection Impact Assessment (DPIA) | Нужен для LLM-обработки |

### E3. Рекомендации

- `docs/COMPLIANCE-MATRIX.md` — полная матрица с закрытыми/открытыми пунктами.
- DPO-роль формализовать в `TEAM.md`.
- Incident response plan — см. раздел F ниже.

---

## F. Incident Response

### F1. Текущая подготовленность

- Sentry для ошибок. OK.
- Алерты в `#ismeta-alerts`. OK.
- Runbook'и — в backlog.

### F2. Gap

**Нет ни одного runbook'а для security incident:**
- Утечка дампа БД — что делать?
- Компрометация API-ключа — последовательность действий?
- Разгар атаки (DDoS, brute force) — on-call процедура?
- Прошёл XSS в виджете — как контейним?
- Подозрение на insider threat — как расследуем?

**Нет incident classification:**
- P0 (critical): утечка коммерческих данных, лоль системы.
- P1 (high): уязвимость в production.
- P2 (medium): подозрительная активность.
- P3 (low): security hardening задача.

Без классификации — непонятно, что делать в 3 часа ночи.

### F3. Что делать

- `docs/INCIDENT-RESPONSE.md` — framework.
- `docs/runbooks/` — на каждый типовой инцидент.
- Tabletop exercise: имитация инцидента команды, раз в квартал.
- On-call policy — явная.

---

## G. Supply chain security

### G1. Dependencies

- Python: `pip-audit`, Dependabot.
- JS: `npm audit`, Dependabot.
- OK для 0-day patches.

### G2. Docker images

- Base images — `python:3.12`, `node:20`. Какой registry? Official Docker Hub?
- `latest` tag — запрещён.
- SBOM — не генерируется.

### G3. LLM-модели

- Поведение модели — часть supply chain.
- Gpt-4o завтра может начать выдавать другое.
- Golden set — частичная защита (ловим регрессию).

### G4. Gap

- **Нет процесса approval новой зависимости** — любой разработчик может добавить package.
- **Нет dependency ownership** — кто следит за обновлениями?
- **Нет private mirror** — зависим от npm / pypi availability.

### G5. Что делать

- CODEOWNERS на requirements.txt / package.json.
- Список allowed dependencies (allow-list) для security-sensitive категорий (crypto, auth).
- Private mirror через Nexus или Artifactory (для production).

---

## H. Приватная / публичная модели угроз

### H1. Наша инсталляция (MVP)

- Atack surface: внутренний → низкий risk.
- Insider threat: главный — один разработчик с production-доступом.
- Митигации: MFA + audit + least privilege.

### H2. Коробочная инсталляция

- Attack surface: инсталляция у клиента, вне нашего контроля.
- Риск: клиент сам mis-configures → breach → обвиняет нас.
- Митигации: hardening guide, secure defaults, installer validation.

### H3. SaaS (будущее)

- Attack surface: максимальный.
- Риск: multi-tenant data leakage, account takeover, DDoS.
- Митигации: WAF, CloudFlare, rate limits, bug bounty.

---

## I. Pentest и Red team

### I1. План pentest

В `specs/12-security.md` упомянуто: «pentest сторонней командой перед крупным релизом». Но:
- **Не определено** что такое «крупный релиз».
- **Нет бюджета** — pentest от 300K ₽ вверх.
- **Нет scope** — web app? API? infrastructure?

**Что делать:**
- Первый pentest — перед первой коробочной продажей. Scope: web app + API.
- Стоимость: бюджетировать 500K ₽/год (2 раза).

### I2. Bug bounty

Упомянуто в `specs/12-security.md §13` как «рассмотреть при коробочных клиентах».

**Оценка реалистичности:** для российского B2B-продукта bug bounty — преждевременно. Private responsible disclosure программа — достаточно.

---

## J. Приоритизированный security roadmap

### J1. До MVP

1. **Rate-limiting на приватном API** — блокирует brute force и DoS.
2. **Prompt-injection guards** — реальные регулярки + блэклист.
3. **LLM API keys encryption** — column-level через pgcrypto.
4. **IDOR fuzz tests** — в CI.
5. **Deployment hardening checklist** — `docs/admin/hardening-checklist.md`.

### J2. Перед пилотом с первым клиентом

6. **Incident response framework** — `docs/INCIDENT-RESPONSE.md` + 5 runbook'ов.
7. **Dual-secret support** для webhook HMAC — для zero-downtime ротации.
8. **Signed URLs** для файлов.
9. **CSP policy** для виджета.
10. **Supply chain hardening** — version pinning, SBOM.

### J3. До этапа 3 (коробка)

11. **MFA для admin и instance_admin**.
12. **Audit log tamper protection** — immutable append-only.
13. **First pentest** — web + API.
14. **DPO назначен, compliance matrix закрыта**.
15. **Secure wipe procedure**.

### J4. До этапа 4 (SaaS)

16. **152-ФЗ сертификация**.
17. **SOC 2 Type II** (если целевой рынок включает enterprise).
18. **WAF + DDoS protection**.
19. **Disaster recovery drill** раз в квартал.
20. **Insider threat program**.

---

## K. Ключевые security-риски

### K1. **LLM утечка коммерческой тайны** (критично)
- Вероятность: высокая.
- Impact: репутационный, юридический.
- Митигация: workspace-level choice of provider + минимизация payload.

### K2. **Webhook spoofing при компрометации HMAC-key** (критично)
- Вероятность: средняя.
- Impact: полная подмена данных ERP.
- Митигация: dual-secret + автоматическая ротация.

### K3. **AuditLog tampering by instance_admin** (высокий)
- Вероятность: низкая (insider).
- Impact: недоказуемость действий.
- Митигация: immutable append-only + external archive.

### K4. **DDoS публичного режима** (средний)
- Вероятность: средняя (вместе с запуском).
- Impact: потеря лидов.
- Митигация: CloudFlare + rate limits.

### K5. **152-ФЗ нарушение при публичном режиме** (критично)
- Уже упомянут в архитектурном ревью.
- Юридический риск для бизнеса.

---

## L. Оценка готовности

**Security архитектура:** 6/10.
**Операционная security:** 3/10.

Good:
- Multi-tenancy через UUID.
- HMAC, JWT, TLS.
- AuditLog.
- OpenTelemetry (недавно).

Needs work:
- Incident response plan.
- Secrets lifecycle runbook.
- IDOR testing.
- Supply chain hardening.
- Compliance matrix.

**Рекомендация:** не запускать в production (даже staging с реальными данными) до закрытия J1. Не продавать коробку без J2+J3.

---

## M. Что мы узнаем через 6 месяцев

1. Было ли хотя бы одно realistic security incident в staging?
2. Сколько CVE в наших зависимостях — как быстро реагировали?
3. Passed ли первый pentest?
4. Сколько IDOR-попыток поймано (real-world)?
5. Удалось ли автоматизировать secret rotation?
6. DPO назначен?
7. Что говорит внешний аудит о compliance с 152-ФЗ?

Ответы на эти вопросы — основа следующего security-ревью.

---

## N. Ещё открытые темы

Пункты, которые требуют отдельного рассмотрения и не поместились в этом ревью:

- **AI alignment и safety** — LLM может генерировать harmful content, misleading advice. Что делаем?
- **Model prompt stealing** — через prompt injection можно извлечь наш system prompt. Это коммерческая тайна?
- **Federated learning** — если клиенты не хотят делиться knowledge base, но хотят общее улучшение.
- **Quantum-safe crypto** — на горизонте 10 лет, но ключи, подписанные сейчас, будут читаемы тогда.

---

**Документ — snapshot на 2026-04-15. Обновление после каждого security-инцидента или крупного изменения архитектуры.**
