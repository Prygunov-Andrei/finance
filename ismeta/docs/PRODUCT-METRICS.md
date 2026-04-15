# Product Metrics

**Версия:** 0.1. **Дата:** 2026-04-15. **Источник:** PO-ревью F1.

Каталог продуктовых метрик ISMeta. Отличие от `specs/11-metrics.md`: там — технические метрики (latency, uptime), здесь — бизнес/продуктовые (DAU, retention, NPS).

## 0. Принципы

1. **North Star Metric** — одна ключевая, от которой зависит всё.
2. **Leading vs lagging.** Leading (рано видим), lagging (точно, но поздно).
3. **Input vs output.** Input (мы контролируем), output (результат).
4. **Не более 10 ключевых** метрик. Остальное — в детальный дашборд.

---

## 1. North Star Metric

**Smety Completed per Active User per Month.**

Почему:
- Прокси для value (клиент делает сметы → получает value).
- Прокси для retention (если не делает — уходит).
- Прокси для revenue (больше смет → хочет более дорогой tier).

Target: **> 10 смет/сметчик/месяц** через 3 месяца использования.

---

## 2. Тир-1: Главные метрики (на главном дашборде)

### 2.1 Business

| Метрика | Определение | Цель |
|---|---|---|
| **ARR** (Annual Recurring Revenue) | Сумма годовых контрактов | Рост MoM |
| **MRR** (Monthly Recurring Revenue) | Ежемесячный revenue | Рост MoM |
| **Число активных клиентов** | Плативших за последний месяц | Рост |
| **ACV** (Average Contract Value) | MRR / клиентов × 12 | > 1M ₽/год |
| **Net Revenue Retention** | (текущий MRR от cohort) / (original MRR cohort) | > 110% |
| **Churn rate** | Ушедшие за период / активные в начале | < 10% annual |

### 2.2 Product

| Метрика | Определение | Цель |
|---|---|---|
| **North Star: Smety per User per Month** | см. §1 | > 10 |
| **MAU** (Monthly Active Users) | Уникальные sметчики в месяц | Рост |
| **DAU/MAU ratio** | Прокси stickiness | > 0.4 |
| **Time to First Value** | От регистрации до первой завершённой сметы | < 7 дней |
| **Activation rate** | % клиентов, достигших activation milestone (5 смет) | > 70% |

### 2.3 Quality

| Метрика | Определение | Цель |
|---|---|---|
| **NPS** (Net Promoter Score) | Willingness to recommend | > 40 |
| **CSAT** (Customer Satisfaction) | Short survey после major events | > 4.5/5 |
| **Support response time** | От открытия ticket до первого ответа | < 4 h (Business), 24 h (Starter) |
| **Bug count** | Issues в production | Trending down |

---

## 3. Тир-2: Operational метрики (дашборд по ролям)

### 3.1 Для product team

- **Feature adoption rate** — % активных пользователей, использующих фичу.
- **Feature usage frequency** — как часто.
- **Funnel conversion** по каждой фиче.
- **Search queries** — что ищут, не находят.

### 3.2 Для customer success team

- **Health score** — composite (activity + NPS + support tickets + renewal proximity).
- **Red-flag customers** — health < threshold.
- **Expansion signals** — approaching tier limits.
- **Time since last login.**

### 3.3 Для LLM / AI team

- **Matching accuracy** (Precision/Recall).
- **LLM cost per smета.**
- **Agent usage** — % смет с использованием агента.
- **Agent satisfaction** (thumbs up/down).
- **Prompt iteration impact.**

### 3.4 Для sales team

- **Lead → Close conversion.**
- **Sales cycle length.**
- **Demo → Pilot conversion.**
- **Pilot → Paid conversion.**
- **ASP** (Average Selling Price).

---

## 4. Detailed metrics (не на главном дашборде, но считаем)

### 4.1 Smету lifecycle

- Размер смет (rows): распределение, median.
- Время создания смет (от первого add до submit).
- Процент смет, прошедших через Excel round-trip.
- Процент смет, переданных в ERP.
- Время от creation до transmit.
- Количество версий на смету (распределение).

### 4.2 Matching quality

- Precision / Recall по tier'ам (0-7).
- Доля smét без unmatched positions.
- Доля ручной правки после auto-match.
- Accuracy по категориям оборудования.

### 4.3 Agent usage

- Questions per session.
- Tools called per session.
- Session length.
- Acceptance rate of agent suggestions.

### 4.4 Public mode (после этапа 2.5)

- Visits.
- Upload → Get result conversion.
- Get result → Callback request conversion.
- Time on result page.

### 4.5 Collaboration

- Users per workspace (distribution).
- Concurrent editing conflicts.
- Shared estimates.

---

## 5. Cohort analysis

### 5.1 Cohorts to track

- **Signup month** — классический retention кривую.
- **Tier** — Starter vs Business vs Enterprise behavior.
- **Source** — outbound sales vs inbound vs referral.
- **Onboarding path** — completed vs partial onboarding.
- **Industry** — ОВиК vs СС vs mixed.

### 5.2 Cohort metrics

- N-day retention (1, 7, 30, 90, 365).
- LTV by cohort.
- Expansion rate by cohort.
- Churn reasons by cohort.

---

## 6. Leading indicators (ранние сигналы)

### 6.1 Health score компоненты

| Компонент | Вес | Signal |
|---|---|---|
| Last login | 25% | > 7 дней = red |
| Smety completed (30 days) | 25% | < 3 = yellow |
| Support ticket sentiment | 15% | Negative = red |
| Activity across features | 15% | Одна фича = yellow |
| Time to response on our outreach | 10% | > 5 дней = yellow |
| Renewal proximity | 10% | < 60 дней = watch |

### 6.2 Churn prediction

Модель — позже. Сейчас ручной review red-flag клиентов раз в неделю.

---

## 7. Survey program

### 7.1 NPS survey

- Frequency: quarterly.
- Channel: in-app + email.
- Question: «Какова вероятность (0-10), что вы порекомендуете ISMeta коллеге?»
- Follow-up: «Почему?»

### 7.2 CSAT surveys

- After support ticket close.
- After first completed smета.
- After feature release.

### 7.3 Interview program

- Monthly — 2-3 интервью с случайными клиентами (не только happy ones).
- Structure:
  - What's working?
  - What's frustrating?
  - What would you pay more for?
  - What would make you leave?

---

## 8. Реализация метрик

### 8.1 Tier 1 (на главном дашборде)

- Считаем из `MetricAggregate` таблицы (см. `specs/11-metrics.md`).
- Обновляется ежедневно ночной Celery task.
- Визуализация — Recharts в Django admin.

### 8.2 Tier 2 (operational)

- Ad-hoc SQL queries по мере необходимости.
- Exports для sales/CS teams (CSV).

### 8.3 Tier 3 (detailed)

- Data warehouse (Postgres read replica или ClickHouse).
- BI-инструмент (Metabase или Redash) — backlog для фазы 3+.

---

## 9. Dashboard layouts

### 9.1 CEO dashboard

- ARR, MRR growth.
- Number of customers.
- NPS.
- Churn.
- Cash runway.

### 9.2 Product dashboard

- North Star.
- Activation rate.
- Feature adoption (top 5).
- Bug count.

### 9.3 Customer Success dashboard

- Health score distribution.
- Red-flag customers list.
- Expansion opportunities.
- Renewal pipeline.

### 9.4 Sales dashboard

- Funnel conversion by stage.
- Pipeline value.
- ACV.
- Win/loss reason.

---

## 10. Metric hygiene

### 10.1 Definitions

- Все метрики имеют чёткое determination в `docs/METRICS-CATALOGUE.md` (будущий документ).
- Никаких «предположим, что means».
- Version tracking — если определение меняется, bump version.

### 10.2 Vanity vs actionable

- **Vanity:** число регистраций, pageviews, cumulative revenue.
- **Actionable:** conversion, retention, NPS.

Vanity — не на главном дашборде, но считать полезно.

### 10.3 Goodhart's Law

«Когда метрика становится целью, она перестаёт быть хорошей метрикой.»

Нельзя gaming'овать:
- NPS через попрошайничество «поставьте 10».
- Активность через уведомления «зайдите».
- Retention через лок-in (слишком сложный export).

---

## 11. Quarterly review

### 11.1 Формат

- В monthly review — проверка main метрик.
- Quarterly — deep dive:
  - Трёхмесячные тренды.
  - Что работает, что нет.
  - Hypotheses для следующего квартала.

### 11.2 OKR пример

**Objective:** достичь 10 платящих клиентов к концу Q2 2027.

**Key results:**
- KR1: 5 pilot клиентов converted to paid.
- KR2: ARR > 5M ₽.
- KR3: NPS > 40 среди existing.

---

## 12. Что делать сейчас

### Немедленно (MVP)

- [ ] Instrumentation базовых метрик (MAU, Smety Completed, Activation rate).
- [ ] Dashboard с 5-7 метриками на главной.

### До первого клиента

- [ ] NPS survey setup.
- [ ] Health score formula.

### До 5 клиентов

- [ ] Cohort analysis.
- [ ] Detailed dashboards для ролей.

### Каждый месяц

- [ ] Review main метрик.
- [ ] Identify anomalies.
- [ ] Action on red flags.

---

## 13. Связанные документы

- [`specs/11-metrics.md`](../specs/11-metrics.md) — технические метрики.
- [`GTM.md`](./GTM.md) — funnel метрики.
- [`CUSTOMER-JOURNEY.md`](./CUSTOMER-JOURNEY.md) — stage-specific метрики.
- [`PRICING.md`](./PRICING.md) — unit economics.
