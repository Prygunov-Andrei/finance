# Incident Severity Framework

**Версия:** 0.1. **Дата:** 2026-04-15. **Источник:** DevOps ревью G2.

Классификация инцидентов по severity с чёткими SLA и процедурами. Используется для каждого алерта и любого reported issue.

## 1. Уровни severity

### P0 — Critical

**Определение:** полная недоступность или data loss / security breach.

**Примеры:**
- ISMeta API полностью не отвечает.
- БД повреждена или недоступна.
- Security breach (подтверждённая компрометация).
- Массовая утечка данных.
- Cross-workspace data leak.

**SLA:**
- **Acknowledge:** 15 минут.
- **Mitigation:** 1 час.
- **Resolution:** 4 часа.

**Процедура:**
- All-hands. Все остальное — на паузу.
- Incident channel открыт (ad-hoc).
- Updates каждые 30 минут пока не resolved.
- Customer communication: немедленно (status page).
- Postmortem: обязательно, published в 72 часа.

### P1 — High

**Определение:** значительная деградация функциональности.

**Примеры:**
- Подбор работ не работает для всех.
- Агент не отвечает.
- Webhook не доходит более 1 часа.
- ERP-интеграция сломана.
- Значительная часть пользователей (>50%) затронута.

**SLA:**
- **Acknowledge:** 1 час.
- **Mitigation:** 4 часа.
- **Resolution:** 24 часа.

**Процедура:**
- On-call engineer + технический лид.
- Updates каждый час.
- Customer communication: within 2 hours если affects > 10%.
- Postmortem: обязательно, published в 1 неделю.

### P2 — Medium

**Определение:** проблема у части пользователей, workaround возможен.

**Примеры:**
- Один workspace не может импортировать файлы.
- Performance degradation на некоторых запросах.
- Частичный outage одного provider (fallback работает).
- Dashboard метрик не грузится.
- Specific feature bugging out.

**SLA:**
- **Acknowledge:** 4 часа (рабочие дни), next business morning (выходные).
- **Mitigation:** 1 business day.
- **Resolution:** 3 business days.

**Процедура:**
- On-call или relevant team member.
- Ticket в tracker.
- Customer communication: individual, если affected.
- Postmortem: optional, если systemic issue.

### P3 — Low

**Определение:** косметические проблемы, не блокирует работу.

**Примеры:**
- UI text typo.
- Неоптимальное форматирование.
- Edge case в редком сценарии.
- Nice-to-have missing.

**SLA:**
- **Acknowledge:** 1 business day.
- **Mitigation:** N/A (планирование).
- **Resolution:** next sprint / backlog.

**Процедура:**
- Создание issue в tracker.
- Приоритизация на planning.
- Нет customer communication.

---

## 2. Как определить severity

Decision flowchart:

```
Есть инцидент?
  │
  ├─ Полная недоступность / data loss / security breach? → P0
  │
  ├─ Затронуты >50% пользователей или ключевая функция? → P1
  │
  ├─ Отдельные пользователи или non-critical функция? → P2
  │
  └─ Косметика, edge case → P3
```

**При сомнениях — эскалировать на уровень выше.** Downgrade проще, чем катастрофический upgrade.

---

## 3. Escalation matrix

| Severity | Первый responder | Эскалация после |
|---|---|---|
| P0 | On-call + Tech lead + CEO | 30 мин без progress → external expert |
| P1 | On-call | 4 часа без progress → Tech lead |
| P2 | Relevant team member | 2 business days → Tech lead |
| P3 | Product manager | никогда (уходит в backlog) |

---

## 4. Communication

### 4.1 Internal

- **P0:** `#ismeta-incidents` + direct message всем on-call + CEO.
- **P1:** `#ismeta-incidents` + direct message on-call.
- **P2:** `#ismeta-dev` + assignment to issue.
- **P3:** tracker только.

### 4.2 External (клиенты)

- **P0:** Status page обновление + email всем активным клиентам.
- **P1:** Status page (если > 10% affected) + email affected.
- **P2:** Indivudual communication только affected.
- **P3:** Нет.

### 4.3 Template для external communication

**P0 начало:**
```
Subject: [URGENT] ISMeta service incident

Мы заметили проблему с сервисом ISMeta в HH:MM UTC:
- Симптомы: ...
- Impact: ...
- Команда работает над решением.

Мы обновим вас в [HH:MM]. За вопросами — [контакт].
```

**P0 resolved:**
```
Subject: [RESOLVED] ISMeta service incident

Проблема, возникшая в HH:MM UTC, была устранена в HH:MM UTC.

Root cause: ...
Ваши данные не пострадали / пострадали следующим образом: ...

Полный postmortem будет опубликован в течение 72 часов.

Приносим извинения за неудобства.
```

---

## 5. On-call обязанности

### 5.1 Roster

- 2 человека в rotation (1 primary + 1 backup).
- Smена: неделя (с понедельника 09:00 Мск).
- Swap допустим по взаимной договорённости.

### 5.2 On-call должен

- Ответить на PagerDuty/Telegram алерт в течение SLA.
- Иметь доступ к production (VPN, SSH).
- Знать runbook'и.
- Документировать incident.
- Уметь escalate правильно.

### 5.3 On-call НЕ должен

- Один решать P0 (всегда зовёт подкрепление).
- Импровизировать если есть runbook.
- Делать major changes без review.

### 5.4 Compensation

- On-call час: 0 зарплата (included in role).
- Actual incident время (работал): overtime + day off.
- Stand-by (ничего не случилось): optional recognition.

---

## 6. Incident lifecycle

```
[Detection]
    ↓
[Classify severity] ← Decision flowchart
    ↓
[Open incident] → channel + log
    ↓
[Assign responder] → On-call
    ↓
[Investigate] ← Runbook
    ↓
[Mitigate] → restore service
    ↓
[Communicate] → internal + external
    ↓
[Resolve] → root cause fixed
    ↓
[Close incident]
    ↓
[Postmortem] ← template
    ↓
[Action items] → tracker
    ↓
[Follow-up] → через 1 месяц review
```

---

## 7. Metrics for incidents

- **MTTR** (Mean Time To Resolution).
- **MTTD** (Mean Time To Detection).
- **Incident frequency** by severity.
- **Repeat incidents** (same cause).
- **Customer-impacting incidents.**
- **Error budget consumption.**

Отслеживаются в дашборде. Monthly review.

---

## 8. Red flags (сигналы для re-review severity)

- Один инцидент превращается в два связанных → upgrade severity.
- Первоначальная оценка не сработала → re-classify.
- Customer complaint хуже чем expected impact → upgrade.

**Гибкость > догма.** Severity не высечен в камне.

---

## 9. Training

### 9.1 Onboarding нового on-call

- Шедоу older engineer на 2 недели.
- Прочитать все runbook'и.
- Проверка access (VPN, SSH, monitoring tools).
- Tabletop exercise по одному P0, одному P1.

### 9.2 Regular training

- Quarterly tabletop exercise.
- Chaos engineering game day (раз в полгода — имитация сбоев).

---

## 10. Связанные документы

- [`runbooks/`](./runbooks/)
- [`runbooks/postmortem-template.md`](./runbooks/postmortem-template.md)
- [`SLO.md`](./SLO.md)
- [`SECURITY-REVIEW.md §F`](./SECURITY-REVIEW.md)
- [`DEVOPS-REVIEW.md §G`](./DEVOPS-REVIEW.md)
