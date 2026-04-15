# Архитектурное ревью ISMeta

**Дата:** 2026-04-15. **Проводивший:** техлид (синтетически). **Версия документа:** 0.1.

Snapshot архитектурной критики комплекса документов ISMeta. Фиксируется как артефакт для возврата через 6 месяцев и оценки: что подтвердилось, что оказалось ложной тревогой, что мы упустили.

## 0. Скоуп ревью

Ревью проведено после создания комплекса документов:
- концепция (`CONCEPT.md`);
- 14 архитектурных спецификаций (`specs/`);
- 14 ADR (`docs/adr/`);
- корневые онбординг-документы;
- скелеты backend/frontend/mocks.

Не в скоупе: реальный код (его ещё нет), UX-дизайн, бизнес-стратегия.

## 1. Общая оценка

Архитектура в основе здоровая. Принципы «отдельная БД, workspace_id с первого дня, outbox, JWT, optimistic locking» — правильные. Но есть 5 критических рисков и 15-20 существенных зазоров, которые проявятся через 6-12 месяцев эксплуатации.

---

## A. Концептуальная целостность и границы

### A1. Продукт архитектурно не самодостаточен (критично)

В концепции мы заявляем: «ISMeta — обособленный продукт, встраивается в любой ERP, продаётся коробочно». Но в spec'ах:
- контракты, акты, накопительные сметы — в ERP;
- «коробка без ERP — этап 3+»;
- `Estimate.status = transmitted` — терминальное состояние для ISMeta.

**Парадокс:** мы продаём «замену сметчика», а сметчик работает не только до договора. После подписания — точечные правки, аналоги при закупке, актирование. Без этого продукт автоматизирует сметчика на 30%, а не на 50%.

**Решение принято:** сокращаем value proposition до «подготовка смет до договора». Пост-договорный модуль — в backlog. Коробка без ERP — этап 3+ (явно, не MVP).

### A2. Синхронизация версий ISMeta ↔ ERP — критичный weak link

Маппинг между ISMeta-версиями и ContractEstimate-версиями в ERP разошёлся бы через месяцы эксплуатации.

**Решение принято:** новый [ADR-0015](./adr/0015-version-link-ismeta-erp.md) + таблица `VersionLink` + ежедневный reconciliation.

### A3. Workspace vs Object vs Folder — неполная модель для холдингов

Multi-ERP на один Workspace не поддерживается.

**Решение принято:** в MVP — один Workspace = один ERP, в backlog на случай холдинг-клиента (Приложение В bis CONCEPT.md).

### A4. LLM-агент как островок, а не первичный интерфейс

MVP агента ограничен — только две операции на строке. AI-first интерфейс — backlog.

**Решение принято:** оставляем в backlog с explicit плашкой в Приложении Г.

---

## B. Масштабируемость

### B1. EstimateItem — миллиарды строк через 3 года

**Решение принято:** hash-partitioning по `workspace_id` с первой миграции. Зафиксировано в [`01-data-model.md §8.10`](../specs/01-data-model.md).

### B2. Redis как SPOF

**Решение отложено:** MVP — один Redis с graceful degradation; при переходе в production с > 10 сметчиков — переход на Sentinel/managed Redis. Отмечено в Приложении В bis.

### B3. SSE-стрим для чата — не для Django production

**Решение отложено:** MVP — 5-10 сметчиков, Django ASGI достаточно. При росте — вынос в отдельный Node.js/Go сервис.

### B4. Fuzzy live по WorkItem

**Решение принято:** пересмотр [ADR-0006](./adr/0006-no-workitem-cache.md) — добавлен автоматический триггер в CI: при росте > 1000 работ → предупреждение, > 2000 → эскалация.

### B5. Партиционирование LLMUsage / MatchingSessionStats / AuditLog

**Решение принято:** monthly range partitioning с первой миграции. Зафиксировано в [`01-data-model.md §8.10`](../specs/01-data-model.md).

---

## C. Устойчивость к отказам

### C1. Caching strategy при длительном даунтайме ERP

**Решение принято:** stale-while-revalidate политика в [`CONCEPT.md §4.7`](../CONCEPT.md). Пороги 15 мин / 1 ч / 4 ч с разным поведением.

### C2. Fallback для LLM-провайдера

**Решение принято:** circuit breaker + fallback chain (OpenAI → Gemini → Anthropic → cached → degraded). Зафиксировано в [`specs/04-llm-agent.md §5.1`](../specs/04-llm-agent.md).

### C3. Webhook storm после длительного ERP-downtime

**Решение отложено:** в MVP — небольшие объёмы. При реальном шторме добавим rate-limiting. Отмечено в backlog.

### C4. Нет проверки обратимости миграций в CI

**Решение принято:** добавить CI-job `test-migrations-reversibility`, правило в `CONTRIBUTING.md`. Задача для E23.

---

## D. Операционная эксплуатируемость

### D1. Нет distributed tracing

**Решение принято:** OpenTelemetry с первого дня. Зависимости в `requirements.txt`, конфиг в `settings.py`. Документация — в [`specs/11-metrics.md §3`](../specs/11-metrics.md).

### D2. Нет SLO/SLI и error budget

**Решение принято:** новый документ [`SLO.md`](./SLO.md).

### D3. Health-check только поверхностный

**Решение принято:** три уровня health-check: liveness / readiness / deps. Реализовано в `backend/ismeta/urls.py` как skeleton.

### D4. Нет on-call rotation

**Решение отложено:** в MVP — 5-10 сметчиков, нет on-call. Документируется в эпике E23.

---

## E. Безопасность и compliance

### E1. Данные утекают в LLM-провайдера — 152-ФЗ

**Решение принято:** документ [`DATA-RESIDENCY.md`](./DATA-RESIDENCY.md). Workspace-setting `data_residency` и автоматическая смена default-провайдера — в этап 2.

### E2. Отсутствует data residency

**Решение принято:** см. выше.

### E3. Secret rotation — декларация без инструментов

**Решение отложено:** процедура ротации — в этап 2. Runbook в `docs/admin/` (создаётся в E24).

### E4. Instance-admin — all-powerful

**Решение отложено:** в MVP — small team, separation of duties не критичен. В этап 3 (коробка) — реализуем BreakGlass.

### E5. Custom_data JSONB — injection attack surface

**Решение принято:** Pydantic-валидация перед записью + лимит размера. Зафиксировать как правило в `CONTRIBUTING.md` в следующей итерации.

---

## F. Экономика решения

### F1. LLM-расходы не моделированы

**Решение принято:** документ [`LLM-COST-MODEL.md`](./LLM-COST-MODEL.md) с детальной моделью по задачам и размерам смет. Budget enforcement — на уровне Workspace.

### F2. Infrastructure costs не оценены

**Решение отложено:** sizing guide — при первой коробочной продаже.

### F3. Нет unit economics коробочного продукта

**Решение частично:** варианты тарификации описаны в `LLM-COST-MODEL.md §6.2` как черновик. Окончательные цифры — после MVP.

---

## G. Evolutionary architecture

### G1. Нет абстракции над LLM tool-use

**Решение отложено:** в MVP — один default-провайдер (OpenAI). Абстракция tool-definitions — при добавлении третьего провайдера (этап 2).

### G2. CRUD без event-sourcing

**Решение принято:** shadow `domain_event` таблица пишется параллельно CRUD. Переход на event-sourced в будущем без ломки — в этап 3+.

### G3. CQRS не упомянут

**Решение отложено:** дашборд — из primary. Read-replica — при деградации (Приложение В bis).

---

## H. Технический долг

### H1. JSONB-зоопарк

**Решение:** Pydantic-schemas для каждого JSONB-поля, валидация на уровне сервиса. Добавить правило в `CONTRIBUTING.md` при старте кодинга.

### H2. EstimateSubsection — живой мёртвый груз

**Решение:** decision date — через 6 месяцев эксплуатации. Отмечено в Приложении В bis.

### H3. `needs_recalculation` — скрытое состояние

**Решение принято:** блокирующая валидация — нельзя `transmit` смету с `needs_recalculation=true` без явного подтверждения. Правило в `specs/01-data-model.md §4.2.1` (диаграмма статусов).

### H4. Моки устаревают

**Решение отложено:** автогенерация моков из прод-данных — backlog.

---

## I. Антипаттерны

### I1. Synchronous waiting в HTTP

**Решение:** стандартизировано — всегда `session_id` с polling или SSE.

### I2. Business logic в migrations

**Решение:** правило в `CONTRIBUTING.md §5` — data migrations через management commands, не RunPython. Добавить.

### I3. Hardcoded model names

**Решение принято:** env-переменные `LLM_MODEL_*` по task_type. Маппинг на class'ы — в backlog.

### I4. N+1 в serializers

**Решение:** тесты через django-silk в CI-job «n1-check».

---

## J. Критические tradeoff'ы

### J1. Build vs Buy для распознавания

**Решение принято:** документ [`RECOGNITION-BUILD-VS-BUY.md`](./RECOGNITION-BUILD-VS-BUY.md). Сейчас — build. После E20 — формальный бенчмарк против 3 готовых решений.

### J2. Monolith vs Microservice для recognition

**Решение отложено:** Django-app в ERP в MVP. Вынос в микросервис — триггер: > 100 PDF/день. Отмечено в Приложении В bis.

### J3. Next.js vs SPA

**Решение отложено:** Next.js в MVP (консистентно с ERP). Пересмотр после оценки bundle size в этапе 1.

---

## K. Главные архитектурные риски (приоритизированный список)

### K1. Версионирование ISMeta ↔ ERP разойдётся
**→ Закрыто** через ADR-0015 + VersionLink.

### K2. LLM-расходы в 2-3 раза выше таргета
**→ Закрыто** через LLM-COST-MODEL + budget enforcement.

### K3. Redis SPOF
**→ Отложено** до production; graceful degradation в MVP.

### K4. 152-ФЗ нарушение при коробочной продаже
**→ Закрыто** через DATA-RESIDENCY + план на этап 2.

### K5. EstimateItem миллиарды строк
**→ Закрыто** через hash-partitioning с первой миграции.

---

## L. Что сделано по итогам ревью

### L1. Немедленно (в этапе 0)
- [x] ADR-0015 VersionLink.
- [x] Партиционирование в 01-data-model.md.
- [x] LLM-COST-MODEL.md.
- [x] OpenTelemetry в skeleton backend.
- [x] Three-level health-check в urls.py.
- [x] Обновление ADR-0006 с CI-триггером.
- [x] LLM fallback chain в specs/04-llm-agent.md.
- [x] Stale-while-revalidate в CONCEPT.md §4.7.

### L2. До первого релиза
- [x] SLO.md.
- [x] RECOGNITION-BUILD-VS-BUY.md.
- [ ] Pydantic-schemas для JSONB — правило добавится в CONTRIBUTING.md в следующей итерации.
- [ ] CI-job reversibility миграций — задача E23.

### L3. Отложено с explicit триггерами
- Вынос recognition в микросервис.
- Redis HA.
- Event sourcing.
- Separate LLM-шлюз.
- Multi-ERP на Workspace.
- Next.js vs Vite пересмотр.
- Separation of duties для instance_admin.

---

## M. Что мы узнаем через 6 месяцев

При возврате к этому документу через полгода проверим:
1. Сработала ли `VersionLink` reconciliation (нашли ли дрифт, сколько раз)?
2. Сколько реально стоит средняя смета LLM — попали ли в 100-150 ₽ или дороже?
3. Насколько OpenTelemetry помог в debug'е реальных инцидентов?
4. Пригодилось ли разделение health-check'ов?
5. Правильны ли SLO-цели (слишком жёсткие / слишком мягкие)?
6. Достижим ли fallback chain LLM в реальности?
7. EstimateSubsection — использовалась хоть раз?
8. Какой процент смет упёрся в `needs_recalculation`-блокирующее правило?

Ответы на эти вопросы — основа следующего раунда ревью.

## N. Сам процесс ревью

Замечания:
- Четвёртый раунд критики уже начал давать убывающую отдачу — большинство находок оказались «мелкими косяками документации», а не концептуальными проблемами.
- Ревью глазами новичка (пред. раунд) выявил совсем другие проблемы, чем архитектурное — оба нужны, не заменяют друг друга.
- Рекомендация: следующие ревью — PO (бизнес) и security engineer (threat modeling). Они откроют новые углы.

---

**Этот документ — snapshot на 2026-04-15. При существенных изменениях архитектуры — создаётся новая версия (`ARCHITECTURE-REVIEW-v2.md`), а не правится эта. История — через git.**
