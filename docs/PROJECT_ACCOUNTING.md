# Проектирование системы учёта: юридические лица, счета и налогообложение

## Суть системы

**Цель:** Учёт финансовых операций компании с несколькими юридическими лицами, множеством счетов (20+) в разных валютах и формах (наличные/безналичные).

**Ключевые возможности:**
- Управление юридическими лицами и их системами налогообложения
- Управление счетами (расчётные, кассы) в разных валютах
- Workflow одобрения расходных платежей через Реестр платежей
- Автоматический расчёт остатков на счетах
- Аналитика по каждому счёту и по всем счетам

---

## Требования к системе

### Бизнес-требования

1. **Несколько юридических лиц**
   - У компании может быть несколько юридических лиц (ООО, ИП и т.д.)
   - Каждое юридическое лицо ведёт свою деятельность
   - Можно создавать новые юридические лица

2. **Системы налогообложения для каждого юридического лица**
   - ОСН с НДС 5%
   - ОСН с НДС 10%
   - ОСН с НДС 20%
   - УСН (доходы)
   - УСН (доходы - расходы)
   - Без НДС

3. **Счета для каждого юридического лица (20+ счетов)**
   - Несколько расчётных счетов в разных банках
   - Несколько наличных касс
   - Счета в разных валютах (RUB, USD, EUR и т.д.)
   - Можно создавать новые счета

4. **Workflow расходных платежей**
   - Каждый расходной платёж сначала попадает в Реестр платежей
   - В Реестре одобряется ответственным лицом
   - После одобрения создаётся фактический Payment
   - И только тогда списываются средства со счёта

5. **Поступления (доходы)**
   - Создаются сразу как Payment (без Реестра)
   - Средства зачисляются на счёт сразу

6. **Аналитика**
   - Остатки по каждому счёту
   - Остатки по всем счетам
   - История движений по счёту

---

## Проектирование моделей

### 1. Модель LegalEntity (Юридическое лицо)

**Поля:**
- `id` — уникальный идентификатор
- `name` — полное наименование (ООО "СтройКомпания")
- `short_name` — краткое наименование (ООО "СК")
- `inn` — ИНН (уникальный, CharField, max_length=12)
- `kpp` — КПП (опционально, CharField, max_length=9)
- `ogrn` — ОГРН (опционально, CharField, max_length=15)
- `tax_system` — система налогообложения (ForeignKey на TaxSystem)
- `is_active` — активно ли юридическое лицо (Boolean, default=True)
- `created_at`, `updated_at` — временные метки

**Связи:**
- Имеет множество счетов (`accounts`)
- Имеет множество договоров (`contracts`)
- Имеет систему налогообложения (`tax_system`)

**Ограничения:**
- ИНН уникален

---

### 2. Модель TaxSystem (Система налогообложения)

**Поля:**
- `id` — уникальный идентификатор
- `code` — код системы (unique): "osn_vat_20", "osn_vat_10", "osn_vat_5", "usn_income", "usn_income_expense", "no_vat"
- `name` — название: "ОСН с НДС 20%", "УСН (доходы)", "Без НДС"
- `vat_rate` — ставка НДС (Decimal, nullable): 20.00, 10.00, 5.00, null
- `has_vat` — есть ли НДС (Boolean)
- `description` — описание
- `is_active` — активно ли

**Примеры:**
- `osn_vat_20` — ОСН с НДС 20%, vat_rate=20.00, has_vat=true
- `osn_vat_10` — ОСН с НДС 10%, vat_rate=10.00, has_vat=true
- `osn_vat_5` — ОСН с НДС 5%, vat_rate=5.00, has_vat=true
- `usn_income` — УСН (доходы), vat_rate=null, has_vat=false
- `usn_income_expense` — УСН (доходы-расходы), vat_rate=null, has_vat=false
- `no_vat` — Без НДС, vat_rate=null, has_vat=false

**Особенности:**
- Справочник (read-only для пользователей, заполняется через админку/миграции)
- Нельзя удалять, можно только деактивировать

---

### 3. Модель Account (Счёт компании)

**Поля:**
- `id` — уникальный идентификатор
- `legal_entity` — юридическое лицо (ForeignKey на LegalEntity)
- `name` — название счёта: "Основной расчётный счёт", "Касса офиса"
- `number` — номер счёта: "40702810100000000001"
- `account_type` — тип счёта (CharField, choices):
  - `bank_account` — расчётный счёт
  - `cash` — наличная касса
  - `deposit` — депозит
  - `currency_account` — валютный счёт
- `bank_name` — название банка: "Сбербанк", "ВТБ" (опционально для касс)
- `bik` — БИК банка (опционально, CharField, max_length=9)
- `currency` — валюта (CharField, choices): "RUB", "USD", "EUR"
- `is_active` — активен ли счёт (Boolean, default=True)
- `initial_balance` — начальный остаток (Decimal, default=0)
- `balance_date` — дата начального остатка (Date)
- `location` — местоположение (для касс): "Офис", "Склад", "Объект А" (опционально)
- `description` — описание
- `created_at`, `updated_at` — временные метки

**Ограничения:**
- Уникальность: `(legal_entity, number)` — номер счёта уникален в рамках юридического лица

**Индексы:**
- По `legal_entity`
- По `account_type`
- По `currency`
- По `is_active`
- По `(legal_entity, number)`

---

### 4. Модель AccountBalance (Остаток на счёте на дату)

**Назначение:** Хранить остатки на счетах на конкретные даты для быстрого расчёта

**Поля:**
- `id` — уникальный идентификатор
- `account` — счёт (ForeignKey на Account)
- `balance_date` — дата остатка (Date)
- `balance` — остаток на дату (Decimal)
- `created_at`, `updated_at` — временные метки

**Ограничения:**
- Уникальность: `(account, balance_date)` — один остаток на счёт на дату

**Индексы:**
- По `account` и `balance_date`
- По `balance_date`

**Логика:**
- При создании/обновлении/удалении платежа пересчитываются остатки на дату платежа и все последующие даты
- Можно получить остаток на любую дату через запрос

---

### 5. Обновление модели Contract

**Добавить поле:**
- `legal_entity` — юридическое лицо (ForeignKey на LegalEntity, nullable)
  - Если указано — договор относится к конкретному юридическому лицу
  - Если null — договор общий (для обратной совместимости)

**Логика:**
- При расчёте НДС по договору используется `legal_entity.tax_system.vat_rate`
- Если `legal_entity` не указан — используется `contract.vat_rate` (старое поле)

---

### 6. Обновление модели PaymentRegistry (Реестр платежей)

**Важно:** Это workflow одобрения расходных платежей!

**Текущие поля (оставить):**
- `id`, `contract`, `planned_date`, `amount`, `status`, `initiator`, `comment`, `created_at`, `updated_at`

**Добавить поля:**
- `category` — категория платежа (ForeignKey на ExpenseCategory, обязательное)
- `account` — счёт для списания (ForeignKey на Account, обязательное)
- `legal_entity` — юридическое лицо (ForeignKey на LegalEntity, опционально, можно получить через account)
- `description` — назначение платежа (TextField, опционально)
- `document_link` — ссылка на документ (CharField, опционально)
- `approved_by` — кто одобрил (ForeignKey на User, опционально)
- `approved_at` — когда одобрено (DateTimeField, опционально)
- `payment` — созданный платёж после одобрения (OneToOne на Payment, опционально)

**Статусы (обновить):**
- `planned` — планируется (создан, ожидает одобрения)
- `approved` — утверждено (одобрено, можно создавать Payment)
- `paid` — оплачено (создан Payment, средства списаны)
- `cancelled` — отменено

**Логика:**
1. Пользователь создаёт запись в Реестре со статусом `planned`
2. Ответственное лицо одобряет → статус `approved`, заполняются `approved_by` и `approved_at`
3. При одобрении автоматически создаётся Payment → статус `paid`, заполняется `payment`
4. При создании Payment списываются средства со счёта

**Методы:**
- `approve(user)` — одобрить платеж
- `create_payment()` — создать фактический платёж (вызывается при одобрении)

---

### 7. Обновление модели Payment

`Payment` — единая сущность для всех фактических движений денег:
- **расходы** (исходящие платежи),
- **поступления** (входящие платежи),
- **внутренние переводы** (между своими счетами),
- с учётом НДС и типа дохода/расхода.

**Поля (дополнительно к уже существующим):**
- `account` — счёт компании (ForeignKey на Account, **обязательное**)
  - Для расходов (`expense`) — счёт списания
  - Для поступлений (`income`) — счёт зачисления
- `company_account` — номер счёта (CharField, опционально)
  - Оставить для обратной совместимости (отражает `account.number`)
  - Автоматически заполняется из `account.number` при сохранении
- `legal_entity` — юридическое лицо (ForeignKey на LegalEntity, опционально)
  - Можно получить через `account.legal_entity`, но храним для быстрого доступа
- `status` — статус оплаты (CharField, choices):
  - `pending` — ожидает оплаты (создан, но ещё не проведён по остаткам)
  - `paid` — оплачено (средства списаны/зачислены, остатки обновлены)
  - `cancelled` — отменено
- `payment_registry` — связь с расходным Реестром (OneToOne на PaymentRegistry, опционально)
  - Заполняется, если платёж создан из расходного Реестра
- `income_kind` — тип входящего платежа (для `payment_type='income'`):
  - `advance` — аванс по договору
  - `act_payment` — оплата по акту выполненных работ
  - `other` — прочие поступления (возвраты, штрафы и т.п.)
- **НДС-поля:**
  - `amount_gross` — сумма с НДС (то, что фактически ушло/пришло по выписке)
  - `amount_net` — сумма без НДС
  - `vat_amount` — сумма НДС
  - НДС рассчитывается на основе `TaxSystem`/договора/счёта
- **Внутренние переводы:**
  - `is_internal_transfer` — флаг, что платёж участвует во внутреннем переводе
  - `internal_transfer_group` — идентификатор группы перевода (например, UUID), чтобы связать расход на одном счёте и доход на другом

**Логика:**
- При создании/обновлении `Payment` со статусом `paid`:
  - Для расходов (`expense`): уменьшить остаток на `account` на `amount_gross`
  - Для поступлений (`income`): увеличить остаток на `account` на `amount_gross`
  - Обновить `AccountBalance` на дату платежа и все последующие даты
- При изменении статуса с `pending` на `paid` — выполнить то же самое, что при создании `paid`
- При изменении статуса с `paid` на `cancelled` — откатить движение (вернуть средства на счёт)
- Для **внутреннего перевода**:
  - создаются **два** платежа:
    - расход (`expense`) на `from_account`
    - доход (`income`) на `to_account`
  - оба имеют `is_internal_transfer = True` и одинаковый `internal_transfer_group`
  - в аналитике по компании эти движения можно исключать (нет изменения общего cash-flow), но в аналитике по счёту они видны
- Для входящих платежей:
  - по `income_kind='act_payment'` создаются связи с актами (см. ниже `ActPaymentAllocation`)

**Методы (планируемые):**
- `mark_as_paid()` — отметить как оплаченный, пересчитать остатки и НДС
- `cancel()` — отменить платёж и откатить изменения остатков
- `create_internal_transfer_pair()` — вспомогательный метод для создания пары платежей при внутреннем переводе

---

## Связи между сущностями

```
LegalEntity (Юридическое лицо)
├── TaxSystem (Система налогообложения) - многие к одному
├── Account[] (Счета) - один ко многим
│   └── AccountBalance[] (Остатки) - один ко многим
├── Contract[] (Договоры) - один ко многим
└── PaymentRegistry[] (Реестр платежей, исходящие) - один ко многим

PaymentRegistry (Реестр платежей) - workflow одобрения
├── Account (Счёт списания) - многие к одному
├── ExpenseCategory (Категория) - многие к одному
├── Contract (Договор) - многие к одному (опционально)
└── Payment (Созданный платёж) - один к одному (опционально)

Payment (Платёж)
├── Account (Счёт) - многие к одному (обязательное)
├── LegalEntity (Юридическое лицо) - многие к одному (опционально)
├── Contract (Договор) - многие к одному (опционально)
├── ExpenseCategory (Категория) - многие к одному
└── PaymentRegistry (Реестр исходящих) - один к одному (опционально)
```

Отдельно (в рамках проектирования) будут добавлены связи для входящих актов и оборотных средств (см. ниже).

---

## Бизнес-логика

### 1. Workflow расходных платежей

**Шаг 1: Создание в Реестре**
```python
registry = PaymentRegistry.objects.create(
    account=account,  # Счёт для списания
    category=category,
    contract=contract,  # Опционально
    amount=100000,
    planned_date=date.today(),
    status='planned',
    initiator=user.username
)
```

**Шаг 2: Одобрение**
```python
registry.approve(approved_by=manager)
# Статус → 'approved'
# Заполняются approved_by и approved_at
```

**Шаг 3: Создание Payment (автоматически при одобрении)**
```python
payment = Payment.objects.create(
    account=registry.account,
    category=registry.category,
    contract=registry.contract,
    payment_type='expense',
    payment_date=registry.planned_date,
    amount=registry.amount,
    status='paid',  # Сразу оплачен
    payment_registry=registry
)
# Средства списываются со счёта
# Обновляются остатки
```

**Шаг 4: Обновление Реестра**
```python
registry.status = 'paid'
registry.payment = payment
registry.save()
```

---

### 2. Workflow поступлений (доходов)

**Создание Payment напрямую:**
```python
payment = Payment.objects.create(
    account=account,  # Счёт для зачисления
    category=category,
    contract=contract,  # Опционально
    payment_type='income',
    payment_date=date.today(),
    amount=500000,
    status='paid'  # Сразу оплачен
)
# Средства зачисляются на счёт
# Обновляются остатки
```

**Реестр не используется для поступлений!**

---

### 3. Workflow входящих платежей и актов

Для управления дебиторской задолженностью по договорам вводятся:
- `Act` — акт выполненных работ,
- `IncomingPaymentRegistry` — реестр ожидаемых и фактических входящих платежей,
- `ActPaymentAllocation` — распределение платежей по актам.

**Act (Акт выполненных работ):**
- Привязан к `Contract`
- Поля:
  - `number`, `date`
  - `amount_gross`, `amount_net`, `vat_amount`
  - `status` (draft/sent/signed/partially_paid/paid/cancelled)
  - `due_date` — ожидаемая дата оплаты
  - `description`, `document_link`

**IncomingPaymentRegistry (Реестр входящих платежей/актов):**
- Показывает подписанные, но не оплаченные/частично оплаченные акты и ожидаемые авансы.
- Поля (концептуально):
  - `contract`, `act` (опционально, если речь об оплате акта)
  - `planned_date`, `amount_expected`
  - `amount_paid` — сколько уже оплачено
  - `status` (expected/partially_paid/paid/overdue/cancelled)
  - `comment`

**ActPaymentAllocation:**
- Привязывает входящий платёж к акту:
  - `act` — акт
  - `payment` — входящий `Payment`
  - `allocated_amount` — часть платежа, идущая в погашение акта

**Логика:**
- При создании акта:
  - создаётся запись в `IncomingPaymentRegistry` со статусом `expected`
- При поступлении платежа с `income_kind='act_payment'`:
  - через `ActPaymentAllocation` распределяем платёж по актам
  - обновляем `amount_paid` и `status` акта и записи в реестре
- Для авансов:
  - `income_kind='advance'`, запись в реестре может быть привязана только к договору (без акта)

В итоге:
- дебиторка по договору видна через `Act` + `IncomingPaymentRegistry` + `ActPaymentAllocation`
- Реестр входящих и Реестр исходящих логически разделены.

---

### 4. Расчёт остатков на счетах

**При создании/обновлении Payment со статусом `paid`:**
1. Найти или создать `AccountBalance` на дату платежа
2. Для расходов: `balance -= amount_gross`
3. Для поступлений: `balance += amount_gross`
4. Обновить все последующие остатки (на даты после платежа)

**Метод получения остатка:**
```python
def get_balance(account, date):
    # Найти последний остаток до даты
    last_balance = AccountBalance.objects.filter(
        account=account,
        balance_date__lte=date
    ).order_by('-balance_date').first()
    
    if not last_balance:
        return account.initial_balance
    
    # Прибавить/вычесть все платежи с этой даты
    payments = Payment.objects.filter(
        account=account,
        payment_date__gte=last_balance.balance_date,
        payment_date__lte=date,
        status='paid'
    )
    
    balance = last_balance.balance
    for payment in payments:
        if payment.payment_type == 'income':
            balance += payment.amount
        else:
            balance -= payment.amount
    
    return balance
```

---

### 5. Расчёт НДС

**При создании договора:**
- Если указан `legal_entity` → использовать `legal_entity.tax_system.vat_rate`
- Если не указан → использовать `contract.vat_rate` (старое поле)

**При создании платежа:**
- Если платеж привязан к договору с `legal_entity` → использовать НДС договора
- Если платеж операционный → использовать НДС юридического лица счёта (`account.legal_entity.tax_system.vat_rate`)

---

### 6. Валидация

**При создании PaymentRegistry:**
- `account` обязателен
- `category` обязателен
- Если `category.requires_contract` → `contract` обязателен

**При создании Payment:**
- `account` обязателен
- `category` обязателен
- Если указан `contract` и у договора есть `legal_entity` → проверить что счёт принадлежит тому же юридическому лицу
- **НЕ проверяем достаточность средств** (товар может быть в долг)

**При одобрении PaymentRegistry:**
- Можно одобрить только со статусом `planned`
- После одобрения автоматически создаётся Payment

---

## API Endpoints

### LegalEntity
- `GET /api/v1/legal-entities/` — список юридических лиц
- `GET /api/v1/legal-entities/{id}/` — детали
- `POST /api/v1/legal-entities/` — создать
- `PUT/PATCH /api/v1/legal-entities/{id}/` — обновить
- `DELETE /api/v1/legal-entities/{id}/` — удалить (только если нет счетов и договоров)

### TaxSystem
- `GET /api/v1/tax-systems/` — список систем налогообложения (read-only справочник)
- `GET /api/v1/tax-systems/{id}/` — детали

### Account
- `GET /api/v1/accounts/` — список счетов
- `GET /api/v1/accounts/{id}/` — детали
- `GET /api/v1/accounts/{id}/balance/` — текущий остаток на дату (query param: `?date=2023-11-22`)
- `GET /api/v1/accounts/{id}/balance_history/` — история остатков (query params: `?start_date=...&end_date=...`)
- `POST /api/v1/accounts/` — создать
- `PUT/PATCH /api/v1/accounts/{id}/` — обновить
- `DELETE /api/v1/accounts/{id}/` — удалить (только если нет платежей)

### AccountBalance
- `GET /api/v1/account-balances/` — список остатков (read-only)
- `GET /api/v1/account-balances/{id}/` — детали

### PaymentRegistry (обновлённые endpoints)
- `GET /api/v1/payment-registry/` — список записей реестра
- `GET /api/v1/payment-registry/{id}/` — детали
- `POST /api/v1/payment-registry/` — создать запись (только расходы)
- `PUT/PATCH /api/v1/payment-registry/{id}/` — обновить (только если статус `planned`)
- `POST /api/v1/payment-registry/{id}/approve/` — **одобрить платеж** (новый endpoint)
- `POST /api/v1/payment-registry/{id}/cancel/` — отменить платеж
- `DELETE /api/v1/payment-registry/{id}/` — удалить (только если статус `planned` или `cancelled`)

### Payment (обновлённые endpoints)
- `GET /api/v1/payments/` — список платежей
- `GET /api/v1/payments/{id}/` — детали
- `POST /api/v1/payments/` — создать (для поступлений напрямую, для расходов только через Реестр)
- `PUT/PATCH /api/v1/payments/{id}/` — обновить
- `POST /api/v1/payments/{id}/mark_as_paid/` — отметить как оплаченный (новый endpoint)
- `POST /api/v1/payments/{id}/cancel/` — отменить платёж
- `DELETE /api/v1/payments/{id}/` — удалить (только если статус `pending`)

---

## Аналитика

### По счёту
- Текущий остаток
- История остатков за период
- Список всех платежей по счёту
- Cash-flow по счёту за период

### По всем счетам
- Сводка остатков по всем счетам
- Остатки по юридическим лицам
- Остатки по валютам
- Остатки по типам счетов

---

## План реализации

### Этап 1: Модели и миграции
1. Создать модель `TaxSystem` (справочник)
2. Создать модель `LegalEntity`
3. Создать модель `Account`
4. Создать модель `AccountBalance`
5. Обновить модель `Contract` (добавить `legal_entity`)
6. Обновить модель `PaymentRegistry` (добавить поля, обновить статусы)
7. Обновить модель `Payment` (добавить `account`, `status`, `legal_entity`)

### Этап 2: Бизнес-логика
1. Реализовать методы расчёта остатков
2. Реализовать методы одобрения в PaymentRegistry
3. Реализовать методы создания Payment из PaymentRegistry
4. Реализовать методы списания/зачисления средств
5. Реализовать методы расчёта НДС

### Этап 3: API
1. Создать ViewSets для новых моделей
2. Обновить ViewSets для существующих моделей
3. Добавить custom actions (approve, mark_as_paid, cancel)
4. Обновить сериализаторы

### Этап 4: Аналитика
1. Реализовать endpoints для остатков
2. Реализовать endpoints для аналитики по счетам

### Этап 5: Тестирование
1. Unit-тесты для моделей
2. Unit-тесты для бизнес-логики
3. API-тесты

---

## Уточнённые ответы на вопросы

1. **Проверка достаточности средств:** ❌ НЕ нужна. Платежи создаются всегда, даже если средств недостаточно (товар в долг).

2. **Конвертация валют:** ❌ НЕ нужна. Каждая валюта учитывается отдельно.

3. **Инкассация:** ❌ НЕ нужна. Достаточно типа "касса" в Account.

4. **Миграция данных:** ❌ НЕ нужна. Система новая, данных нет.

5. **Права доступа:** ⏳ Обсудим отдельно позже.

---

## Примечания

- Система проектируется с нуля, можно менять структуру как нужно
- Все изменения должны быть логичными и расширяемыми
- Нужно учесть производительность при расчёте остатков (20+ счетов)
- Workflow одобрения должен быть простым и понятным для пользователей
