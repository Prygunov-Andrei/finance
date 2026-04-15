# Compliance Matrix

**Версия:** 0.1. **Дата:** 2026-04-15. **Источник:** Security ревью E.

Матрица соответствия регуляторным требованиям, которые применимы к ISMeta в России и потенциально в ЕС/других регионах.

## 0. Scope

Покрываемые регуляторы:
- **152-ФЗ** (РФ) — персональные данные.
- **GDPR** (ЕС) — персональные данные.
- **ISO 27001** — information security management.
- **SOC 2 Type II** — для корпоративных клиентов.

Не покрываемые (пока):
- HIPAA (США, медицина).
- PCI DSS (не обрабатываем карточные платежи сами).
- FedRAMP (не идём в US federal).

## 1. 152-ФЗ (Россия)

### 1.1 Applicability

**ISMeta subject to 152-ФЗ if:**
- Обрабатываем ПДн граждан РФ.
- Осуществляем деятельность в РФ.

**В нашем случае: ДА.**

### 1.2 Ключевые требования

| Требование | Статус | Gap | Срок |
|---|---|---|---|
| Локализация ПДн граждан РФ в РФ | Частично | LLM-провайдер США при OpenAI | Этап 2 |
| Письменное согласие на обработку | Нет | Форма согласия на публичном портале | Этап 2 |
| Уведомление Роскомнадзора об обработке | Нет | Регистрация оператора ПДн | Pre-Фаза 2 |
| Назначение ответственного (DPO) | Нет | TEAM.md TBD | Pre-Фаза 2 |
| Журнал инцидентов с ПДн | Нет | Отдельный от AuditLog | Этап 2 |
| Реагирование на утечку (уведомление РНК в 24ч) | Нет процедуры | runbook | Pre-Фаза 2 |
| Трансграничная передача | Нет согласия | Согласие с упоминанием страны | Этап 2 |
| Право на доступ/изменение/удаление | Частично | API export есть, удаление — план | Этап 2 |
| Классификация уровней защищённости (УЗ-1..УЗ-4) | Нет оценки | Определить УЗ для наших данных | Pre-Фаза 2 |
| Модель угроз | Нет | Threat modeling есть в SECURITY-REVIEW | Формализовать |
| Организационно-технические меры | Частично | См. SECURITY-REVIEW | Continuous |

### 1.3 Уровень защищённости (гипотеза)

Наши данные:
- ПДн 1 категории (имя, email): **НЕТ** (только email).
- ПДн 2 категории (любые другие): **ДА** (email, phone на публичном портале).

Количество субъектов:
- < 100 000 = **УЗ-4** (низкий уровень) — наш случай в MVP.
- 100 000-1 000 000 = УЗ-3.
- > 1 000 000 = УЗ-2 или УЗ-1.

**Определение:** УЗ-4 достаточно для MVP. УЗ-3 при росте публичного портала.

### 1.4 Action items

- [ ] Pre-Фаза 2: регистрация в Роскомнадзоре как оператор ПДн.
- [ ] Pre-Фаза 2: назначение DPO (наш сотрудник или аутсорс).
- [ ] Этап 2: согласие на форме публичного портала.
- [ ] Этап 2: endpoint `DELETE /me` для публичного пользователя.
- [ ] Этап 2: локализация LLM-провайдера для РФ-клиентов (default = GigaChat).
- [ ] Этап 3+: сертификация 152-ФЗ для Enterprise клиентов (если потребуют).

---

## 2. GDPR (Европейский союз)

### 2.1 Applicability

**ISMeta subject to GDPR if:**
- Обрабатываем ПДн граждан ЕС.
- Продаём в ЕС или имеем там office.

**В MVP:** НЕТ (Россия only).

**В этапе 4+:** возможно DA (если экспансия в ЕС).

### 2.2 Ключевые требования (если понадобится)

| Требование | Статус |
|---|---|
| Legal basis для каждой обработки | Будущее |
| Data Processing Agreement (DPA) с клиентами | Template нужен |
| Right to access | API export есть |
| Right to rectification | CRUD |
| Right to erasure (right to be forgotten) | Частично — AuditLog retention = gap |
| Right to data portability | API export в стандартных форматах |
| Data Protection Impact Assessment (DPIA) | Нужен для LLM-обработки |
| Privacy by Design | Частично (multi-tenancy, encryption) |
| Data Protection Officer (DPO) | Требуется при масштабе |
| Breach notification (72 hours to authority) | Нет процедуры |
| Cross-border transfer | Standard Contractual Clauses |

### 2.3 Action items

- Этап 4: подготовка DPA template.
- Этап 4: DPIA для LLM-обработки.
- Этап 4: сертификация ISO 27001 как proof security.

---

## 3. ISO 27001

### 3.1 Applicability

Не обязательно, но даёт **огромный trust** для Enterprise клиентов.

### 3.2 Когда получать

- Cost: 500K-2M ₽ первичная + аудит ежегодный.
- ROI: открывает доступ к крупным клиентам.
- Timing: после первых 5-10 клиентов, когда стабилизируемся.

### 3.3 Что нужно

- Information Security Management System (ISMS).
- Risk register.
- Security policies (password, backup, incident response, access control).
- Training программа.
- Регулярный audit.

### 3.4 Action items

- Фаза 3+: Preliminary gap analysis.
- Фаза 4+: полная сертификация.

---

## 4. SOC 2 Type II

### 4.1 Applicability

Для международных Enterprise клиентов (часто даже российские с US-инвесторами).

### 4.2 Когда получать

- Cost: 1M-3M ₽ audit + подготовка.
- Type I (point-in-time) — сначала.
- Type II (continuous 6-12 months) — потом.

### 4.3 Trust Service Criteria

- Security (обязательно).
- Availability (нужно для SLA).
- Processing Integrity.
- Confidentiality.
- Privacy.

### 4.4 Action items

- Фаза 4+: SOC 2 Type I → Type II.

---

## 5. Специфические для отрасли

### 5.1 СРО (саморегулируемые организации в строительстве)

- Требований к ПО сметчика — НЕТ.
- Но: наличие сертификации Гранд-Сметы — conventional.

### 5.2 ФГИС «Росаккредитация»

- Для услуг сертификации — не применимо (мы не сертификационная организация).

### 5.3 Госзаказ (44-ФЗ)

- Не входим (не продаём государству в MVP).

---

## 6. Контрактные обязательства

Помимо регулятивных, на нас могут накладываться клиентские требования через контракт.

### 6.1 Типовые SLA-требования от клиентов

- Uptime 99.5% / 99.9% / 99.99%.
- Response time для support.
- Data backup/restore commitments.
- Data residency.
- Liability caps.

### 6.2 Типовые security-требования от клиентов

- Pentest annual.
- Vulnerability scanning.
- Employee background checks.
- Vendor security questionnaire (>100 вопросов — наш template!).

### 6.3 Action items

- Pre-Фаза 2: contract template с standard SLA.
- Pre-Фаза 2: security questionnaire template (ответы).

---

## 7. Breach response

### 7.1 Если breach с ПДн

**По 152-ФЗ:**
1. В течение 24 часов — уведомление Роскомнадзору о факте инцидента.
2. В течение 72 часов — уведомление субъектов ПДн (если им вред).
3. Журнал инцидента.
4. Выполнение мер по устранению.

**По GDPR (если применимо):**
- В течение 72 часов — уведомление DPA.
- Высокий risk → уведомление субъектов.

### 7.2 Runbook

См. `docs/runbooks/security-breach.md` (создать).

---

## 8. Data classification (кратко)

Полно в `docs/DATA-RESIDENCY.md §1-2`.

| Класс | Примеры | Regulation |
|---|---|---|
| ПДн | email, phone | 152-ФЗ, GDPR |
| Коммерческая тайна | closing prices, margin | Контракт |
| Служебные | AuditLog | Контракт |
| Public | РРЦ | Нет |

---

## 9. Privacy policy и ToS (требуется)

### 9.1 Privacy Policy

- На публичном сайте.
- Перечень собираемых данных.
- Цели обработки.
- Трансграничная передача (ДА, с указанием стран).
- Права субъектов.
- Контакт DPO.

### 9.2 Terms of Service

- На публичном сайте.
- Ограничение ответственности.
- Disclaimer за AI-решения.
- Прекращение и удаление данных.

### 9.3 Action items

- Pre-Фаза 2: юридический review.
- Pre-Фаза 2: версионирование policies.

---

## 10. Audit и evidence

### 10.1 Что хранить

- Access logs (90 дней).
- Admin actions log (1 год).
- Security incidents (3 года).
- Data deletion records (permanent).
- Breach notifications (permanent).
- DPO reports (5 лет).

### 10.2 Audit trails

- AuditLog в БД.
- Export raw logs в cold storage (S3).
- Inmutable archive для security events.

---

## 11. Ответственность и roles

### 11.1 Кто за что отвечает

| Роль | Ответственность |
|---|---|
| **CEO / PO** | Overall compliance |
| **DPO** | ПДн, GDPR/152-ФЗ |
| **Security engineer** | Security controls |
| **Легаль (внешний)** | Legal review, contracts |
| **Devops** | Technical enforcement |

### 11.2 Contacts на сайте

- Privacy: privacy@[домен]
- Security: security@[домен]
- DPO: dpo@[домен]
- Legal: legal@[домен]

---

## 12. Roadmap compliance

| Timing | Item | Owner |
|---|---|---|
| Pre-Фаза 2 | Регистрация оператор ПДн (Роскомнадзор) | Юрист |
| Pre-Фаза 2 | DPO назначен | PO |
| Pre-Фаза 2 | Privacy Policy + ToS | Юрист |
| Этап 2 | Согласие на публичном портале | PO + frontend |
| Этап 2 | Локальный LLM default для РФ | Backend |
| Этап 2 | Right to delete endpoint | Backend |
| Этап 3 | 152-ФЗ aудит (если клиент требует) | Security + внешний |
| Этап 4 | ISO 27001 audit | Security + внешний |
| Этап 4 | GDPR readiness (если экспансия) | Юрист + Security |
| Этап 4+ | SOC 2 Type I | Security + внешний |

---

## 13. Что делать сейчас

- [ ] Немедленно: выяснить, какая сумма 152-ФЗ штрафа нам грозит при нарушении (чтобы priorities правильно расставить).
- [ ] Pre-Фаза 2: консультация с юристом по compliance roadmap.
- [ ] Pre-Фаза 2: registration в Роскомнадзоре.
- [ ] Этап 2: implementation items.

---

## 14. Связанные документы

- [`DATA-RESIDENCY.md`](./DATA-RESIDENCY.md)
- [`SECURITY-REVIEW.md`](./SECURITY-REVIEW.md)
- [`specs/12-security.md`](../specs/12-security.md)
- [`runbooks/security-breach.md`](./runbooks/) (создать)
