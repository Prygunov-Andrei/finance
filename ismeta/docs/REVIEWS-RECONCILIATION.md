# Reconciliation пяти ревью

**Дата:** 2026-04-15. **Цель:** свести в один документ выводы пяти ревью, найти консенсус и противоречия, сформировать единый приоритизированный план.

Исходные документы:
1. [`ARCHITECTURE-REVIEW.md`](./ARCHITECTURE-REVIEW.md) — архитектор.
2. [`PRODUCT-REVIEW.md`](./PRODUCT-REVIEW.md) — Product Owner.
3. [`SECURITY-REVIEW.md`](./SECURITY-REVIEW.md) — Security Engineer.
4. [`UX-REVIEW.md`](./UX-REVIEW.md) — UX/Design Lead.
5. [`DEVOPS-REVIEW.md`](./DEVOPS-REVIEW.md) — SRE/DevOps.

---

## 0. Executive summary

| Роль | Оценка | Ключевой месседж |
|---|---|---|
| Архитектор | 7/10 | Принципы верные, 5 критических рисков — закрываем точечно; «подмораживаем» на 6 месяцев |
| PO | 4/10 бизнес / 9/10 техника | Отличный продукт, но некому продать; блокер — customer development |
| Security | 6/10 архитектура / 3/10 операционно | Не запускать в prod до закрытия rate-limits, injection guards, incident response |
| UX | 2/10 | Нет ни одного design-артефакта, блокер для E9-E11 |
| DevOps | 3/10 | План есть, execution на нуле; в production — нельзя |

**Общая оценка:** документация архитектуры отличная, документация **реализации** — средняя, документация **бизнеса, дизайна и эксплуатации** — слабая.

---

## 1. Консенсус всех пяти ревью

Пункты, где все (или 4 из 5) соглашаются:

### 1.1 Документация готова, продукт — нет

Все отмечают: «хорошая архитектурная документация, но без реализации и без валидации рынком это ещё не продукт».

Все пять ревью рекомендуют: **не запускать в production без закрытия собственного набора критических пунктов.**

### 1.2 6-месячная валидация нужна

Все ревью в разделе «что узнаем через 6 месяцев» независимо пришли к одному: без эксплуатации многие решения остаются гипотезами. Нужен **feedback-loop через реальное использование**, не только документацию.

### 1.3 Инцидент-реагирование — зияющая дыра

Поднимается в Security (§F), DevOps (§G), Architecture (косвенно).
- Нет runbook'ов;
- нет on-call rotation;
- нет severity classification;
- нет postmortem-процесса.

**Единогласно:** обязательно до первого клиента.

### 1.4 LLM-расходы — непокрытый риск

Architecture (F1), PO (E), Security (A3), DevOps (D3) — все поднимают:
- реальная стоимость выше таргета в 2-3×;
- без budget enforcement легко прогореть;
- зависимость от одного провайдера.

**Решение (частично принято):** LLM-COST-MODEL.md уже создан. Нужно enforcement в коде (E16, E4).

### 1.5 Коробочная поставка отложена явно

Все ревью подтверждают: **в этапе 1 не коробочная готовность.**
- Architecture: зависимость от ERP в MVP.
- PO: нет CAC/LTV, не валидирован ICP.
- Security: нет compliance.
- UX: нет design-системы.
- DevOps: нет install.sh.

Коробка — этап 3+. Зафиксировано в CONCEPT.md.

---

## 2. Противоречия между ревью

Точки напряжения, где нет согласия. Требуют решения руководством.

### 2.1 PO vs Architecture: скоуп MVP

- **PO:** Excel round-trip — переоценено, сделать простой экспорт без round-trip.
- **Architecture:** Excel round-trip с row_id + hash — важный дифференциатор, технически заложен (ADR-0013).

**Разрешение:** оставить упрощённый round-trip в MVP (просто reconciliation по row_id, без sophisticated three-way merge). Полный сценарий — по запросу пользователей.

### 2.2 PO vs UX: публичный режим в этапе 2

- **PO:** «публичный режим отвлекает ресурсы, лучше отложить на 2.5».
- **UX:** «публичный режим — ключевой маркетинговый канал, не откладывать».

**Разрешение:** публичный режим — действительно этап 2, но с ограниченным скоупом (только быстрая оценка, без полного cabinet). Демо-пилот на сайте Августа с 1 сметчиком.

### 2.3 Security vs PO: MFA для admin

- **Security:** MFA для admin и instance_admin с первого этапа.
- **PO:** усложнение onboarding клиента, откладывать до коробки.

**Разрешение:** MFA опциональна в MVP (можно включить в settings), обязательна для instance_admin на нашем production.

### 2.4 DevOps vs Architecture: Kubernetes

- **DevOps:** для SaaS на этапе 4 — Kubernetes обязателен.
- **Architecture (ADR косвенно):** «не упариваемся в Kubernetes» для коробки.

**Разрешение:** Kubernetes для SaaS (этап 4+), Docker Compose для коробки. Зафиксировать явно в `docs/INFRASTRUCTURE-CHOICES.md`.

### 2.5 UX vs Architecture: кастомные колонки

- **UX:** три column presets (compact/extended/full), выбираемые пользователем.
- **Architecture:** `ColumnConfigTemplate` per estimate (уже есть в схеме).

**Разрешение:** обе модели: ColumnConfigTemplate для per-смета, дополнительно User preference для global default. Не конфликтуют.

### 2.6 Security vs DevOps: distroless vs alpine

- **Security:** distroless для минимизации attack surface.
- **DevOps:** alpine проще в отладке; distroless = нет shell для exec.

**Разрешение:** alpine для staging, distroless для production. Инженер-DevOps решает при setup.

---

## 3. Пересечения и амплификация

Пункты, поднятые несколькими ревью, где сумма важнее деталей:

### 3.1 Rate limiting

- Security (OWASP A01 + DoS): rate limit на приватном API.
- DevOps: rate limit для LLM-провайдеров (защита от 429).
- Architecture: rate limit для webhook storm.

**Общее решение:** отдельный сервис rate limiting (Redis-based, `django-ratelimit` или `slowapi`). Правила для каждого endpoint.

### 3.2 Observability

- Security: security logging (failed auth, cross-workspace).
- DevOps: logs/metrics/traces.
- Architecture: distributed tracing.

**Общее решение:** OpenTelemetry SDK добавлен в requirements.txt. Что нужно дополнительно:
- Security-specific log channel.
- Structured logging with PII masking (DevOps §C1).
- Trace sampling 10% в prod (DevOps §C3).

### 3.3 Secrets management

- Security: lifecycle, rotation, encryption.
- DevOps: deployment, injection, runtime access.
- Architecture: SOPS принято в ADR.

**Общее решение:** `docs/SECRET-MANAGEMENT.md` с единой процедурой от создания до ротации до destruction.

### 3.4 Error handling

- UX: human-readable errors (RFC 7807 + translations).
- Security: не разглашать внутреннюю структуру в ошибках.
- DevOps: 5xx trigger alerts.

**Общее решение:** middleware в ISMeta:
- Собирает детальный лог (для SRE).
- Возвращает sanitized response (для пользователя).
- Триггерит алерт при unknown 5xx.

### 3.5 Accessibility / Internationalization

- UX: WCAG 2.1 AA (§H).
- PO: i18n для будущих языков (E).
- DevOps: locale files CI checks.

**Общее решение:** архитектурно заложить `next-intl` (уже в package.json), accessibility — пункт в PR-checklist и CI через axe.

---

## 4. Пропущенные темы

Темы, не поднятые ни одним ревью, но важные (надо вернуться):

### 4.1 Legal / контракты

- SLA в договорах с клиентами.
- Terms of Service для публичного режима.
- Privacy Policy.
- Cookie consent.
- Контрольные документы для security-аудиторов.

**Кто должен:** юрист + PO + Security.

### 4.2 Community / Marketing

- Блог / change log публичный.
- GitHub repo (даже если частичный open-source).
- Конференции / митапы.
- Case studies.

**Кто должен:** PO.

### 4.3 Training / Certification

- Training для коробочных клиентов.
- Сертификация «ISMeta certified integrator».

**Кто должен:** PO + техписатель.

### 4.4 Versioning для коробки

- Если клиент на v1.2 хочет ждать v2, но оставаться поддерживаемым.
- LTS-стратегия.

**Кто должен:** Architecture + PO.

### 4.5 Ecosystem API

- Публичный API для сторонних разработчиков.
- Webhook для интеграторов (не только от ERP).
- Marketplace of integrations.

**Кто должен:** Architecture + PO.

---

## 5. Единый приоритизированный roadmap

Компиляция всех L-разделов пяти ревью в один список.

### Фаза A. До эпика E1 (инфраструктура)

1. **Customer development** — 2-3 интервью в неделю (PO-B1, B2).
2. **Конкурентный анализ** матрица 5×15 (PO-A3).
3. **Design sprint** — Figma с core-экранами (UX-A).
4. **MoSCoW** приоритеты на эпики (PO-D1).
5. **Business acceptance** в `specs/07-mvp-acceptance.md` (PO-F2).

### Фаза B. Параллельно E1 (инфраструктура)

6. **CI pipeline** в GitHub Actions (DevOps-A1).
7. **IaC** скелеты (DevOps-B1).
8. **Environments** разделение + parity (DevOps-B2).
9. **Observability stack** (structlog, Prometheus, Grafana, Alertmanager) (DevOps-C).
10. **Backup script** + healthchecks ping (DevOps-E).
11. **Design system** (Figma + Storybook) (UX-P7).

### Фаза C. До E5-E8 (core-функциональность)

12. **Rate limiting** сервис (консенсус Security+DevOps+Architecture).
13. **Prompt injection guards** — реальные регулярки (Security-B3).
14. **LLM API keys encryption** — pgcrypto (Security-B2).
15. **IDOR fuzz tests** (Security-B1).
16. **Column presets** в UI (UX-C1).
17. **Undo/redo stack** + autosave (UX-C3).
18. **Version timeline** (UX-B2, E1).
19. **Search in-estimate** (UX-C2).
20. **Keyboard shortcuts** (UX-C4).

### Фаза D. До внутреннего релиза (для сметчика-dogfooder)

21. **Runbook catalogue** — минимум 10 (DevOps-F3).
22. **Incident severity framework** (DevOps-G2).
23. **Postmortem template** (DevOps-G3).
24. **SSE streaming UI** с tool-call indicators (UX-D2).
25. **Direct action vs chat mode** разделение (UX-D1).
26. **Excel import diff card** (UX-F1).
27. **Error messages catalogue** (UX-I, DevOps-C1).
28. **Empty states** для всех screens (UX-J1).
29. **Load testing** (DevOps-D1).
30. **Sizing guide** (DevOps-D1).

### Фаза E. До первого клиента (пилот)

31. **Signed URLs** для файлов (Security-A4).
32. **CSP policy** для виджета (Security-A5).
33. **Dual-secret support** для webhook HMAC (Security-C2).
34. **On-call rotation** формально (DevOps-G1).
35. **Data export** команда (DevOps-K3).
36. **Pricing hypothesis** 3 тарифа (PO-E).
37. **GTM плана** первичный (PO-B1).
38. **Legal review** — ответственность за AI (PO-G4).
39. **Zero-downtime migrations** documented (DevOps-A3).
40. **Container hardening** (DevOps-I2).

### Фаза F. До коробки (этап 3+)

41. **MFA** для admin/instance_admin (Security-B7).
42. **Audit log tamper protection** (Security-B9).
43. **First pentest** (Security-I1).
44. **DPO назначен, compliance matrix** (Security-E).
45. **Self-serve onboarding** (PO-C2).
46. **Reference customers** 2-3 (PO-J).
47. **Integration APIs** — 1С, CRM (PO-I).
48. **Install.sh** для клиентов (DevOps-K1).
49. **Updates procedure** (DevOps-K2).
50. **Client support SLA** (PO-E2, Security-F).

### Фаза G. Для SaaS (этап 4+)

51. **152-ФЗ сертификация** (Security-E1).
52. **Kubernetes setup** (DevOps-B1).
53. **Multi-region backups** (DevOps-F1).
54. **HPA / auto-scaling** (DevOps-B1).
55. **Blue-green deployment** (DevOps-A3).
56. **WAF + DDoS** (Security-H3).
57. **Bug bounty** опционально (Security-I2).
58. **Chaos engineering** (DevOps-L4).

---

## 6. Роли ответственных

Каждый пункт требует ownership. Распределение между профилями:

### Архитектор / техлид
1, 4, 9, 12, 13, 14, 15, 17, 24, 25, 26, 33, 39.

### Product Owner
2, 5, 36, 37, 38, 46, 47, 50.

### Security engineer
13, 14, 15, 31, 32, 33, 41, 42, 43, 44, 51, 56.

### UX / Design
3, 11, 16, 17, 18, 19, 20, 24, 25, 26, 27, 28.

### DevOps / SRE
6, 7, 8, 9, 10, 21, 22, 23, 29, 30, 34, 35, 39, 40, 48, 49, 52, 53, 54, 55, 58.

### Backend senior
12, 13, 14, 15, 17, 27.

### Frontend senior
11, 16, 17, 18, 19, 20, 24, 25, 28.

### QA / тестировщик
15, 29, возможно 12, 43.

### Юрист (внешний)
38, 50, 51.

---

## 7. Зависимости и критический путь

Критический путь от Фазы A до первого клиента:

```
A.Customer development  ──────────────────────────────────────────┐
A.Design sprint ──────► B.Design system ──► C.UX items ──┐       │
A.MoSCoW priorities ───► B.CI setup ────────────────────┐ │       │
                                                        ▼ ▼       ▼
                                                      C.Core items
                                                           │
                                                           ▼
                                                  D.Internal release
                                                           │
                                                           ▼
                                                     E.First client
```

Любая из фаз A/B может задержать все последующие. **Customer development** в первую очередь.

---

## 8. Анти-паттерны, которых не следует

На основе всех ревью:

1. **«Сделаем документацию, код потом»** — documentation debt превращается в technical debt (5 ревью подтверждают, код нужно начать, не перебарщивая с документами).
2. **«Сначала идеальный продукт, потом клиенты»** — PO предупреждает: «некому продать». Customer development — параллельно с разработкой.
3. **«Сначала production, безопасность потом»** — Security: «не запускать без rate-limits». Но не overengineering.
4. **«Соберём metrics, когда понадобится»** — DevOps + Architecture: observability с первого дня.
5. **«UI — это просто, сделаем как у всех»** — UX: без дизайн-спринта frontend эпики не стартуют.

---

## 9. Meta-выводы

### 9.1 О процессе ревью

**5 ревью =** 5 углов зрения × 1500-2000 строк каждый = ~10 000 строк критики.

Плюсы:
- Покрытие колоссальное.
- Нет слепых зон (каждое поле продукта охвачено).
- Видны tensions между ролями.

Минусы:
- Overwhelming для читателя.
- Многое дублируется.
- Часть пунктов — «nice to have», не критично.

### 9.2 Что реально ценно

Из 58+ пунктов roadmap:
- **10-15 критических** (без них не запустить).
- **20-25 важных** (без них будет боль).
- **15-20 nice-to-have** (optimization).

### 9.3 Риск overengineering

Все пять ревьюеров — синтетические, каждый фокусируется на «своём». Реальная команда из 3-5 человек не сделает все 58 пунктов. **Нужна жёсткая приоритизация.**

**Рекомендация:** ограничить MVP критическими пунктами из Фаз A-D. Всё остальное — записать в backlog с явными триггерами.

---

## 10. Следующие шаги

После reconciliation — выбор:

### Вариант 1. Вернуться к реализации

Приступить к эпику E1 (инфраструктура) с учётом критических пунктов из roadmap. Сделать первый коммит.

### Вариант 2. Пригласить реальных экспертов

Синтетические ревью ≠ реальные. Показать документы реальным:
- архитектору с опытом смётных продуктов;
- security-аудитору;
- UX-дизайнеру;
- product-лидеру SaaS.

Сверить их feedback с нашим reconciliation.

### Вариант 3. Пилот на 2 недели

Взять подмножество backlog'а (Фаза A-C критическое) и реализовать. Убедиться, что документация ложится на код.

### Вариант 4. Ещё одна итерация документации

- Закрыть «пропущенные темы» (раздел 4): legal, marketing, ecosystem.
- Написать конкретные runbook'ы (DevOps-F3).
- Figma-спринт (UX).

---

## 11. Что мы узнаем через 12 месяцев

- Сколько из 58 пунктов roadmap реализовано?
- Какие tensions между ролями оказались реальными, какие — синтетическими?
- Правильно ли расставили приоритеты?
- Какие пропущенные темы (§4) проявились в эксплуатации?
- Что пришлось добавить в roadmap и почему?
- Были ли переоценки сложности?

---

## 12. Использование документа

- **Каждый квартал:** статус-ап по пунктам roadmap (сделано / в работе / отменено).
- **При новом ревью:** сверять с existing, не дублировать.
- **При смене приоритетов:** обновлять явно, с обоснованием.

Документ — живой. Не архивируется без замены.

---

**Snapshot 2026-04-15. Обновление — после каждого этапа или при существенном изменении команды/продукта.**
