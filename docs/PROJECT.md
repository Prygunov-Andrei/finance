# Проект Finans Assistant — Полная документация

**Версия:** 3.3
**Дата:** 27.02.2026
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
9. [Система разграничения доступа](#9-система-разграничения-доступа-erp-permissions)

---

## 1. Общее описание проекта

### Контекст

Строительная компания ведёт несколько объектов (строительные площадки, здания). Компания выступает как Генеральный подрядчик: заключает договоры с Заказчиками и привлекает Исполнителей (субподрядчиков) для выполнения работ.

### Цели системы

1. **SRM (Supplier Relationship Management):** Управление полным жизненным циклом взаимодействия с контрагентами — от заключения договора до закрытия актов и гарантийных обязательств.
2. **Финансовый контроль:** Централизация финансовых данных, контроль кассовых разрывов, управление дебиторской и кредиторской задолженностью.
3. **Зеркальный учет:** Связь доходов от Заказчиков с расходами на Исполнителей для расчета реальной маржинальности каждого объекта.
4. **Единое информационное пространство:** Хранение всей истории по объекту в одном месте.
5. **Управление снабжением:** Автоматизация процесса закупок через интеграцию с Bitrix24 CRM, включая распознавание счетов, управление очередью оплат и банковскую интеграцию.

### Роли пользователей

| Роль | Описание |
|------|----------|
| **Руководитель** | Видит сводку по объектам, маржинальность, статусы работ |
| **Финансовый директор** | Контролирует движение средств, согласовывает платежи |
| **Проектный менеджер** | Ведёт операционную работу, загружает акты и сканы |
| **Финансовый аналитик** | Вводит данные, формирует отчётность |
| **Оператор-Снабженец** | Обрабатывает запросы на снабжение, проверяет распознанные счета, управляет каталогом товаров |
| **Линейный бухгалтер** | Управляет периодическими платежами (аренда, коммунальные услуги), вносит доходы |
| **Директор-контролёр** | Одобряет счета к оплате, управляет очередью платежей, контролирует кредиторскую задолженность |

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
| Очередь задач | Celery + Redis |
| Интеграция CRM | Bitrix24 REST API |
| LLM | OpenAI / Gemini |
| Банковский API | Точка Банк API |

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
| `banking` | Интеграция с банком Точка, платёжные поручения, транзакции |
| `catalog` | Каталог товаров и услуг, модерация, ProductMatcher |
| `supply` | Интеграция с Bitrix24, запросы на снабжение |
| `personnel` | Кадры, сотрудники, разрешения ERP |
| `kanban_core` | Ядро канбан-микросервиса: Board, Column, Card |
| `kanban_supply` | Оверлей: кейсы снабжения (SupplyCase) |
| `kanban_object_tasks` | Оверлей: задачи по объектам |
| `kanban_commercial` | Оверлей: коммерческий пайплайн (CommercialCase) |

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
│   ├── banking/      # Интеграция с банком Точка
│   ├── catalog/      # Каталог товаров и услуг
│   ├── supply/       # Снабжение (Bitrix24 интеграция)
│   ├── personnel/    # Кадры, сотрудники
│   └── worklog/      # Сервис фиксации работ
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
- status: planned / in_progress / completed / suspended
- description
- photo: ImageField (upload, nullable) — фото объекта
- latitude, longitude, geo_radius: геозона
- allow_geo_bypass, registration_window_minutes: настройки журнала
```

**Карточка объекта (фронтенд):**
- Шапка: inline-редактирование полей (имя, адрес, описание), фото-аватар, статус (с подтверждением), даты
- 4 корневых вкладки:
  - **Основное**: Канбан задач, Журнал работ (График/Обзор/Смены/Медиа/Отчёты), Проекты, Канбан снабжения, ПТО, Финансы
  - **Заказчик**: Сметы, ТКП, Переписка, Договоры и ДОП, Акты, Сверки
  - **Исполнители**: Монтажные сметы, МП, Переписка, Договоры и ДОП, Акты, Сверки
  - **Настройки**: Приглашения, Геозона, Telegram, Удаление объекта (с подтверждением имени)

**API:**
- `GET/POST /api/v1/objects/` — список/создание (фильтр: `?status=`)
- `GET/PATCH/DELETE /api/v1/objects/{id}/` — детали/обновление/удаление
- `PUT /api/v1/objects/{id}/upload-photo/` — загрузка фото
- `GET /api/v1/objects/{id}/cash-flow/` — денежный поток

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
- type: customer / potential_customer / vendor / both / employee
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

#### EstimateItem (Строка сметы)
```
- estimate: FK → Estimate
- section: FK → EstimateSection
- subsection: FK → EstimateSubsection (nullable)
- sort_order, item_number
- name, model_name, unit, quantity
- material_unit_price, work_unit_price
- product: FK → Product (nullable)
- work_item: FK → WorkItem (nullable)
- is_analog, analog_reason, original_name
- source_price_history: FK → ProductPriceHistory (nullable)
```

**Вычисляемые свойства:**
- `material_total` = quantity × material_unit_price
- `work_total` = quantity × work_unit_price
- `line_total` = material_total + work_total

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
- is_active, is_default, sort_order
```

#### MountingCondition (Справочник "Условия для МП")
```
- name: "Проживание" / "Инструмент" / "Питание"
- description
- is_active, is_default, sort_order
```

#### TechnicalProposal (ТКП) — с версионированием
```
- number: автогенерация {порядковый}_{ДД.ММ.ГГ}
- outgoing_number, name, date
- due_date: DateField, null/blank — крайний срок выдачи ТКП Заказчику
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
- mounting_estimates: M2M → MountingEstimate
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
- `create_from_tkp(tkp, created_by, **extra)` → MountingProposal — принимает counterparty, total_amount, man_hours, notes, mounting_estimates_ids, conditions_ids
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
- act_type: ks2 / ks3 / simple
- contract_estimate: FK → ContractEstimate (nullable)
- status: draft / agreed / signed / cancelled
- due_date
- file, description
```

**Методы:**
- `create_from_accumulative()` — создание акта из накопительной ведомости

#### ActItem (Строка акта для КС-2/КС-3)
```
- act: FK → Act
- contract_estimate_item: FK → ContractEstimateItem (nullable)
- name, unit, quantity, unit_price, amount
- sort_order
```

#### ActPaymentAllocation (Распределение оплат)
```
- act: FK → Act
- payment: FK → Payment
- amount
```

#### ContractEstimate (Смета как приложение к договору)
```
- contract: FK → Contract
- source_estimate: FK → Estimate (nullable)
- number, name
- status: draft / agreed / signed
- signed_date (nullable)
- file: FileField (nullable)
- version_number: default 1
- parent_version: FK → self (nullable)
- amendment: FK → ContractAmendment (nullable)
- notes
```

**Методы:**
- `create_from_estimate()` — создание из сметы
- `split()` — разделение сметы
- `create_new_version()` — создание новой версии

#### ContractEstimateSection (Раздел сметы к договору)
```
- contract_estimate: FK → ContractEstimate
- name
- sort_order
```

#### ContractEstimateItem (Строка сметы к договору)
```
- contract_estimate: FK → ContractEstimate
- section: FK → ContractEstimateSection
- source_item: FK → EstimateItem (nullable)
- item_number, name, model_name, unit, quantity
- material_unit_price, work_unit_price
- product: FK → Product (nullable)
- work_item: FK → WorkItem (nullable)
- is_analog, analog_reason, original_name
- item_type: regular / consumable / additional
- sort_order
```

**Вычисляемые свойства:**
- `material_total` = quantity × material_unit_price
- `work_total` = quantity × work_unit_price
- `line_total` = material_total + work_total

#### ContractText (Текст договора в Markdown)
```
- contract: FK → Contract
- amendment: FK → ContractAmendment (nullable)
- content_md: TextField
- version: default 1
- created_by: FK → User
```

#### EstimatePurchaseLink (Связь строки сметы с позицией счёта)
```
- contract_estimate_item: FK → ContractEstimateItem
- invoice_item: FK → InvoiceItem
- quantity_matched
- match_type: exact / analog / substitute
- match_reason
- price_exceeds, quantity_exceeds: BooleanFields
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

#### Invoice (Счёт на оплату) — НОВАЯ ОСНОВНАЯ СУЩНОСТЬ
```
- source: bitrix / manual / recurring
- status: recognition / review / verified / in_registry / approved / sending / paid / cancelled
- invoice_file: PDF скан счёта
- invoice_number, invoice_date, due_date
- counterparty: FK → Counterparty
- object: FK → Object
- contract: FK → Contract
- category: FK → ExpenseCategory
- account: FK → Account
- legal_entity: FK → LegalEntity
- amount_gross, amount_net, vat_amount
- supply_request: FK → SupplyRequest
- recurring_payment: FK → RecurringPayment
- bank_payment_order: OneToOne → BankPaymentOrder
- estimate: FK → Estimate (nullable) — привязка к смете для «исследовательских» счетов сметчика
- description, comment
- recognition_confidence: float
- created_by, reviewed_by, reviewed_at, approved_by, approved_at, paid_at
```

**Гибридная архитектура Invoice-Estimate:**
- Если `estimate` заполнен — счёт является «исследовательским» (ценовое исследование сметчика). Такие счета НЕ видны снабженцу в разделе «Счета на оплату» (фильтр `estimate__isnull=True`).
- Если `estimate = NULL` — обычный счёт для снабженца/финансиста.
- Индекс: `(estimate, status)` для быстрой фильтрации.
- Related name: `estimate.research_invoices` — все исследовательские счета сметы.

#### InvoiceItem (Позиция счёта)
```
- invoice: FK → Invoice
- raw_name: оригинальное наименование из LLM
- product: FK → Product (после сопоставления)
- quantity, unit, price_per_unit, amount, vat_amount
```

#### InvoiceEvent (Событие по счёту)
```
- invoice: FK → Invoice
- event_type: created / recognized / reviewed / submitted / approved / rejected / rescheduled / sent_to_bank / paid / cancelled
- user, old_value, new_value, comment
```

#### RecurringPayment (Периодический платёж)
```
- name: "Аренда офиса" и т.п.
- counterparty, category, account, contract, object, legal_entity
- amount, amount_is_fixed
- frequency: monthly / quarterly / yearly
- day_of_month, start_date, end_date, next_generation_date
- description, is_active
```

#### IncomeRecord (Запись о доходе)
```
- account, contract, category, legal_entity, counterparty
- amount, payment_date, description, scan_file
```

#### Payment (Платёж) — **LEGACY** (будет удалена в будущих версиях)
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

#### PaymentRegistry (Реестр платежей) — **LEGACY** (будет удалена в будущих версиях)
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
│       ├── EstimateItem[] (Строки сметы)
│       ├── MountingEstimate[] (Монтажные сметы)
│       └── TechnicalProposal[] (ТКП)
│           ├── MountingProposal[] (МП)
│           └── Contract (Договор с Заказчиком)
├── Contract[] (Договоры)
│   ├── ContractEstimate[] (Сметы к договору)
│   │   ├── ContractEstimateSection[] (Разделы)
│   │   └── ContractEstimateItem[] (Строки)
│   │       └── EstimatePurchaseLink[] (Связи с позициями счетов)
│   ├── ContractText[] (Тексты договора в MD)
│   ├── Act[] (Акты)
│   │   └── ActItem[] (Строки акта)
│   ├── Payment[] (Платежи)
│   ├── Correspondence[] (Переписка)
│   └── WorkScheduleItem[] (График работ)
└── MountingProposal[] (МП)
    └── Contract (Договор с Исполнителем)

Product (Товар)
└── ProductWorkMapping[] → WorkItem (Сопоставления с работами)

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

SupplyRequest (Запрос на снабжение)
├── BitrixIntegration (Настройки Bitrix24)
├── Invoice[] (Счета)
│   ├── InvoiceItem[] (Позиции)
│   ├── InvoiceEvent[] (История)
│   └── BankPaymentOrder (Платёжное поручение)
└── Object, Contract (Привязки)

RecurringPayment (Периодический платёж)
└── Invoice[] (Автогенерируемые счета)

Notification (Уведомления)
└── User (Получатель)
```

---

### 3.10. Banking (Банковская интеграция)

#### BankAccount (Банковский счёт)
```
- bank_name, bik, corr_account
- account_type: расчётный / депозит
- tochka_account_id
```

#### BankTransaction (Банковская транзакция)
```
- bank_account: FK → BankAccount
- transaction_type: debit / credit
- amount, date
- counterparty_name, counterparty_inn
- payment: FK → Payment (LEGACY)
- invoice: FK → Invoice (new)
- reconciled: bool
```

#### BankPaymentOrder (Платёжное поручение)
```
- bank_account: FK → BankAccount
- payment_registry: FK → PaymentRegistry (LEGACY)
- invoice: через Invoice.bank_payment_order (OneToOne)
- status: draft / pending_approval / approved / sent_to_bank / pending_sign / executed / rejected / failed
- recipient details, amount, purpose
- vat_info
```

---

### 3.11. Supply (Снабжение)

#### BitrixIntegration (Настройки интеграции Bitrix24)
```
- name, portal_url, webhook_url
- outgoing_webhook_token
- target_category_id, target_stage_id
- contract_field_mapping, object_field_mapping
- is_active
```

#### SupplyRequest (Запрос на снабжение)
```
- bitrix_integration: FK → BitrixIntegration
- bitrix_deal_id, bitrix_deal_title
- object: FK → Object
- contract: FK → Contract
- operator: FK → User
- request_text, request_file, notes
- amount
- status: received / processing / completed / error
- mapping_errors, raw_deal_data
```

---

### 3.12. Catalog (Каталог товаров и услуг)

#### ProductCategory (Категория товаров)
```
- name
- parent: FK → self
- is_active
```

#### Product (Товар/Услуга)
```
- name
- category: FK → ProductCategory
- sku, unit
- is_active
- created_from_invoice
```

#### ProductAlias (Алиас товара)
```
- product: FK → Product
- alias_name: unique
```

#### ProductWorkMapping (Сопоставление товара с работой)
```
- product: FK → Product
- work_item: FK → WorkItem
- confidence: float (1.0 = manual)
- source: manual / rule / llm
- usage_count: default 1
unique: (product, work_item)
```

#### ProductMatcher (Сервис сопоставления)
```
Двухуровневое сопоставление:
1. Fuzzy matching (fuzzywuzzy) — быстрый поиск по названию и алиасам
2. LLM matching — семантическое сравнение для неоднозначных случаев
```

---

### 3.13. Notifications (Уведомления)

#### Notification (Уведомление)
```
- user: FK → User
- notification_type
- title, message
- data: JSON
- is_read
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
| `/api/v1/estimate-items/` | CRUD | Строки сметы |
| `/api/v1/estimate-items/bulk-create/` | POST | Массовое создание строк |
| `/api/v1/estimate-items/bulk-update/` | PATCH | Массовое обновление строк |
| `/api/v1/estimate-items/auto-match/` | POST | Автосопоставление с каталогом |
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
| `/api/v1/acts/{id}/agree/` | POST | Согласовать акт |
| `/api/v1/acts/from-accumulative/` | POST | Создать акт из накопительной ведомости |
| `/api/v1/contract-estimates/` | CRUD | Сметы к договору |
| `/api/v1/contract-estimates/from-estimate/` | POST | Создать из сметы |
| `/api/v1/contract-estimates/{id}/create-version/` | POST | Новая версия |
| `/api/v1/contract-estimates/{id}/split/` | POST | Разделить смету |
| `/api/v1/contract-estimate-sections/` | CRUD | Разделы смет к договору |
| `/api/v1/contract-estimate-items/` | CRUD | Строки смет к договору |
| `/api/v1/contract-texts/` | CRUD | Тексты договоров (MD) |
| `/api/v1/estimate-purchase-links/` | CRUD | Связи строк сметы со счетами |
| `/api/v1/estimate-purchase-links/check-invoice/` | POST | Проверить счёт по смете |
| `/api/v1/estimate-purchase-links/auto-link/` | POST | Автосвязывание позиций |
| `/api/v1/contracts/{id}/accumulative-estimate/` | GET | Накопительная ведомость |
| `/api/v1/contracts/{id}/accumulative-estimate/export/` | GET | Экспорт в Excel |
| `/api/v1/contracts/{id}/estimate-remainder/` | GET | Остаток по смете |
| `/api/v1/contracts/{id}/estimate-deviations/` | GET | Отклонения по смете |

### 4.6. Payments

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/invoices/` | GET, POST | Счета на оплату |
| `/api/v1/invoices/{id}/` | GET, PATCH | Детали и редактирование счёта |
| `/api/v1/invoices/{id}/verify/` | POST | Подтвердить данные (REVIEW → VERIFIED) |
| `/api/v1/invoices/{id}/submit_to_registry/` | POST | Отправить в реестр (VERIFIED → IN_REGISTRY) |
| `/api/v1/invoices/{id}/approve/` | POST | Одобрить к оплате |
| `/api/v1/invoices/{id}/reject/` | POST | Отклонить |
| `/api/v1/invoices/{id}/reschedule/` | POST | Перенести дату оплаты |
| `/api/v1/invoices/dashboard/` | GET | Дашборд директора |
| `/api/v1/recurring-payments/` | CRUD | Периодические платежи |
| `/api/v1/income-records/` | CRUD | Записи о доходах |
| `/api/v1/expense-categories/` | GET, POST | Категории расходов |
| `/api/v1/payments/` | CRUD | **LEGACY** Платежи |
| `/api/v1/payment-registry/` | CRUD | **LEGACY** Реестр платежей |

### 4.7. Communications

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/correspondence/` | CRUD | Переписка |

### 4.8. Supply

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/supply-requests/` | GET | Запросы на снабжение |
| `/api/v1/supply-requests/{id}/` | GET, PATCH | Детали запроса |
| `/api/v1/bitrix-integrations/` | CRUD | Настройки Bitrix24 |
| `/api/v1/supply/webhook/bitrix/` | POST | Webhook от Bitrix24 |

### 4.9. Banking

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/bank-accounts/` | GET, POST | Банковские счета |
| `/api/v1/bank-accounts/{id}/sync/` | POST | Синхронизация с банком |
| `/api/v1/bank-transactions/` | GET | Банковские транзакции |
| `/api/v1/bank-transactions/{id}/reconcile/` | POST | Ручная сверка |
| `/api/v1/bank-payment-orders/` | CRUD | Платёжные поручения |
| `/api/v1/bank-payment-orders/{id}/approve/` | POST | Одобрить |
| `/api/v1/bank-payment-orders/{id}/send/` | POST | Отправить в банк |

### 4.10. Notifications

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/notifications/` | GET | Уведомления пользователя |
| `/api/v1/notifications/{id}/mark_read/` | POST | Отметить прочитанным |
| `/api/v1/notifications/mark_all_read/` | POST | Отметить все прочитанными |
| `/api/v1/notifications/unread_count/` | GET | Количество непрочитанных |

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

### 5.7. Workflow снабжения (Bitrix24 → ERP → Банк)

```
Bitrix24 CRM (Канбан) → Webhook → SupplyRequest → Invoice (recognition) →
→ Оператор (review) → Проверен (verified) → [опционально] Реестр (in_registry) →
→ Директор-контролёр (approve/reject/reschedule) →
→ BankPaymentOrder (sending) → Банк → Оплачено (paid)
```

1. Карточка в Bitrix24 перемещается в столбец "Передан в Оплату"
2. Webhook отправляет данные в ERP → создаётся SupplyRequest
3. Celery-задача скачивает файлы, парсит заголовок, определяет Объект и Договор
4. LLM распознаёт PDF счёта → создаётся Invoice со статусом `review` (товары НЕ создаются в каталоге)
5. Оператор проверяет распознавание, исправляет данные, нажимает «Подтвердить» → статус `verified`, товары создаются в каталоге
6. Оператор решает отправить счёт в реестр → статус `in_registry` (не все счета идут на оплату)
7. Директор-контролёр видит дашборд, одобряет/отклоняет/переносит
8. Одобренный Invoice → создаётся BankPaymentOrder → отправляется в банк
9. После исполнения банком → Invoice получает статус `paid`

> **Примечание:** Сметчик может запрашивать счета для сравнения цен при подготовке ТКП. Такие счета остаются в статусе `verified` и НЕ попадают в реестр оплат.

### 5.8. Периодические платежи

- Линейный бухгалтер настраивает RecurringPayment (аренда, коммуналка)
- Celery Beat ежедневно генерирует Invoice из RecurringPayment
- Invoice сразу попадает в реестр для одобрения директором

### 5.9. ProductMatcher — Двухуровневое сопоставление

1. Fuzzy matching (fuzzywuzzy) — быстрый поиск по названию и алиасам
2. LLM matching — семантическое сравнение для неоднозначных случаев
3. Результат: автоматическое сопоставление позиций счёта с каталогом

**Важно:** Сопоставление и создание товаров происходит только на этапе `verify` (не при распознавании). Это гарантирует, что ошибки OCR не попадают в каталог.

### 5.10. AccumulativeEstimateService — Накопительная ведомость

**Файл:** `contracts/services/accumulative_estimate.py`

Сервис формирования накопительной ведомости по договору:
- Агрегация выполненных объёмов по всем подписанным/согласованным актам
- Расчёт остатков по каждой позиции сметы к договору
- Экспорт в Excel (формат КС-6а)

### 5.11. EstimateComplianceChecker — Проверка соответствия смете

**Файл:** `contracts/services/estimate_compliance_checker.py`

Сервис проверки соответствия закупок смете к договору:
- Контроль превышения цен (price_exceeds)
- Контроль превышения объёмов (quantity_exceeds)
- Выявление отклонений (замены, аналоги, дополнительные позиции)
- Формирование отчёта об отклонениях

### 5.12. EstimateAutoMatcher — Автосопоставление позиций сметы

**Файл:** `estimates/services/estimate_auto_matcher.py`

Сервис автоматического сопоставления строк сметы с каталогом товаров и работ:
- Fuzzy-matching по названию с каталогом Product
- Сопоставление с WorkItem через ProductWorkMapping
- Учёт алиасов (ProductAlias) и истории цен (ProductPriceHistory)

**Ключевые методы:**

| Метод | Описание |
|-------|----------|
| `preview_matches(estimate)` | Preview-подбор цен из счетов **без сохранения** в БД. Возвращает `List[Dict]` с per-item результатами: `item_id`, `name`, `matched_product`, `product_confidence`, `invoice_info` (поставщик, номер счёта, дата), `source_price_history_id`. Используется для диалога «Подобрать цены из счетов» |
| `match_prices(estimate)` | Подбор и **сохранение** Product + цены из ProductPriceHistory для строк без product |
| `match_works(estimate, price_list_id)` | Подбор WorkItem: история (ProductWorkMapping) → правила по Category → LLM fallback |
| `auto_fill(estimate, price_list_id)` | Комбинация match_prices + match_works |
| `record_manual_correction(product, work_item)` | Обновление ProductWorkMapping при ручной правке сметчиком |

**API endpoint:** `POST /api/v1/estimates/{id}/auto_match/` — вызывает `preview_matches()`, возвращает массив `AutoMatchResult[]`. Фронтенд показывает таблицу с чекбоксами, пользователь принимает/отклоняет, затем отправляет `bulkUpdateEstimateItems()`.

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
| 11 | Каталог товаров и парсинг счетов | ✅ |
| 12 | Банковская интеграция (Точка) | ✅ |
| 13 | Модуль Снабжение + Bitrix24 | ✅ |
| 14 | Новый платёжный конвейер (Invoice) | ✅ |
| 15 | Периодические платежи | ✅ |
| 16 | Уведомления | ✅ |
| 17 | Фронтенд модуля Снабжение | ✅ |

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
5. **Bitrix24 зависимость:** Интеграция работает только через REST API webhooks, требуется стабильное интернет-соединение.
6. **LLM зависимость:** Распознавание счетов требует доступа к OpenAI/Gemini API.

---

## 8. История изменений

### Версия 3.4 (24.02.2026) — Текущая

**МП (Монтажные предложения):**
- Фикс фильтров по Объекту и Контрагенту в `MountingProposalsList.tsx`: `objects?.results?.map` → `Array.isArray(objects) ? objects : objects?.results ?? []`
- `MountingProposalDetail.tsx` полностью переработан: inline-редактирование (isEditing state, editFormData, Input/Select вместо текста, кнопки Сохранить/Отмена в хедере)
- Исправлены пути навигации: `/mounting-proposals` → `/proposals/mounting-proposals`
- При редактировании поля: имя, дата, контрагент (select из useCounterparties), статус, примечания, сумма, трудозатраты

**UI конвенция:** inline-редактирование реализовано для ТКП и МП — паттерн: `isEditing` state + `editFormData` + `handleStartEditing/handleCancelEditing/handleSaveEditing`.

---

### Версия 3.3 (24.02.2026)

**Добавлено:**
- Поле `due_date` (DateField, null/blank) в модели `TechnicalProposal` — крайний срок выдачи ТКП Заказчику
  - Миграция `0004_add_due_date_to_technical_proposal`
  - Добавлено в `TechnicalProposalListSerializer` и `TechnicalProposalDetailSerializer`
  - Фронтенд: колонка «Дата выдачи» в таблице ТКП с подсветкой (красный — просрочено, оранжевый — <=3 дня)
  - Поле ввода в диалоге создания/редактирования ТКП
  - Отображение в детальной странице ТКП
- Колонка «Создано» (`created_at`) в таблице списка ТКП
- Отображение «Потенциальный Заказчик» (`erp_counterparty_name`) в карточках канбана КП
  - Сохраняется в `card.meta` при создании/обновлении карточки
  - Отображается третьей строкой в `KanbanCardCompact`
- Проп `hideClose` в компоненте `DialogContent` (`ui/dialog.tsx`) для скрытия крестика

**Исправлено:**
- Краш страницы детали ТКП: добавлены недостающие импорты иконок (Building2, Calendar, Clock, DollarSign, TrendingUp, User, FileCheck, X)
- Фильтры «Объект» и «Компания» в списке ТКП и диалоге создания: API уже возвращает массив, а код обращался к `.results`
- Фиксированная высота диалога канбана КП (85vh) — не меняется при переключении табов
- Убран дублирующий крестик (X) из диалога карточки канбана КП

**Рефакторинг:**
- Убраны inline-действия из таблиц: ТКП, МП, Контрагенты, Каталог товаров. Строки сделаны кликабельными

**UI конвенция:** таблицы сущностей с detail-страницей не содержат inline-кнопок «Открыть/Удалить» — строка целиком кликабельна и ведёт на детальную страницу. Таблицы справочников без detail-страницы сохраняют inline-действия.

**Тесты:**
- Backend: `TKPDueDateTests` (8 тестов) — создание, сериализация, PATCH, очистка, прошедшая дата
- Frontend: `tkp-due-date.test.tsx` (9 тестов) — подсветка дедлайнов, counterparty в карточке канбана

---

### Версия 3.3 (27.02.2026)

**Добавлено:**
- **Гибридная архитектура Invoice-Estimate:** FK `estimate` в Invoice — разделение «исследовательских» счетов сметчика и обычных счетов снабженца. Счета привязанные к смете не видны в списке снабженца (фильтр `estimate__isnull=True`)
- Метод `EstimateAutoMatcher.preview_matches()` — предварительный подбор цен из счетов без сохранения в БД, с информацией об источнике (поставщик, номер счёта, дата)
- Endpoint `auto_match` переключён с `auto_fill()` на `preview_matches()` — теперь возвращает `AutoMatchResult[]` вместо агрегированных stats
- Компонент `EstimateSupplierInvoices` (`frontend/components/estimates/EstimateSupplierInvoices.tsx`) — вкладка «Счета поставщиков» в редакторе сметы: загрузка, статусы, навигация к проверке
- Вкладка «Счета поставщиков» в `EstimateDetail.tsx`
- `BulkInvoiceUpload` — опциональный prop `estimateId` для привязки загруженных счетов к смете
- `InvoiceDetailPage` — условная обратная навигация: если счёт привязан к смете, кнопка «Назад» ведёт обратно в смету
- `InvoiceFilter` — фильтры `estimate__isnull` и `estimate` для разделения счетов по контексту
- `InvoiceListSerializer` — поля `estimate_number`, `items_count`
- `AutoMatchDialog` — колонка «Источник цены» (поставщик + счёт), заголовок «Подобрать цены из счетов»
- `AutoMatchResult` — поля `invoice_info`, `source_price_history_id`

### Версия 3.2 (23.02.2026)

**Добавлено:**
- Компонент `DataTable` (`frontend/components/ui/data-table.tsx`) — переиспользуемая таблица на TanStack Table + react-virtual:
  - Виртуализация строк (5000+), сортировка, глобальная фильтрация, inline-редактирование ячеек, выделение строк (checkbox), группировка, footer с итогами
- Новые типы в `api.ts`: `EstimateItem`, `CreateEstimateItemData`, `AutoMatchResult`, `EstimateImportPreview`, `EstimateDeviationRow`, `EstimatePurchaseLink`, `InvoiceComplianceResult`
- Новые API-методы в `ApiClient`: CRUD EstimateItem (`getEstimateItems`, `createEstimateItem`, `updateEstimateItem`, `deleteEstimateItem`), bulk-операции (`bulkCreateEstimateItems`, `bulkUpdateEstimateItems`), `autoMatchEstimateItems`, `importEstimateFile`, CRUD ContractEstimateItem/Section, `createContractEstimateVersion`, `splitContractEstimate`, `updateContractText`, `deleteContractText`, `checkInvoiceCompliance`, `autoLinkInvoice`, `getEstimateDeviations`
- Frontend тесты: DataTable (12 тестов — рендер, сортировка, фильтрация, row selection, inline edit, custom row class, footer, virtualization)
- Зависимости: `@tanstack/react-table`, `@tanstack/react-virtual`
- Компонент `EstimateItemsEditor` (`frontend/components/estimates/EstimateItemsEditor.tsx`) — табличный редактор строк сметы:
  - Inline-editing ячеек с debounced auto-save (PATCH), добавление строк через диалог, вставка из Excel (парсинг TSV), bulk-удаление выделенных строк, итоговые суммы (материалы, работы, всего), фильтрация/поиск, цветовая индикация аналогов, read-only режим для утверждённых смет
  - Интегрирован как вкладка «Строки сметы» в `EstimateDetail.tsx`
- Бэкенд сервис импорта смет `EstimateImportService` (`backend/estimates/services/estimate_import_service.py`):
  - `import_from_excel()` — парсинг Excel через openpyxl с автоопределением заголовков, разделов, итоговых строк
  - `import_from_pdf()` — парсинг PDF через LLM с Pydantic-схемами
  - `save_imported_items()` — сохранение распознанных строк в EstimateItem с созданием EstimateSection
  - Endpoint: `POST /api/v1/estimate-items/import/` (preview + confirm режимы)
- Компонент `EstimateImportDialog` (`frontend/components/estimates/EstimateImportDialog.tsx`) — 4-шаговый wizard: drag-n-drop, парсинг, предпросмотр, подтверждение
- Компонент `AutoMatchDialog` (`frontend/components/estimates/AutoMatchDialog.tsx`) — автоподбор цен и работ с выбором прайс-листа, таблицей результатов, уверенностью, accept/reject
- Компонент `ContractEstimateDetail` (`frontend/components/contracts/ContractEstimateDetail.tsx`) — страница детальной сметы к договору с таблицей строк, итогами, действиями (согласовать, подписать, создать версию)
- Компонент `AccumulativeEstimateView` (`frontend/components/contracts/AccumulativeEstimateView.tsx`) — накопительная смета с цветовой индикацией и экспортом в Excel
- Компонент `EstimateRemainderView` (`frontend/components/contracts/EstimateRemainderView.tsx`) — остатки по смете
- Компонент `EstimateDeviationsView` (`frontend/components/contracts/EstimateDeviationsView.tsx`) — отклонения с фильтром по типу
- Компонент `ActCreateDialog` (`frontend/components/contracts/ActCreateDialog.tsx`) — создание актов КС-2/КС-3/Простой с выбором строк из накопительной сметы
- Компонент `ActDetailPage` (`frontend/components/contracts/ActDetailPage.tsx`) — страница акта с позициями, суммами, действиями согласования/подписания
- Компонент `InvoiceComplianceView` (`frontend/components/contracts/InvoiceComplianceView.tsx`) — проверка счёта на соответствие смете, авто-сопоставление
- Компонент `ContractTextEditor` (`frontend/components/contracts/ContractTextEditor.tsx`) — Markdown-редактор текста договора с версионированием и preview
- Новые маршруты: `/contracts/estimates/:id`, обновлён `/contracts/acts/:id`
- Вкладка «Текст договора» в `ContractDetail.tsx`

### Версия 3.1 (15.02.2026)

**Добавлено:**
- Реорганизация левого меню: 11 корневых разделов, process-centric навигация, max 2 уровня вложенности
- Тип контрагента `potential_customer` (Потенциальный Заказчик) с фильтрами и оранжевым бейджем
- Поле `is_default` в FrontOfWorkItem и MountingCondition для предвыбора в формах ТКП/МП
- Изменение MountingProposal: `mounting_estimate` FK → `mounting_estimates` M2M (множественные монтажные сметы)
- Приложение `kanban_commercial` — оверлей коммерческого пайплайна (CommercialCase)
- Единый Kanban board `commercial_pipeline` с 12 колонками и механизмом «тоннеля» (Маркетинг ↔ КП)
- Формы ТКП/МП с табами: мульти-выбор смет по объекту + предвыбор фронта работ / условий МП
- Объединённая страница «Фронт работ и монтажные условия» в Справочниках
- Справочная система на Markdown (react-markdown, HelpIndexPage, MarkdownPage, public/help/)
- Страница «Инструкции» в разделе КП с подробной документацией пользователю
- Frontend тесты: kanban visibleColumnKeys, формы ТКП/МП, help рендеринг, counterparties (93 теста)
- Backend тесты: potential_customer, is_default, M2M mounting_estimates, CommercialCase overlay

**Изменено:**
- Фронт работ и Условия для МП перенесены из КП в «Справочники и Настройки»
- «Поиск объектов» в Маркетинге заменён на «Канбан поиска объектов»
- Добавлен ярлык «Сметы ↗» в раздел КП (источник истины — Договоры)

### Версия 3.0 (14.02.2026)

**Добавлено:**
- Приложение `supply` — интеграция с Bitrix24, управление запросами на снабжение
- Приложение `banking` — полная интеграция с банком Точка (транзакции, платёжные поручения)
- Приложение `catalog` — каталог товаров и услуг, ProductMatcher с LLM
- Модель Invoice — единая сущность для управления счетами на оплату
- Модель RecurringPayment — периодические платежи
- Модель IncomeRecord — упрощённый учёт доходов
- Модель Notification — push-уведомления в браузере
- Дашборд директора с аналитикой по кредиторской задолженности
- Workflow снабжения: Bitrix24 → Распознавание → Проверка → Одобрение → Банк
- Celery + Redis для асинхронных задач
- Фронтенд модуля Снабжение (7 страниц)

**Устарело (LEGACY):**
- Модели Payment и PaymentRegistry (замены: Invoice, IncomeRecord)
- PaymentViewSet и PaymentRegistryViewSet (замены: InvoiceViewSet, IncomeRecordViewSet)

### Версия 2.0 (13.12.2025)

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

## 9. Система разграничения доступа (ERP Permissions)

### Архитектура

Доступ к разделам и подразделам системы определяется полем `Employee.erp_permissions` (JSONField). Используется плоский словарь с **точечной нотацией** для подразделов (вдохновлено IAM-системами):

```json
{
  "dashboard": "read",
  "commercial": "edit",
  "commercial.kanban": "edit",
  "commercial.tkp": "read",
  "settings": "read",
  "settings.personnel": "none",
  "settings.goods": "edit"
}
```

| Уровень | Поведение |
|---------|-----------|
| `none`  | Раздел/подраздел скрыт из меню, API возвращает 403 |
| `read`  | Видим, доступ только на чтение (GET) |
| `edit`  | Полный доступ (CRUD) |

### ERP_PERMISSION_TREE — реестр разделов

Файл: `backend/personnel/models.py`

Реестр `ERP_PERMISSION_TREE` определяет иерархию разделов и подразделов. Функция `get_all_permission_keys()` возвращает плоский список всех допустимых ключей.

| Раздел | Подразделы |
|--------|------------|
| `dashboard` | — |
| `commercial` | kanban, tkp, mp, estimates, pricelists |
| `objects` | — |
| `finance` | dashboard, payments, statements, recurring, debtors, accounting, budget, indicators |
| `contracts` | framework, object_contracts, estimates, mounting_estimates, acts, household |
| `supply` | kanban, invoices, drivers, moderation, warehouse |
| `pto` | projects, production, executive, samples, knowledge |
| `marketing` | kanban, potential_customers, executors |
| `communications` | — |
| `settings` | goods, work_conditions, personnel, counterparties, config |
| `help` | — |
| `finance_approve` | — (спец-разрешение) |
| `supply_approve` | — (спец-разрешение) |
| `kanban_admin` | — (спец-разрешение) |

### Разрешение уровня доступа (fallback)

Функция `resolve_permission_level(perms, key)` (`backend/personnel/models.py`):

1. Ищет ключ `key` напрямую (например `settings.personnel`)
2. Если не найден и ключ содержит `.` — fallback на родительский раздел (`settings`)
3. Если родитель не найден — возвращает `'none'`

Это позволяет задавать доступ на уровне раздела целиком, а затем точечно переопределять отдельные подразделы.

### Бэкенд: ERPSectionPermission

Файл: `backend/personnel/permissions.py`

`SECTION_MAP` маппит URL-prefix на ключи с точечной нотацией (например `/api/v1/personnel/` → `settings.personnel`, `/api/v1/catalog/` → `settings.goods`). Использует `resolve_permission_level()` для проверки с fallback.

### Фронтенд: usePermissions

Файл: `frontend/hooks/usePermissions.ts`

- `resolveLevel(permissions, section)` — зеркало бекенд-логики fallback
- `hasAccess(section, minLevel)` — проверка доступа с поддержкой точечной нотации
- `canEdit(section)` — сокращение для `hasAccess(section, 'edit')`

### Фронтенд: useBreadcrumb

Файл: `frontend/hooks/useBreadcrumb.tsx`

- `BreadcrumbProvider` — контекст, оборачивающий роутер в App.tsx
- `useBreadcrumb()` — хук, возвращающий `{ detailLabel, setDetailLabel }`
- Детальные страницы вызывают `setDetailLabel(label)` при загрузке данных и `setDetailLabel(null)` при unmount
- `Layout.tsx` использует `detailLabel` вместо ID из URL при формировании хлебных крошек
- Пример: `TechnicalProposalDetail.tsx` передаёт `ТКП ${tkp.number}` → крошки показывают «ТКП 221_23.02.26» вместо «№88»

### Фронтенд: фильтрация меню и защита маршрутов

- **Layout.tsx**: каждый `MenuItem` и каждый дочерний пункт имеют `section` (например `'settings.personnel'`). Пункты с `hasAccess(section) === false` скрываются.
- **App.tsx**: ВСЕ маршруты защищены `<ProtectedRoute requiredSection="...">`. Редирект при отсутствии доступа — на первый доступный раздел.
- **PersonnelTab.tsx**: иерархический UI — разделы с раскрывающимися подразделами, каскадное обновление при изменении родителя.

### Привязка User ↔ Employee

- Модель: `Employee.user` — `OneToOneField` к `auth.User`
- Форма: `PersonnelTab.tsx` → поле «Учётная запись (User)»
- API: `UserSerializer` возвращает `erp_permissions`, `employee_id`, `is_superuser`

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

*Документация обновлена: 23.02.2026*
