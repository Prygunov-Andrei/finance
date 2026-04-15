# DevOps/SRE ревью ISMeta

**Дата:** 2026-04-15. **Роль ревьюера:** Senior SRE / DevOps Engineer (синтетически). **Версия:** 0.1.

Ревью с позиции эксплуатации продукта в production: deployment, observability, capacity, disaster recovery, on-call. Фокус — то, что сломается через 3-6 месяцев после запуска, если не подготовиться.

## 0. Методика

- Проверяю: как деплоить, как следить, как восстанавливать, как масштабировать.
- Специфика: MVP на монолите Django + коробочная поставка в перспективе.
- Применяю SRE-принципы: SLO/SLI (частично есть), error budget, toil reduction, capacity planning.

---

## A. Deployment pipeline

### A1. CI — упомянут, не описан

`specs/13-release-process.md` упоминает CI с jobs: lint, tests, openapi, migrations check.

**Gap:** не указан конкретный CI-сервис:
- GitHub Actions? GitLab CI? Drone? Jenkins?
- Self-hosted runners для test против прод-данных?
- Кто платит за CI minutes?

**Что делать:**
- Выбрать: для MVP — GitHub Actions (бесплатно для public/небольших).
- `.github/workflows/` скелеты в репо.
- Self-hosted runner для integration-tests с прод-БД через SSH-туннель.

### A2. CD — белое пятно

`make release-to-production` — красивая строчка в Makefile. Но:
- Кто триггерит?
- Blue-green или rolling или in-place?
- Как откатывается?
- Где хранится artifact (docker image registry)?
- Кто управляет конфигами prod?

**Что делать:**
- **ArgoCD / FluxCD** (GitOps) — overkill для MVP.
- **Semaphore pattern:** git push в `production` → GitHub Actions → ssh deploy script → docker compose pull/up. Простой, работает.
- Registry: GitHub Container Registry (бесплатно для нас) или Yandex Container Registry (для РФ-клиентов).

### A3. Zero-downtime deployments

Для backend: rolling restart двух контейнеров. OK.

**Gaps:**
- Database migrations **не** zero-downtime. Любая `ALTER TABLE ADD COLUMN NOT NULL` = блокировка записи.
- Правило «миграции обратимы» — это для rollback. А для zero-downtime нужен другой паттерн: expand-contract.

**Что делать:**
- Задокументировать expand-contract в `specs/13-release-process.md`:
  1. Release N: добавили nullable column.
  2. Release N+1: код пишет в новую и читает из неё.
  3. Release N+2: миграция backfill.
  4. Release N+3: удалили старую column (когда не используется).
- CI-job на длительность миграции: блокирует PR, если `EXPLAIN` показывает >5 сек.

### A4. Feature flags — есть в теории

`specs/13-release-process.md §7` упоминает feature flags через БД-таблицу.

**Gap:**
- Нет UI для переключения флагов (только SQL?).
- Нет A/B testing поддержки.
- Нет «ramp up» (10%, 50%, 100% workspace'ов).

**Что делать:**
- Или простая админка в `/admin/flags/`.
- Или готовый сервис: **Unleash** (open-source), **PostHog feature flags** (freemium).

---

## B. Infrastructure as Code

### B1. Отсутствует полностью

Ни `terraform/`, ни `pulumi/`, ни `ansible/`. Только `docker-compose.yml` (упомянут, не создан).

**Риск:** первое production развёртывание сделает один человек руками, документации не будет, через полгода никто не воспроизведёт.

**Что делать:**
- MVP: docker-compose.yml + Ansible playbook для первого развёртывания. Минимум 10 часов работы.
- Коробка: Docker Compose + install.sh (уже в плане).
- SaaS (этап 4): Terraform + k8s через Yandex Managed Kubernetes.

### B2. Environments — partially covered

В `specs/13-release-process.md §3` — 4 среды (Local, Dev/CI, Staging, Production). Хорошо.

**Gap:**
- Нет описания physical placement: где stagingf? На одной машине с prod? Отдельный сервер?
- Нет data refresh: как staging получает анонимизированный снимок prod?
- Нет environment parity checker: «в prod есть secret X, в staging — нет».

**Что делать:**
- `docs/ENVIRONMENTS.md` с картой: адреса, секреты, подключения, доступы.
- Script `make staging-refresh-from-prod` (раз в неделю).
- Parity check в CI.

---

## C. Observability

### C1. Logging — стратегия не полная

`specs/11-metrics.md §4.3` упоминает stdout → Loki / файл.

**Gaps:**
- Нет структурированного формата (JSON ожидается, но не зафиксирован).
- Нет trace_id в логах (OpenTelemetry добавлен, но интеграция с логгером — не описана).
- Нет PII-маскирования (email в логах = утечка).
- Нет retention policy для production logs.

**Что делать:**
- `structlog` (уже в requirements) — настроить с обязательными полями: `timestamp, level, trace_id, workspace_id, user_id, request_id, message`.
- Middleware для PII-маскирования.
- Retention: hot 7 дней в Loki, cold 30 дней в S3 archive, purge через 1 год.

### C2. Metrics — есть в plan

OpenTelemetry заложен (хорошо). `MetricAggregate` для бизнес-метрик.

**Gaps:**
- Нет **Grafana dashboards** как артефактов в репо (они обычно «живут» в Grafana, при мигрировании инстансов теряются).
- Нет **RED/USE method** применения:
  - RED (Request-based): Rate, Errors, Duration для каждого endpoint.
  - USE (Resource-based): Utilization, Saturation, Errors для CPU/memory/disk/network.
- Нет distinct метрик для коробочного клиента vs SaaS.

**Что делать:**
- Grafana dashboards как JSON в `ops/grafana-dashboards/`.
- Отдельный файл `docs/METRICS-CATALOGUE.md` с RED+USE метриками по каждому сервису.

### C3. Tracing — заложен, но...

OpenTelemetry SDK добавлен. Collector?
- Где trace-данные хранятся?
- Кто задаёт sampling rate в prod (1%? 10%?)?
- Cross-service trace context propagation — через W3C Trace Context?

**Что делать:**
- Jaeger или Tempo для self-hosted.
- Sampling 10% в prod, 100% в staging.
- Auto-instrumentation для Django, Celery, httpx, redis, psycopg.

### C4. Alerts — есть список, нет движка

`specs/11-metrics.md §5` — перечень условий алертов. Каким движком отправляются?

**Gap:**
- Prometheus Alertmanager? Grafana Alerting?
- Куда идёт алерт — Telegram / Slack / email / PagerDuty?
- Escalation policy — нет (если первый дежурный не ответил за 15 мин — второй).

**Что делать:**
- Alertmanager + Telegram bot для командного канала.
- PagerDuty заменить на VictorOps или дежурство по расписанию (нет в РФ удобных платных).
- Runbook линки в каждом алерте.

---

## D. Capacity planning

### D1. Sizing — не описан

Для одного сметчика (MVP):
- CPU?
- RAM?
- Disk?
- Network?

Для 10 сметчиков?
Для 100?

Никаких цифр в доках.

**Что делать:**
- Load testing в staging (k6 / Locust).
- `docs/SIZING-GUIDE.md` с таблицей: N сметчиков → требуется X CPU, Y RAM, Z GB disk.
- Коробочному клиенту этот документ нужен обязательно.

### D2. Database growth

Прикидки в `01-data-model.md §11` — есть.

**Gaps:**
- Нет monitoring для database size growth rate.
- Нет alert: «БД выросла на 50 GB за неделю».
- Нет archival plan: когда/куда переносим старые версии смет.

**Что делать:**
- Метрика `db_size_bytes_per_workspace` в дашборде.
- Alert при анормальном росте (> 2× недельного медианного).
- Archival через detach-partition в S3 (паттерн описан в `01-data-model.md §8.10`, executor нужен).

### D3. LLM capacity

Каждая смета = LLM-вызовы. 10 сметчиков = 500 смет/месяц = много запросов к OpenAI.

**Gaps:**
- Rate limits провайдеров не учтены (OpenAI Tier 1: 500 RPM).
- При всплеске (все начали подбор одновременно) = 429.

**Что делать:**
- Внутренний rate limiter — не превышаем RPM провайдера.
- Queue для LLM-запросов (в Redis или отдельной очереди).
- При 429 — exponential backoff + fallback на другого провайдера.

---

## E. Backup и restore

### E1. Backup spec — есть, execution — нет

`specs/12-security.md §6.2` описывает: `pg_dump` раз в сутки + wal-g каждые 15 минут в S3.

**Gap:**
- Скрипт для этого — нет в репо.
- Кто его запускает (cron / kubernetes cronjob / внешний scheduler)?
- Где мониторинг того, что backup прошёл?

**Что делать:**
- `ops/backup/daily-dump.sh` — скрипт.
- `ops/backup/wal-g-setup.md` — инструкция.
- Cron на хосте БД или k8s CronJob.
- Healthcheck-ping: backup завершён → ping на healthchecks.io. Нет ping 25 часов → алерт.

### E2. Restore testing — декларация

«Раз в месяц — тестовое восстановление» — кто? когда? как проверить, что прошло?

**Что делать:**
- `ops/backup/restore-drill.sh` — runbook с шагами.
- Ежемесячный ticket в трекере «restore drill, deadline конец месяца».
- Tested recovery time объявлен как SLO в `docs/SLO.md` (сейчас «RTO 2 часа» — нужно подтвердить на практике).

### E3. Point-in-Time Recovery (PITR)

С wal-g — реалистично. Но:
- До какой точки можем восстановить? (max PITR = 15 минут).
- Проверен ли PITR на практике?

**Что делать:**
- Отдельный drill раз в квартал: «восстановить БД на состояние 3 часа назад».

---

## F. Disaster recovery

### F1. Multi-region — нет

Всё на одном сервере (216.57.110.41). Сервер умер — всё умерло.

**MVP: допустимо** (данных мало, downtime OK).
**Production для клиента: недопустимо.**

**Что делать:**
- Документ `docs/DR-PLAN.md` с RPO/RTO и сценариями.
- Для MVP: бэкапы в другой регион S3 — минимум.
- Для этапа 2+: standby replica в другом DC.

### F2. Dependencies DR

- Что делать, если OpenAI недоступен 2 часа?
- Если Yandex S3 недоступен при восстановлении?
- Если CloudFlare под DDoS'ом?

**Что делать:**
- Fallback LLM-провайдер (есть в spec).
- Backup storage redundancy (primary + secondary region).
- CloudFlare → Origin direct access с IP allowlist.

### F3. Runbook каталог

В `docs/adr` 15 ADR. В `docs/` три ревью. Но нет `docs/runbooks/`.

**Что делать:**
- `docs/runbooks/incident-response.md` — общий framework.
- `docs/runbooks/` отдельные файлы на каждый типовой incident:
  - `db-down.md`
  - `redis-down.md`
  - `erp-unreachable.md`
  - `llm-provider-outage.md`
  - `ddos-attack.md`
  - `data-corruption.md`
  - `disk-full.md`
  - `migration-stuck.md`
  - `webhook-flood.md`
  - `secrets-rotation.md`

---

## G. On-call и incident response

### G1. On-call policy — отсутствует

`docs/TEAM.md` упоминает «DevOps: TBD». Никакого дежурства.

В MVP с 5 сметчиками это OK. Для коробки — critical gap.

**Что делать:**
- До первого коробочного клиента — формальная on-call rotation.
- SLA реакции: P0 = 15 мин, P1 = 4 часа, P2 = 1 рабочий день.
- Tool: Telegram-бот, simple rotation (2 человека чередуются неделями).

### G2. Incident severity — не формализовано

В `specs/12-security.md §11.1` перечислены инциденты, но без severity levels.

**Что делать:**
- `docs/INCIDENT-SEVERITY.md`:
  - P0: critical, production down, data loss.
  - P1: major, production degraded.
  - P2: minor, non-critical features down.
  - P3: low, cosmetic.
- Каждый alert имеет severity.

### G3. Postmortem — процесс

Каждый P0/P1 → postmortem. Формат?

**Что делать:**
- Template в `docs/runbooks/postmortem-template.md`.
- Blameless culture — зафиксировать в CONTRIBUTING.
- Action items трекатся до closure.

---

## H. Cost management

### H1. Infrastructure costs — не отслеживаются

Сколько стоит hosting за месяц? Никакого мониторинга.

**Что делать:**
- `docs/COST-DASHBOARD.md` — ежемесячный отчёт:
  - hosting (сервер): X ₽.
  - S3 backup: Y ₽.
  - LLM-provider: Z ₽ (из LLMUsage).
  - Monitoring stack: W ₽.
- Alert при росте > 20% месяц к месяцу.

### H2. Per-workspace cost — нет

В SaaS критично: какой workspace потребляет больше всего ресурсов?

**Что делать:**
- Метрика `workspace_cost_rub_monthly` (LLM + storage + compute).
- Биллинг модель опирается на эту метрику.

### H3. Waste detection

- Unused workspace — не удаляем, но не используем.
- Large attachments — хранятся вечно.
- Old backups — не архивируются.

**Что делать:**
- Monthly cost review.
- Auto-archive unused workspace'ов через 6 месяцев неактивности.

---

## I. Security в эксплуатации

(Дополняет SECURITY-REVIEW.md с позиции SRE.)

### I1. Secret deployment

SOPS (принято). Но процесс:
- Разработчик не может случайно увидеть prod-secret в логах.
- Секрет попадает в контейнер только на старте (не в image).
- Ротация без restart'а сервиса — возможна?

**Что делать:**
- Secrets через env vars в docker-compose — OK.
- Tool: `sops decrypt` запускается на хосте перед `docker compose up`.
- Ротация: blue-green deployment с новыми secrets.

### I2. Container hardening

Django в Docker. Но:
- Non-root user? Не указан.
- Read-only filesystem? Нет.
- Minimal base image (alpine vs debian)?
- CVE scanning в CI?

**Что делать:**
- `Dockerfile` с non-root user, read-only `/`, tmpfs для `/tmp`.
- Trivy scan в CI.
- Distroless base image для production.

### I3. Network isolation

- ISMeta ↔ ERP через network или через public internet?
- В compose — все контейнеры в одной сети, OK.
- В prod — WireGuard / Tailscale между сервисами?

**Что делать:**
- Private network между ISMeta и ERP (internal VPN).
- LLM API через outbound-only (нет inbound от провайдеров).

---

## J. Maintenance и toil

### J1. Автоматизация рутины

SRE-принцип: toil < 50% времени.

Сейчас:
- Migrations — manual `make ismeta-db-migrate` на prod. Будет toil.
- Backup verification — manual.
- Cert renewal (Let's Encrypt) — если не автоматизировано, toil.
- Log rotation — должна быть автоматической.

**Что делать:**
- GitOps подход: git push → migrations автоматически.
- Certbot auto-renewal.
- Logrotate настроен в image.

### J2. Dependency upgrades

Dependabot упомянут. Но:
- Кто ревьюит dependabot-PRs?
- Auto-merge для patch-версий?
- Weekly / monthly schedule?

**Что делать:**
- Auto-merge patch security. Ручной review minor/major.
- Ревью owner — backend-senior.

---

## K. Коробочная специфика

### K1. Клиент устанавливает — что инструктируем?

`install.sh` в плане. Что он делает?
- Проверка требований (Docker, RAM, Disk).
- Клонирование image.
- Генерация secrets.
- Миграция БД.
- Seed.

Но:
- Updates — как клиент обновляет?
- Мониторинг — у клиента свой, нам не видно.
- Support — по запросу клиента.

**Что делать:**
- `ops/client-install/` — всё необходимое.
- `ops/client-update/` — upgrade инструкция.
- Optional telemetry (anonymous usage stats) — клиент решает включать.

### K2. Updates remotely

Мы выпустили ISMeta v1.2.3. Что клиент должен сделать?

**Что делать:**
- `docker compose pull && docker compose up -d` — если мы постарались.
- Миграции — auto через entrypoint.
- Breaking changes — в CHANGELOG с upgrade path.

### K3. Data export при офф-боардинге

Клиент ушёл. Как отдаём его данные?

**Что делать:**
- `make export-workspace WORKSPACE_ID=...` → .zip с БД-dump, файлами, knowledge-base.
- Secure delete остатков (см. SECURITY-REVIEW.md §C4).

---

## L. Приоритизированный DevOps-roadmap

### L1. До MVP

1. **CI pipeline** в GitHub Actions (lint, tests, openapi, migrations check).
2. **Deployment script** (ssh + docker compose).
3. **Backup setup** (pg_dump + wal-g + healthchecks ping).
4. **Basic observability:** structlog, Prometheus + Grafana (self-hosted), Alertmanager → Telegram.
5. **Runbooks** (минимум 5: db-down, redis-down, erp-unreachable, llm-outage, backup-failed).
6. **Environments** (local + CI + staging).

### L2. До первого клиента

7. **Container hardening** (non-root, read-only fs).
8. **Secret management** via SOPS (в production).
9. **Zero-downtime migrations** documented с expand-contract.
10. **On-call rotation** (2 человека, Telegram).
11. **Load testing** (k6, baseline numbers).
12. **Sizing guide.**
13. **Incident severity framework.**
14. **Postmortem template.**

### L3. До коробки

15. **install.sh** для клиентов.
16. **Update procedure** для клиентов.
17. **Data export** одной командой.
18. **Client monitoring** (optional).
19. **Upgrade path** в CHANGELOG.

### L4. Для SaaS (этап 4)

20. **Kubernetes** (managed: Yandex Managed K8s).
21. **Multi-region backups.**
22. **Standby replica.**
23. **Auto-scaling** (HPA).
24. **Blue-green deployment.**
25. **Chaos engineering.**
26. **Bug bounty / pentest schedule.**

---

## M. Оценка готовности

- **Deployment:** 2/10 (план есть, execution нет).
- **Observability:** 6/10 (хороший план, инфра не стоит).
- **Backup/Restore:** 4/10 (спека есть, скрипты нет).
- **Capacity:** 1/10 (ничего не измерено).
- **On-call:** 1/10 (нет rotation).
- **Cost management:** 2/10 (LLM учтён, остальное — нет).
- **Коробочная готовность:** 2/10.

**Общая эксплуатационная готовность:** 3/10.

Продукт можно запустить в staging. В production для клиента — нельзя.

---

## N. Что мы узнаем через 6 месяцев

1. Сколько раз прошла миграция без downtime?
2. Сколько инцидентов было P0/P1?
3. Чему научили postmortem'ы?
4. Какова реальная capacity на одного сметчика?
5. LLM-расходы прогнозируются по LLMUsage точно?
6. Backup действительно тестировался раз в месяц?
7. Время восстановления после disaster drill — укладываемся в RTO 2 часа?

---

**Snapshot 2026-04-15. Обновление — после первого production-deployment и первых реальных инцидентов.**
