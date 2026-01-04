# Проект Finans Assistant — Полная документация

**Версия:** 2.0  
**Дата:** 13.12.2025  
**Статус:** Бекенд полностью реализован ✅

---

## Содержание

1. [Общее описание проекта](#1-общее-описание-проекта)
2. [Архитектура и технологии](#2-архитектура-и-технологии)
3. [Модели данных](#3-модели-данных)
4. [API Endpoints](#4-api-endpoints)
5. [Бизнес-логика](#5-бизнес-логика)
6. [Прогресс разработки](#6-прогресс-разработки)
7. [Ограничения системы](#7-ограничения-системы)
8. [История изменений](#8-история-изменений)

---

## 1. Общее описание проекта

### Контекст

Строительная компания ведёт несколько объектов (строительные площадки, здания). Компания выступает как Генеральный подрядчик: заключает договоры с Заказчиками и привлекает Исполнителей (субподрядчиков) для выполнения работ.

### Цели системы

1. **SRM (Supplier Relationship Management):** Управление полным жизненным циклом взаимодействия с контрагентами — от заключения договора до закрытия актов и гарантийных обязательств.
2. **Финансовый контроль:** Централизация финансовых данных, контроль кассовых разрывов, управление дебиторской и кредиторской задолженностью.
3. **Зеркальный учет:** Связь доходов от Заказчиков с расходами на Исполнителей для расчета реальной маржинальности каждого объекта.
4. **Единое информационное пространство:** Хранение всей истории по объекту в одном месте.

### Роли пользователей

| Роль | Описание |
|------|----------|
| **Руководитель** | Видит сводку по объектам, маржинальность, статусы работ |
| **Финансовый директор** | Контролирует движение средств, согласовывает платежи |
| **Проектный менеджер** | Ведёт операционную работу, загружает акты и сканы |
| **Финансовый аналитик** | Вводит данные, формирует отчётность |

### Ключевые требования

1. **SRM-ядро:** Хранение финансовых транзакций и истории взаимоотношений (Договоры, Переписка, Акты).
2. **Двусторонний учёт:** Поддержка договоров с Заказчиками (приход) и с Исполнителями (расход).
3. **Зеркальность:** Расходные договоры привязываются к доходным для расчёта маржинальности.
4. **Управление долгами:** Акты автоматически формируют дебиторскую/кредиторскую задолженность.
5. **Workflow согласований:** Исходящие платежи проходят согласование через Реестр.
6. **Документооборот:** К каждой операции привязывается скан документа.
7. **Мульти-юридичность:** Несколько юрлиц и множество счетов (20+).
8. **Аналитика:** Cash-flow (деньги) и P&L (начисления).

---

## 2. Архитектура и технологии

### Backend

| Компонент | Технология |
|-----------|------------|
| Фреймворк | Django REST Framework |
| База данных | PostgreSQL |
| Аутентификация | JWT (simplejwt) |
| Документация API | Swagger/OpenAPI |

### Django-приложения

| Приложение | Описание |
|------------|----------|
| `core` | Базовые модели, миксины, утилиты, сервисы |
| `accounting` | Юрлица, счета, контрагенты, налоговые системы |
| `objects` | Объекты строительства |
| `contracts` | Договоры, акты, рамочные договоры |
| `payments` | Платежи, реестры, категории расходов |
| `communications` | Переписка с контрагентами |
| `pricelists` | Прайс-листы на работы, разряды, справочники |
| `estimates` | Проекты, сметы, монтажные сметы |
| `proposals` | ТКП, МП, справочники фронта работ |

### Структура проекта

```
backend/
├── core/                  # Базовые компоненты
│   ├── models.py          # TimestampedModel, VersionedModelMixin
│   ├── services.py        # Сервисный слой
│   ├── cached.py          # CachedPropertyMixin
│   ├── constants.py       # Константы
│   ├── version_mixin.py   # VersioningMixin для ViewSets
│   ├── number_generator.py # Генерация номеров
│   └── file_signals.py    # Сигналы удаления файлов
├── accounting/            # Учёт
├── objects/               # Объекты
├── contracts/             # Договоры
├── payments/              # Платежи
├── communications/        # Переписка
├── pricelists/            # Прайс-листы
├── estimates/             # Сметы
├── proposals/             # ТКП/МП
└── finans_assistant/      # Настройки проекта
```

---

## 3. Модели данных

### 3.0. Objects (Объекты)

#### Object (Объект строительства)
```
- name: название (unique)
- address: адрес
- start_date, end_date: плановые сроки
- status: planned / active / completed / suspended
- description
```

**Связи:**
- contracts, projects, estimates, technical_proposals, mounting_proposals

---

### 3.1. Accounting (Учёт)

#### TaxSystem (Система налогообложения)
```
- code: код системы (unique)
- name: название
- vat_rate: ставка НДС (nullable)
- has_vat: есть ли НДС
- is_active: активна
```

#### LegalEntity (Наша компания)
```
- name, short_name: наименования
- inn, kpp, ogrn: реквизиты
- tax_system: FK → TaxSystem
- director: FK → User
- director_name: ФИО директора
- director_position: должность
- is_active
```

#### Account (Счёт/Касса)
```
- legal_entity: FK → LegalEntity
- name, number: название, номер счёта
- account_type: bank_account / cash / deposit / currency_account
- bank_name, bik: реквизиты банка
- currency: RUB / USD / EUR
- initial_balance, balance_date
- is_active
```

#### AccountBalance (Остаток на дату)
```
- account: FK → Account
- balance_date: дата
- balance: сумма
unique: (account, balance_date)
```

#### Counterparty (Контрагент)
```
- name, short_name: наименования
- type: customer / vendor / both
- vendor_subtype: supplier / executor / both (для vendor)
- legal_form: ooo / ip / self_employed / fiz
- inn, kpp, ogrn: реквизиты
- contact_info, is_active
```

**Методы:**
- `is_vendor()` → bool
- `is_customer()` → bool
- `validate_is_vendor(counterparty, field_name)`

---

### 3.2. Pricelists (Прайс-листы)

#### WorkerGrade (Разряд рабочего)
```
- grade: 1-5 (unique)
- name: "Монтажник N разряда"
- default_hourly_rate: базовая ставка
- is_active
```

#### WorkSection (Раздел работ)
```
- code: уникальный код
- name: название
- parent: FK → self (иерархия)
- is_active, sort_order
```

#### WorkerGradeSkills (Навыки разряда по разделу)
```
- grade: FK → WorkerGrade
- section: FK → WorkSection
- description: описание навыков
unique: (grade, section)
```

#### WorkItem (Работа) — с версионированием
```
- article: артикул (unique)
- section: FK → WorkSection
- name: наименование
- unit: шт / м.п. / м² / м³ / компл / ед / ч / кг / т
- hours: часов на единицу
- grade: FK → WorkerGrade
- composition: состав работы
- coefficient: коэфф. сложности (default=1.00)
- parent_version, version_number, is_current
```

**Методы:**
- `create_new_version()` → WorkItem

#### PriceList (Прайс-лист) — с версионированием
```
- number, name, date
- status: draft / active / archived
- grade_1_rate ... grade_5_rate: ставки по разрядам
- parent_version, version_number
```

**Методы:**
- `populate_rates_from_grades()`
- `create_new_version()` → PriceList
- `get_rate_for_grade(grade_number)` → Decimal

#### PriceListAgreement (Согласование с Исполнителем)
```
- price_list: FK → PriceList
- counterparty: FK → Counterparty (vendor only!)
- agreed_date, notes
unique: (price_list, counterparty)
```

#### PriceListItem (Позиция прайс-листа)
```
- price_list: FK → PriceList
- work_item: FK → WorkItem
- hours_override, coefficient_override: переопределения
- is_included: включена в прайс
unique: (price_list, work_item)
```

**Свойства:**
- `effective_hours`, `effective_coefficient`
- `calculated_cost` = hours × coefficient × rate

---

### 3.3. Estimates (Сметы)

#### Project (Проект) — с версионированием
```
- cipher: шифр проекта
- name, date
- stage: П / РД
- object: FK → Object
- file: ZIP-архив
- notes
- is_approved_for_production, production_approval_file, production_approval_date
- primary_check_done, primary_check_by, primary_check_date
- secondary_check_done, secondary_check_by, secondary_check_date
- parent_version, version_number, is_current
unique: (cipher, date)
```

#### ProjectNote (Замечание к проекту)
```
- project: FK → Project
- author: FK → User
- text
```

#### Estimate (Смета) — с версионированием
```
- number, name
- object: FK → Object
- legal_entity: FK → LegalEntity
- with_vat, vat_rate
- projects: M2M → Project
- price_list: FK → PriceList
- man_hours, usd_rate, eur_rate, cny_rate
- file
- status: draft / in_progress / checking / approved / sent / agreed / rejected
- approved_by_customer, approved_date
- created_by, checked_by, approved_by
- parent_version, version_number
```

**Вычисляемые свойства (cached_property):**
- `total_materials_sale`, `total_works_sale`
- `total_materials_purchase`, `total_works_purchase`
- `total_sale`, `total_purchase`
- `vat_amount`, `total_with_vat`
- `profit_amount`, `profit_percent`

#### EstimateSection (Раздел сметы)
```
- estimate: FK → Estimate
- name, sort_order
```

#### EstimateSubsection (Подраздел сметы)
```
- section: FK → EstimateSection
- name
- materials_sale, works_sale
- materials_purchase, works_purchase
- sort_order
```

#### EstimateCharacteristic (Характеристика сметы)
```
- estimate: FK → Estimate
- name: "Материалы" / "Работы" / custom
- purchase_amount, sale_amount
- is_auto_calculated: автоматически рассчитано
- source_type: sections / manual
- sort_order
```

#### MountingEstimate (Монтажная смета) — с версионированием
```
- number, name
- object: FK → Object
- source_estimate: FK → Estimate
- total_amount, man_hours
- file
- status: draft / sent / approved / rejected
- agreed_counterparty: FK → Counterparty (vendor only!)
- agreed_date
- created_by
- parent_version, version_number
```

---

### 3.4. Proposals (ТКП/МП)

#### FrontOfWorkItem (Справочник "Фронт работ")
```
- name: "Подвести электропитание..."
- category: "Электрика" / "Строительство" / ...
- is_active, sort_order
```

#### MountingCondition (Справочник "Условия для МП")
```
- name: "Проживание" / "Инструмент" / "Питание"
- description
- is_active, sort_order
```

#### TechnicalProposal (ТКП) — с версионированием
```
- number: автогенерация {порядковый}_{ДД.ММ.ГГ}
- outgoing_number, name, date
- object: FK → Object
- object_area
- legal_entity: FK → LegalEntity
- estimates: M2M → Estimate
- advance_required, work_duration
- validity_days: default=30
- notes
- status: draft / in_progress / checking / approved / sent / agreed / rejected
- file
- created_by, checked_by, approved_by, approved_at
- parent_version, version_number
```

**Вычисляемые свойства (cached_property):**
- `signatory`, `signatory_name`, `signatory_position`
- `object_address`, `validity_date`
- `total_man_hours`, `total_amount`, `total_with_vat`
- `total_profit`, `profit_percent`
- `currency_rates`, `projects`

**Методы:**
- `copy_data_from_estimates()`
- `create_new_version()` → TechnicalProposal

#### TKPEstimateSection (Раздел сметы в ТКП)
```
- tkp: FK → TechnicalProposal
- source_estimate: FK → Estimate
- source_section: FK → EstimateSection
- name, sort_order
```

#### TKPEstimateSubsection (Подраздел сметы в ТКП)
```
- section: FK → TKPEstimateSection
- source_subsection: FK → EstimateSubsection
- name
- materials_sale, works_sale
- materials_purchase, works_purchase
- sort_order
```

#### TKPCharacteristic (Характеристика ТКП)
```
- tkp: FK → TechnicalProposal
- source_estimate: FK → Estimate
- source_characteristic: FK → EstimateCharacteristic
- name, purchase_amount, sale_amount, sort_order
```

#### TKPFrontOfWork (Фронт работ в ТКП)
```
- tkp: FK → TechnicalProposal
- front_item: FK → FrontOfWorkItem
- when_text, when_date
- sort_order
unique: (tkp, front_item)
```

#### MountingProposal (МП) — с версионированием
```
- number: автогенерация {номер_ТКП}-{порядковый} или МП-{год}-{порядковый}
- name, date
- object: FK → Object
- counterparty: FK → Counterparty (vendor only!)
- parent_tkp: FK → TechnicalProposal
- mounting_estimate: FK → MountingEstimate
- total_amount, man_hours
- notes
- status: draft / published / sent / approved / rejected
- file
- telegram_published, telegram_published_at
- conditions: M2M → MountingCondition
- created_by
- parent_version, version_number
```

**Методы:**
- `copy_from_mounting_estimate()`
- `create_from_tkp(tkp, created_by)` → MountingProposal
- `create_new_version()` → MountingProposal

---

### 3.5. Contracts (Договоры)

#### FrameworkContract (Рамочный договор)
```
- number: автогенерация РД-{год}-{порядковый}
- name, date
- valid_from, valid_until
- legal_entity: FK → LegalEntity
- counterparty: FK → Counterparty (vendor only!)
- price_lists: M2M → PriceList
- status: draft / active / expired / terminated
- file, notes
- created_by
```

**Вычисляемые свойства:**
- `is_expired`, `is_active`
- `days_until_expiration`
- `contracts_count`, `total_contracts_amount`

#### Contract (Договор)
```
- object: FK → Object
- legal_entity: FK → LegalEntity
- counterparty: FK → Counterparty
- contract_type: income / expense
- parent_contract: FK → self (зеркальные)
- technical_proposal: OneToOne → TechnicalProposal (для income)
- mounting_proposal: OneToOne → MountingProposal (для expense)
- framework_contract: FK → FrameworkContract (для expense)
- responsible_manager: FK → User
- responsible_engineer: FK → User
- number, name
- contract_date, start_date, end_date
- total_amount, currency
- vat_rate, vat_included
- status: planned / active / completed / terminated
- document_link, notes
```

**Методы:**
- `get_margin()` → Decimal
- `get_margin_details()` → Dict

#### ContractAmendment (Доп. соглашение)
```
- contract: FK → Contract
- number, date, reason
- new_start_date, new_end_date
- new_total_amount
- file
```

#### WorkScheduleItem (График работ)
```
- contract: FK → Contract
- name
- start_date, end_date
- workers_count
- status: pending / in_progress / done
```

#### Act (Акт выполненных работ)
```
- contract: FK → Contract
- number, date
- period_start, period_end
- amount_gross, amount_net, vat_amount
- status: draft / signed / cancelled
- due_date
- file, description
```

#### ActPaymentAllocation (Распределение оплат)
```
- act: FK → Act
- payment: FK → Payment
- amount
```

---

### 3.6. Payments (Платежи)

#### ExpenseCategory (Категория расходов/доходов)
```
- name, code
- parent: FK → self
- requires_contract
- is_active, sort_order
```

#### Payment (Платёж)
```
- account: FK → Account
- contract: FK → Contract
- category: FK → ExpenseCategory
- legal_entity: FK → LegalEntity
- payment_type: income / expense
- payment_date
- amount_gross, amount_net, vat_amount
- status: pending / paid / cancelled
- description
- scan_file: обязательный PDF-документ (счёт или акт)
- payment_registry: FK → PaymentRegistry (автоматически для expense)
- is_internal_transfer, internal_transfer_group
```

**Логика создания:**
- **income (приход)**: сразу статус `paid`
- **expense (расход)**: статус `pending`, автоматически создаётся запись в Реестре

#### PaymentRegistry (Реестр платежей — для согласования расходов)
```
- account: FK → Account
- category: FK → ExpenseCategory
- contract: FK → Contract
- act: FK → Act (постоплата) или null (аванс)
- amount, planned_date
- status: planned / approved / paid / cancelled
- initiator, approved_by, approved_at
- comment
- invoice_file
```

**Логика согласования:**
1. Расходный платёж создаётся → автоматически появляется заявка в Реестре (`planned`)
2. Финансовый директор согласовывает → статус `approved`
3. После оплаты → статус `paid`, платёж проводится

---

### 3.7. Communications (Переписка)

#### Correspondence (Переписка)
```
- contract: FK → Contract
- type: incoming / outgoing
- category: уведомление / претензия / запрос / ответ / прочее
- number, date
- status: новое / в работе / отвечено / закрыто
- subject, description
- file
- related_to: FK → self
```

---

### 3.8. Core (Базовые)

#### UserProfile (Профиль пользователя)
```
- user: OneToOne → User
- photo: аватар
```

#### TimestampedModel (Абстрактная)
```
- created_at, updated_at
```

#### VersionedModelMixin (Абстрактная)
```
- version_number
- is_current
- parent_version: FK → self
```

---

## 3.9. Диаграмма связей

```
Object (Объект)
├── Project[] (Проекты)
│   └── Estimate[] (Сметы)
│       ├── MountingEstimate[] (Монтажные сметы)
│       └── TechnicalProposal[] (ТКП)
│           ├── MountingProposal[] (МП)
│           └── Contract (Договор с Заказчиком)
├── Contract[] (Договоры)
│   ├── Act[] (Акты)
│   ├── Payment[] (Платежи)
│   ├── Correspondence[] (Переписка)
│   └── WorkScheduleItem[] (График работ)
└── MountingProposal[] (МП)
    └── Contract (Договор с Исполнителем)

LegalEntity (Наша компания)
├── TaxSystem (Налоговая система)
├── Account[] (Счета)
│   └── AccountBalance[] (Остатки)
├── Contract[] (Наши договоры)
├── FrameworkContract[] (Рамочные договоры)
└── TechnicalProposal[] (Наши ТКП)

Counterparty (Контрагент)
├── Contract[] (Договоры)
├── FrameworkContract[] (Рамочные — только vendor)
├── MountingProposal[] (МП — только vendor)
└── PriceListAgreement[] (Согласования — только vendor)

PriceList (Прайс-лист)
├── PriceListItem[] → WorkItem (Позиции)
├── PriceListAgreement[] → Counterparty (Согласования)
└── FrameworkContract[] (Рамочные договоры)
```

---

## 4. API Endpoints

### 4.0. Objects

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/objects/` | CRUD | Объекты строительства |
| `/api/v1/objects/{id}/` | GET | Детали объекта |
| `/api/v1/objects/{id}/cash_flow/` | GET | Cash-flow по объекту |

### 4.1. Accounting

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/legal-entities/` | GET, POST | Наши компании |
| `/api/v1/tax-systems/` | GET | Справочник налоговых систем |
| `/api/v1/accounts/` | GET, POST | Счета и кассы |
| `/api/v1/accounts/{id}/balance/` | GET | Остаток на счёте |
| `/api/v1/counterparties/` | GET, POST | Контрагенты |
| `/api/v1/expense-categories/` | GET, POST | Категории расходов |

### 4.2. Pricelists

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/worker-grades/` | CRUD | Разряды рабочих |
| `/api/v1/worker-grade-skills/` | CRUD | Навыки разрядов |
| `/api/v1/work-sections/` | CRUD | Разделы работ |
| `/api/v1/work-items/` | CRUD | Работы |
| `/api/v1/work-items/{id}/versions/` | GET | История версий |
| `/api/v1/price-lists/` | CRUD | Прайс-листы |
| `/api/v1/price-lists/{id}/create-version/` | POST | Новая версия |
| `/api/v1/price-lists/{id}/add-items/` | POST | Добавить работы |
| `/api/v1/price-lists/{id}/remove-items/` | POST | Удалить работы |
| `/api/v1/price-lists/{id}/export/` | GET | Экспорт в Excel |
| `/api/v1/price-list-items/` | GET, PATCH | Позиции прайс-листа |
| `/api/v1/price-list-agreements/` | CRUD | Согласования |

### 4.3. Estimates

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/projects/` | CRUD | Проекты |
| `/api/v1/projects/{id}/versions/` | GET | История версий |
| `/api/v1/projects/{id}/create-version/` | POST | Новая версия |
| `/api/v1/projects/{id}/primary-check/` | POST | Первичная проверка |
| `/api/v1/projects/{id}/secondary-check/` | POST | Вторичная проверка |
| `/api/v1/project-notes/` | CRUD | Замечания к проектам |
| `/api/v1/estimates/` | CRUD | Сметы |
| `/api/v1/estimates/{id}/versions/` | GET | История версий |
| `/api/v1/estimates/{id}/create-version/` | POST | Новая версия |
| `/api/v1/estimates/{id}/create-mounting-estimate/` | POST | Создать МС |
| `/api/v1/estimate-sections/` | CRUD | Разделы смет |
| `/api/v1/estimate-subsections/` | CRUD | Подразделы смет |
| `/api/v1/estimate-characteristics/` | CRUD | Характеристики |
| `/api/v1/mounting-estimates/` | CRUD | Монтажные сметы |
| `/api/v1/mounting-estimates/{id}/agree/` | POST | Согласовать с Исполнителем |

### 4.4. Proposals

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/front-of-work-items/` | CRUD | Справочник фронта работ |
| `/api/v1/mounting-conditions/` | CRUD | Справочник условий для МП |
| `/api/v1/technical-proposals/` | CRUD | ТКП |
| `/api/v1/technical-proposals/{id}/versions/` | GET | История версий |
| `/api/v1/technical-proposals/{id}/create-version/` | POST | Новая версия |
| `/api/v1/technical-proposals/{id}/add-estimates/` | POST | Добавить сметы |
| `/api/v1/technical-proposals/{id}/remove-estimates/` | POST | Удалить сметы |
| `/api/v1/technical-proposals/{id}/copy-from-estimates/` | POST | Скопировать данные |
| `/api/v1/technical-proposals/{id}/create-mp/` | POST | Создать МП |
| `/api/v1/tkp-sections/` | GET, PATCH, DELETE | Разделы в ТКП |
| `/api/v1/tkp-subsections/` | GET, PATCH, DELETE | Подразделы в ТКП |
| `/api/v1/tkp-characteristics/` | CRUD | Характеристики ТКП |
| `/api/v1/tkp-front-of-work/` | CRUD | Фронт работ ТКП |
| `/api/v1/mounting-proposals/` | CRUD | МП |
| `/api/v1/mounting-proposals/{id}/versions/` | GET | История версий |
| `/api/v1/mounting-proposals/{id}/create-version/` | POST | Новая версия |

### 4.5. Contracts

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/framework-contracts/` | CRUD | Рамочные договоры |
| `/api/v1/framework-contracts/{id}/contracts/` | GET | Связанные договоры |
| `/api/v1/framework-contracts/{id}/add-price-lists/` | POST | Добавить прайс-листы |
| `/api/v1/framework-contracts/{id}/activate/` | POST | Активировать |
| `/api/v1/framework-contracts/{id}/terminate/` | POST | Расторгнуть |
| `/api/v1/contracts/` | CRUD | Договоры |
| `/api/v1/contracts/{id}/balance/` | GET | Сальдо |
| `/api/v1/contracts/{id}/cash_flow/` | GET | Cash-flow |
| `/api/v1/contracts/{id}/correspondence/` | GET | Переписка |
| `/api/v1/contracts/{id}/schedule/` | GET | График работ |
| `/api/v1/contracts/{id}/amendments/` | POST | Доп. соглашения |
| `/api/v1/acts/` | CRUD | Акты |
| `/api/v1/acts/{id}/sign/` | POST | Подписать акт |

### 4.6. Payments

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/payment-registry/` | CRUD | Реестр платежей |
| `/api/v1/payment-registry/{id}/approve/` | POST | Одобрить |
| `/api/v1/payments/` | CRUD | Платежи |

### 4.7. Communications

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/correspondence/` | CRUD | Переписка |

---

## 5. Бизнес-логика

### 5.1. Работа с Заказчиком (Доходный договор)

```
Проект → Смета → ТКП → Договор → Акты → Платежи (income)
```

1. Загружаем **Проект** с проектной документацией
2. Создаём **Смету** на основе проекта
3. Создаём **ТКП** на основе сметы
4. После согласования ТКП создаём **Договор**
5. Выполняем работы, загружаем **Акты**
6. Получаем **Платежи** от Заказчика (сразу проводятся)

### 5.2. Работа с Исполнителем (Расходный договор)

```
МП → Договор → Акты → Платежи (expense) → Реестр → Согласование
```

1. Создаём **МП** (можно из ТКП или отдельно)
2. После согласования МП создаём **Договор** с Исполнителем
3. Принимаем работы через **Акты**
4. Создаём **Платёж** (автоматически попадает в Реестр)
5. Финансовый директор **согласовывает** в Реестре
6. После согласования платёж **проводится**

### 5.3. Единая форма создания платежей

Все платежи создаются через одну форму `/payments`:
- **Обязательный PDF**: к каждому платежу прикрепляется документ (счёт или акт)
- **Income (приход)**: проводится сразу (статус `paid`)
- **Expense (расход)**: создаётся со статусом `pending`, автоматически появляется в Реестре для согласования

### 5.4. Рамочные договоры

Рамочный договор — долгосрочное соглашение с Исполнителем:
- Содержит согласованные прайс-листы
- Под него создаются расходные договоры
- Не привязан к конкретному объекту

### 5.5. Расчёт баланса договора

```
Баланс = (Сумма подписанных Актов) - (Сумма проведённых Платежей)
```

- Для `income`: Положительный = Нам должны, Отрицательный = Аванс
- Для `expense`: Положительный = Мы должны, Отрицательный = Аванс

### 5.6. Маржинальность

```
Маржа = Доходы по Актам - Расходы по дочерним договорам
```

---

## 6. Прогресс разработки

### ✅ Backend — Полностью реализован

| Этап | Описание | Статус |
|------|----------|--------|
| 1 | Справочники и субъекты учёта | ✅ |
| 2 | Ядро SRM: Договоры и Акты | ✅ |
| 3 | Платежный конвейер | ✅ |
| 4 | Коммуникации | ✅ |
| 5 | Аналитика (Backend) | ✅ |
| 6 | Прайс-листы | ✅ |
| 7 | Проекты и Сметы | ✅ |
| 8 | ТКП и МП | ✅ |
| 9 | Рамочные договоры | ✅ |
| 10 | Рефакторинг | ✅ |

### 🚧 Frontend — В процессе

Фронтенд реализуется на Next.js + TypeScript + Shadcn UI.

### Рефакторинг (выполнен)

1. **Оптимизация запросов:** `select_related`, `prefetch_related`, `annotate`
2. **Версионирование:** `VersioningMixin`, `VersionedModelMixin`
3. **Сервисный слой:** `core/services.py`
4. **Кэширование:** `CachedPropertyMixin`, `@cached_property`
5. **Удаление файлов:** Автоматические сигналы
6. **Константы:** Централизованы в `core/constants.py`
7. **Генерация номеров:** Централизована в `core/number_generator.py`

---

## 7. Ограничения системы

1. **Кассовые разрывы:** Система не проверяет остатки на счёте перед созданием заявки (разрешены "виртуальные" разрывы).
2. **Мультивалютность:** Каждая валюта учитывается на отдельном счёте, кросс-курсы не пересчитываются автоматически.
3. **Telegram-публикация:** Только отметка о публикации, без интеграции с Telegram API.
4. **Удаление документов:** Нельзя удалить подписанный Акт или проведённый Платёж без предварительной отмены.

---

## 8. История изменений

### Версия 2.0 (13.12.2025) — Текущая

**Добавлено:**
- Приложение `pricelists` — прайс-листы на работы
- Приложение `estimates` — проекты и сметы
- Приложение `proposals` — ТКП и МП (заменили CommercialProposal)
- Рамочные договоры (FrameworkContract)
- Поля director в LegalEntity
- Поля responsible_manager, responsible_engineer в Contract
- Версионирование для WorkItem, PriceList, Project, Estimate, TKP, MP

**Удалено:**
- Модель CommercialProposal (заменена на TechnicalProposal + MountingProposal)
- Модель CommercialProposalEstimateFile (функционал перенесён в estimates)

**Рефакторинг:**
- Оптимизация N+1 запросов
- Сервисный слой (core/services.py)
- Централизация констант и генерации номеров

---

## Приложения

### A. Команды для разработки

```bash
# Запуск сервера
cd backend && python manage.py runserver

# Миграции
python manage.py makemigrations
python manage.py migrate

# Заполнение данных
python manage.py populate_db
python manage.py populate_pricelists
python manage.py populate_proposals

# Тесты
python manage.py test

# Проверка
python manage.py check
```

### B. Переменные окружения

```python
# settings.py
COMMERCIAL_PROPOSAL_START_NUMBER = 210  # Начальный номер ТКП
```

---

*Документация обновлена: 13.12.2025*
