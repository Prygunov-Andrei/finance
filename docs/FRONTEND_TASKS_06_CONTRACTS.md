# Задания на разработку Фронтенда: Договорная работа

Этот документ содержит полное техническое задание для реализации фронтенда системы управления договорами. Задание включает всю договорную работу: доходные и расходные договоры, рамочные договоры, дополнительные соглашения, графики работ, акты выполненных работ.

**Общий стек:** Next.js (App Router), TypeScript, TailwindCSS, Shadcn UI, Axios, React Query.

**Базовый URL API:** `https://finance.ngrok.app/api/v1` (или из переменной окружения `NEXT_PUBLIC_API_URL`)

**Язык интерфейса:** Русский

**Связанные документы:**
- `FRONTEND_TASKS_01_FOUNDATION.md` — Базовые этапы (Фундамент, Справочники)
- `FRONTEND_TASKS_02_OBJECTS.md` — Объекты строительства
- `FRONTEND_TASKS_05_TKP_MP.md` — ТКП и МП (связаны с договорами)
- `FRONTEND_TASKS_07_PAYMENTS.md` — Платежи (связаны с договорами)
- `FRONTEND_TASKS_08_COMMUNICATIONS.md` — Переписка (связана с договорами)
- `FRONTEND_TASKS_INDEX.md` — Индекс всех заданий
- `PROJECT.md` — Полная документация проекта

---

## Типы данных (TypeScript)

### Базовые типы

```typescript
// Статусы договора
type ContractStatus = 'planned' | 'active' | 'completed' | 'suspended' | 'terminated';

// Тип договора
type ContractType = 'income' | 'expense';

// Валюта
type Currency = 'RUB' | 'USD' | 'EUR';

// Статусы рамочного договора
type FrameworkContractStatus = 'draft' | 'active' | 'expired' | 'terminated';

// Статусы акта
type ActStatus = 'draft' | 'signed' | 'cancelled';

// Статусы задачи графика
type ScheduleItemStatus = 'pending' | 'in_progress' | 'done';
```

### Договор (Contract)

```typescript
interface ContractListItem {
  id: number;
  object_name: string; // Read-only
  number: string;
  name: string;
  contract_type: ContractType;
  counterparty_name: string; // Read-only
  legal_entity_name: string; // Read-only
  total_amount: string; // Decimal string
  currency: Currency;
  status: ContractStatus;
  contract_date: string; // YYYY-MM-DD
}

interface ContractDetail extends ContractListItem {
  object_id: number;
  legal_entity: number;
  legal_entity_name: string; // Read-only
  counterparty: number;
  counterparty_name: string; // Read-only
  contract_type: ContractType;
  technical_proposal: number | null; // ID ТКП (только для income)
  technical_proposal_number: string | null; // Read-only
  mounting_proposal: number | null; // ID МП (только для expense)
  mounting_proposal_number: string | null; // Read-only
  parent_contract: number | null; // ID родительского договора
  framework_contract: number | null; // ID рамочного договора (только для expense)
  framework_contract_details: {
    id: number;
    number: string;
    name: string;
    status: FrameworkContractStatus;
    is_active: boolean;
  } | null; // Read-only
  responsible_manager: number | null; // ID начальника участка
  responsible_manager_name: string | null; // Read-only: ФИО
  responsible_engineer: number | null; // ID инженера
  responsible_engineer_name: string | null; // Read-only: ФИО
  number: string;
  name: string;
  contract_date: string; // YYYY-MM-DD
  start_date: string | null; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD
  total_amount: string; // Decimal string
  currency: Currency;
  vat_rate: string; // Decimal string "20.00"
  vat_included: boolean;
  status: ContractStatus;
  file: string | null; // URL файла
  notes: string;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

interface ContractCreateRequest {
  object_id: number; // Обязательно
  legal_entity?: number;
  counterparty?: number;
  contract_type: ContractType; // Обязательно
  technical_proposal?: number; // Только для income
  mounting_proposal?: number; // Только для expense
  parent_contract?: number;
  framework_contract?: number; // Только для expense
  responsible_manager?: number;
  responsible_engineer?: number;
  number: string; // Обязательно
  name: string; // Обязательно
  contract_date: string; // Обязательно, YYYY-MM-DD
  start_date?: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  total_amount: string; // Обязательно, Decimal string
  currency?: Currency; // По умолчанию 'RUB'
  vat_rate?: string; // По умолчанию "20.00"
  vat_included?: boolean; // По умолчанию true
  status?: ContractStatus; // По умолчанию 'planned'
  file?: File;
  notes?: string;
}
```

### Рамочный договор (FrameworkContract)

```typescript
interface FrameworkContractListItem {
  id: number;
  number: string; // "РД-2025-001" (автогенерация)
  name: string;
  date: string; // YYYY-MM-DD
  valid_from: string; // YYYY-MM-DD
  valid_until: string; // YYYY-MM-DD
  counterparty: number;
  counterparty_name: string; // Read-only
  legal_entity: number;
  legal_entity_name: string; // Read-only
  status: FrameworkContractStatus;
  is_active: boolean; // Read-only: вычисляемое свойство
  contracts_count: number; // Read-only: количество договоров
  created_at: string; // ISO datetime
}

interface FrameworkContractDetail extends FrameworkContractListItem {
  legal_entity_details: {
    id: number;
    name: string;
    short_name: string;
    inn: string;
  };
  counterparty_details: {
    id: number;
    name: string;
    short_name: string;
    type: string;
    inn: string;
  };
  price_lists: number[]; // Массив ID прайс-листов
  price_lists_details: Array<{
    id: number;
    number: string;
    name: string;
    date: string;
    status: string;
  }>;
  file: string | null; // URL файла
  notes: string;
  created_by: number;
  created_by_name: string; // Read-only: ФИО создателя
  is_expired: boolean; // Read-only: истёк ли срок
  days_until_expiration: number; // Read-only: дней до истечения
  total_contracts_amount: string; // Read-only: Decimal string
  updated_at: string; // ISO datetime
}

interface FrameworkContractCreateRequest {
  name: string; // Обязательно
  date: string; // YYYY-MM-DD, обязательно
  valid_from: string; // YYYY-MM-DD, обязательно
  valid_until: string; // YYYY-MM-DD, обязательно
  legal_entity: number; // Обязательно
  counterparty: number; // Обязательно (должен быть vendor или both)
  status?: FrameworkContractStatus; // По умолчанию 'draft'
  price_lists?: number[]; // Массив ID прайс-листов
  file?: File;
  notes?: string;
}
```

### Дополнительное соглашение (ContractAmendment)

```typescript
interface ContractAmendment {
  id: number;
  contract: number; // ID договора
  number: string; // Номер доп. соглашения
  date: string; // YYYY-MM-DD
  reason: string; // Причина изменений
  new_start_date: string | null; // YYYY-MM-DD
  new_end_date: string | null; // YYYY-MM-DD
  new_total_amount: string | null; // Decimal string
  file: string | null; // URL файла
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

interface ContractAmendmentCreateRequest {
  contract: number; // Обязательно
  number: string; // Обязательно
  date: string; // YYYY-MM-DD, обязательно
  reason: string; // Обязательно
  new_start_date?: string; // YYYY-MM-DD
  new_end_date?: string; // YYYY-MM-DD
  new_total_amount?: string; // Decimal string
  file?: File;
}
```

### График работ (WorkScheduleItem)

```typescript
interface WorkScheduleItem {
  id: number;
  contract: number; // ID договора
  name: string; // Наименование работ
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  workers_count: number; // Количество рабочих
  status: ScheduleItemStatus;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

interface WorkScheduleItemCreateRequest {
  contract: number; // Обязательно
  name: string; // Обязательно
  start_date: string; // YYYY-MM-DD, обязательно
  end_date: string; // YYYY-MM-DD, обязательно
  workers_count?: number; // По умолчанию 0
  status?: ScheduleItemStatus; // По умолчанию 'pending'
}
```

### Акт выполненных работ (Act)

```typescript
interface Act {
  id: number;
  contract: number; // ID договора
  contract_number: string; // Read-only
  number: string; // Номер акта
  date: string; // YYYY-MM-DD
  period_start: string | null; // YYYY-MM-DD
  period_end: string | null; // YYYY-MM-DD
  amount_gross: string; // Decimal string: сумма с НДС
  amount_net: string; // Decimal string: сумма без НДС
  vat_amount: string; // Decimal string: сумма НДС
  status: ActStatus;
  file: string | null; // URL файла
  description: string;
  due_date: string | null; // YYYY-MM-DD: срок оплаты по акту
  allocations: ActPaymentAllocation[]; // Read-only: распределения платежей
  unpaid_amount: string; // Read-only: Decimal string
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

interface ActCreateRequest {
  contract: number; // Обязательно
  number: string; // Обязательно
  date: string; // YYYY-MM-DD, обязательно
  period_start?: string; // YYYY-MM-DD
  period_end?: string; // YYYY-MM-DD
  amount_gross: string; // Обязательно, Decimal string (НДС рассчитывается автоматически)
  amount_net?: string; // Опционально (рассчитывается автоматически если не указано)
  vat_amount?: string; // Опционально (рассчитывается автоматически если не указано)
  status?: ActStatus; // По умолчанию 'draft'
  file?: File;
  description?: string;
  due_date?: string; // YYYY-MM-DD: срок оплаты по акту (опционально)
}

interface ActPaymentAllocation {
  id: number;
  act: number; // ID акта
  payment: number; // ID платежа
  payment_description: string; // Read-only
  payment_date: string; // Read-only, YYYY-MM-DD
  amount: string; // Decimal string: сумма покрытия
  created_at: string; // ISO datetime
}
```

---

## Этап 24: Договоры (Contracts) — Список и создание

### Страница списка договоров (`/contracts`)

**API Endpoint:** `GET /contracts/`

**Фильтры:**
- `?object={id}` — по объекту
- `?status={status}` — по статусу
- `?currency={currency}` — по валюте
- `?contract_type={type}` — по типу (income/expense)
- `?legal_entity={id}` — по нашей компании
- `?counterparty={id}` — по контрагенту
- `?framework_contract={id}` — по рамочному договору
- `?responsible_manager={id}` — по начальнику участка
- `?responsible_engineer={id}` — по инженеру
- `?search={text}` — поиск по номеру, названию, контрагенту, объекту

**Сортировка:**
- По умолчанию: `-contract_date,-created_at` (новые сверху)
- Доступна сортировка по: contract_date, total_amount, created_at

**UI требования:**
- Таблица договоров с колонками: Номер, Название, Объект, Тип, Контрагент, Компания, Сумма, Валюта, Статус, Дата заключения
- Опциональные колонки (можно скрывать): Рамочный договор, Начальник участка, Инженер
- Статусы отображать Badge:
  - Планируется (planned) — серый
  - В работе (active) — зеленый
  - Завершён (completed) — синий
  - Приостановлен (suspended) — оранжевый
  - Расторгнут (terminated) — красный
- Тип договора отображать Badge:
  - Доходный (income) — зеленый
  - Расходный (expense) — красный
- Панель фильтров с возможностью сброса
- Кнопка "Создать договор"
- Клик по строке открывает детальную страницу
- Кнопки действий в строке: Просмотр, Редактировать, Удалить

### Форма создания/редактирования договора

**API Endpoints:** `POST /contracts/`, `PATCH /contracts/{id}/`

**Структура формы (секции):**

**Секция 1: Основное**
- Объект* (Select из GET /objects/) — обязательно
- Номер договора* (Text input) — обязательно, уникален в рамках объекта
- Название/предмет договора* (Text input) — обязательно
- Дата заключения* (Date picker) — обязательно
- Тип договора* (Select: Доходный / Расходный) — обязательно
- Статус (Select) — по умолчанию "Планируется"

**Секция 2: Стороны**
- Наша компания (Select из GET /legal-entities/) — опционально
- Контрагент (Select из GET /counterparties/) — опционально
  - Для income: показывать только customer или both
  - Для expense: показывать только vendor или both

**Секция 3: Основания**
- ТКП (Select из GET /technical-proposals/?status=approved) — только для income, опционально
- МП (Select из GET /mounting-proposals/?status=approved) — только для expense, опционально
- Родительский договор (Select из GET /contracts/?contract_type=income) — опционально, для зеркальных договоров

**Секция 4: Рамочный договор и ответственные лица**
- Рамочный договор (Select из GET /framework-contracts/?status=active) — только для expense, опционально
  - При выборе рамочного договора:
    - Автоматически подставлять counterparty из framework_contract.counterparty
    - Показывать предупреждение если counterparty уже выбран и не совпадает
    - Показывать информацию о рамочном договоре (Card)
- Начальник участка (Select из списка пользователей) — опционально
- Ответственный инженер (Select из списка пользователей) — опционально

**Секция 5: Сроки**
- Дата начала работ (Date picker) — опционально
- Плановая дата завершения (Date picker) — опционально

**Секция 6: Финансы**
- Сумма договора* (Number input, Decimal) — обязательно
- Валюта (Select: RUB / USD / EUR) — по умолчанию RUB
- Ставка НДС, % (Number input, Decimal) — по умолчанию 20.00
- Сумма включает НДС (Checkbox) — по умолчанию true

**Секция 7: Файлы и примечания**
- Скан договора (File input, accept=".pdf,.jpg,.jpeg,.png") — опционально
- Примечания (Textarea) — опционально

**Валидация:**
- При сохранении со статусом "В работе":
  - Для income: обязательно наличие ТКП со статусом approved
  - Для expense: обязательно наличие МП со статусом approved
  - Бэкенд вернет ошибку 400 если условия не выполнены
- Рамочный договор можно указать только для expense
- Исполнитель в рамочном договоре должен совпадать с контрагентом
- Рамочный договор должен быть в статусе 'active'

---

## Этап 25: Договоры — Детальная страница

### Страница деталей договора (`/contracts/[id]`)

**API Endpoint:** `GET /contracts/{id}/`

**Структура страницы:**

**Шапка:**
- Номер и название договора
- Статус (Badge)
- Тип договора (Badge)
- Кнопки действий: Редактировать, Удалить, Экспорт

**Панель информации (Cards):**
- Основная информация: Объект, Дата заключения, Сроки работ, Сумма, Валюта, НДС
- Стороны: Наша компания, Контрагент
- Основания: ТКП/МП, Родительский договор
- Рамочный договор и ответственные: Рамочный договор (с ссылкой), Начальник участка, Инженер
- Финансовые показатели:
  - Баланс договора: `GET /contracts/{id}/balance/` → `{balance: "30000.00", currency: "RUB"}`
    - Если баланс > 0: зеленым (нам должны / мы должны)
    - Если баланс < 0: красным
    - Если баланс = 0: серым
  - Маржа (только для income): вычисляется на бэкенде через `get_margin()`
    - Показывать только если contract_type === 'income'
    - Формат: "Маржа: {margin} руб. ({margin_percent}%)"

**Вкладки:**

**Вкладка 1: Основное**
- Все поля договора в режиме просмотра/редактирования
- Файл договора (ссылка для скачивания)
- Примечания

**Вкладка 2: Дополнительные соглашения**
- API: `GET /contract-amendments/?contract={id}`
- Таблица доп. соглашений: Номер, Дата, Причина, Изменения (даты, сумма), Файл
- Кнопка "Добавить доп. соглашение"
- При создании доп. соглашения:
  - Если указаны new_start_date, new_end_date, new_total_amount — они автоматически обновят договор
  - Показывать предупреждение об автоматическом обновлении

**Вкладка 3: График работ**
- API: `GET /work-schedule/?contract={id}`
- Таблица задач графика: Наименование, Начало, Окончание, Рабочих, Статус
- Статусы: Не начато (pending) — серый, В работе (in_progress) — синий, Выполнено (done) — зеленый
- Кнопка "Добавить задачу"
- Валидация дат:
  - Дата начала задачи >= start_date договора
  - Дата окончания задачи <= end_date договора
  - Дата окончания >= даты начала
- Сортировка по start_date

**Вкладка 4: Акты выполненных работ**
- API: `GET /acts/?contract={id}`
- Таблица актов: Номер, Дата, Период работ, Сумма с НДС, Сумма без НДС, НДС, Статус, Срок оплаты, Неоплаченная сумма
- Статусы: Черновик (draft) — серый, Подписан (signed) — зеленый, Отменен (cancelled) — красный
- Колонка "Срок оплаты": отображать дату, если указана
- Визуально выделять просроченные акты:
  - Если `due_date < сегодня` и `status === 'signed'` и `unpaid_amount > 0`:
    - Показать Badge "Просрочен" (красный цвет)
    - Выделить строку красным border или фоном
- Кнопка "Создать акт"
- Кнопка "Подписать" для актов в статусе draft → `POST /acts/{id}/sign/`
- Колонка "Неоплаченная сумма" показывает unpaid_amount
- Клик по акту открывает детали акта (модальное окно или отдельная страница)

**Вкладка 5: Cash-flow (опционально)**
- API: `GET /contracts/{id}/cash_flow/?start_date={date}&end_date={date}`
- API: `GET /contracts/{id}/cash_flow_periods/?period_type=month&start_date={date}&end_date={date}`
- График cash-flow по периодам
- Фильтры: период (месяц/неделя/день), даты начала и окончания

---

## Этап 26: Рамочные договоры (Framework Contracts)

### Страница списка рамочных договоров (`/contracts/framework-contracts`)

**API Endpoint:** `GET /framework-contracts/`

**Фильтры:**
- `?counterparty={id}` — по Исполнителю (только vendor или both)
- `?legal_entity={id}` — по нашей компании
- `?status={status}` — по статусу
- `?search={text}` — поиск по номеру и названию

**Сортировка:**
- По умолчанию: `-date,-created_at`
- Доступна сортировка по: date, valid_from, valid_until, created_at

**UI требования:**
- Таблица рамочных договоров: Номер, Название, Исполнитель, Компания, Дата заключения, Срок действия, Статус, Активен, Договоров
- Статусы (Badge):
  - Черновик (draft) — серый
  - Действующий (active) — зеленый (если is_active=true) или синий (если статус active, но is_active=false)
  - Истёк срок (expired) — оранжевый
  - Расторгнут (terminated) — красный
- Колонка "Активен": зеленая галочка если is_active=true, иначе серый крестик
- Колонка "Договоров": число contracts_count, при клике открывает список договоров
- Если days_until_expiration < 30 и status='active', показывать предупреждение (желтый Badge)
- Кнопка "Создать рамочный договор"
- Кнопки действий: Просмотр, Редактировать, Удалить

### Форма создания/редактирования рамочного договора

**API Endpoints:** `POST /framework-contracts/`, `PATCH /framework-contracts/{id}/`

**Поля формы:**
- Название* (Text input, max 255) — обязательно
- Дата заключения* (Date picker) — обязательно
- Начало действия* (Date picker) — обязательно
- Окончание действия* (Date picker) — обязательно, должна быть >= valid_from
- Наша компания* (Select из GET /legal-entities/) — обязательно
- Исполнитель* (Select из GET /counterparties/?type=vendor или type=both) — обязательно
- Статус (Select) — по умолчанию "Черновик"
- Прайс-листы (Multi-select из GET /price-lists/) — опционально
- Скан договора (File input) — опционально
- Примечания (Textarea) — опционально

**Валидация:**
- valid_until >= valid_from
- Исполнитель должен быть типа 'vendor' или 'both' (бэкенд вернет ошибку)
- Номер генерируется автоматически на бэкенде (формат: РД-{год}-{номер})

### Страница деталей рамочного договора (`/contracts/framework-contracts/[id]`)

**API Endpoint:** `GET /framework-contracts/{id}/`

**Структура страницы:**

**Шапка:**
- Номер и название рамочного договора
- Статус (Badge)
- Кнопки действий: Редактировать, Удалить

**Панель информации:**
- Основная информация: Дата заключения, Срок действия (с {valid_from} по {valid_until}), Статус, Активен, Дней до истечения
- Стороны: Наша компания, Исполнитель
- Статистика: Количество договоров, Общая сумма договоров

**Вкладки:**

**Вкладка 1: Основное**
- Все поля рамочного договора
- Файл договора
- Примечания
- Служебная информация: Создал, Дата создания, Дата обновления

**Вкладка 2: Прайс-листы**
- Таблица согласованных прайс-листов (price_lists_details)
- Кнопка "Добавить прайс-листы" → Dialog с multi-select
  - API: `POST /framework-contracts/{id}/add_price_lists/` с телом `{price_list_ids: [1, 2, 3]}`
- Кнопка "Удалить" для каждого прайс-листа
  - API: `POST /framework-contracts/{id}/remove_price_lists/` с телом `{price_list_ids: [1]}`

**Вкладка 3: Договоры**
- API: `GET /framework-contracts/{id}/contracts/`
- Таблица договоров под этот рамочный (используется ContractListItem формат)
- Кнопка "Создать договор под этот рамочный" — открывает форму создания договора с предзаполненным framework_contract

**Действия:**
- Если status='draft': кнопка "Активировать" → `POST /framework-contracts/{id}/activate/`
- Кнопка "Расторгнуть" → `POST /framework-contracts/{id}/terminate/`
- Кнопка "Удалить" (только если contracts_count === 0)
  - При попытке удаления с договорами: показывать ошибку "Нельзя удалить рамочный договор с существующими договорами"

---

## Этап 27: Акты выполненных работ (Acts)

### Страница списка актов (`/contracts/acts`)

**API Endpoint:** `GET /acts/`

**Фильтры:**
- `?contract={id}` — по договору
- `?status={status}` — по статусу
- `?search={text}` — поиск по номеру и описанию

**UI требования:**
- Таблица актов: Номер, Договор, Дата, Период работ, Сумма с НДС, Сумма без НДС, НДС, Статус, Неоплаченная сумма
- Кнопка "Создать акт"
- Клик по строке открывает детали акта

### Форма создания/редактирования акта

**API Endpoints:** `POST /acts/`, `PATCH /acts/{id}/`

**Поля формы:**
- Договор* (Select из GET /contracts/) — обязательно
- Номер акта* (Text input) — обязательно
- Дата подписания* (Date picker) — обязательно
- Период работ: Начало (Date picker), Окончание (Date picker) — опционально
- Сумма с НДС* (Number input, Decimal) — обязательно
  - При указании суммы с НДС, сумма без НДС и НДС рассчитываются автоматически на бэкенде
- Сумма без НДС (Number input, Decimal) — опционально (рассчитывается автоматически)
- Сумма НДС (Number input, Decimal) — опционально (рассчитывается автоматически)
- Статус (Select) — по умолчанию "Черновик"
- Срок оплаты (Date picker) — опционально
  - Подсказка: "Дата, до которой должен быть оплачен акт"
  - Валидация: срок оплаты должен быть >= даты подписания акта
- Скан акта (File input) — опционально
- Описание работ (Textarea) — опционально

**Особенности:**
- НДС рассчитывается автоматически на бэкенде по формуле: Net = Gross / (1 + rate/100)
- Если указаны amount_net и vat_amount, они не пересчитываются

### Страница деталей акта (`/contracts/acts/[id]`)

**API Endpoint:** `GET /acts/{id}/`

**Структура страницы:**

**Основная информация:**
- Номер акта, Договор (с ссылкой), Дата подписания, Период работ
- Суммы: С НДС, Без НДС, НДС
- Статус (Badge)
- Неоплаченная сумма (unpaid_amount)
- Файл акта (ссылка для скачивания)
- Описание работ

**Секция "Распределение платежей":**
- Таблица распределений (allocations): Платеж, Дата платежа, Сумма покрытия
- Кнопка "Добавить распределение" (если реализовано на бэкенде)
- Показывать прогресс оплаты: оплачено / всего

**Действия:**
- Если status='draft': кнопка "Подписать" → `POST /acts/{id}/sign/`
- Кнопка "Редактировать"
- Кнопка "Удалить"

---

## Этап 28: Дополнительные соглашения (Contract Amendments)

### Управление доп. соглашениями

**API Endpoints:**
- `GET /contract-amendments/?contract={id}` — список доп. соглашений по договору
- `POST /contract-amendments/` — создать
- `PATCH /contract-amendments/{id}/` — обновить
- `DELETE /contract-amendments/{id}/` — удалить

**Форма создания/редактирования:**
- Договор* (Select) — обязательно
- Номер доп. соглашения* (Text input) — обязательно, уникален в рамках договора
- Дата подписания* (Date picker) — обязательно
- Причина изменений* (Textarea) — обязательно
- Новые значения (опционально, при указании автоматически обновят договор):
  - Новая дата начала (Date picker)
  - Новая дата окончания (Date picker)
  - Новая сумма (Number input, Decimal)
- Скан документа (File input) — опционально

**Важно:**
- При указании new_start_date, new_end_date, new_total_amount они автоматически обновят договор
- Показывать предупреждение об автоматическом обновлении договора

---

## Этап 29: График работ (Work Schedule)

### Управление графиком работ

**API Endpoints:**
- `GET /work-schedule/?contract={id}` — список задач по договору
- `POST /work-schedule/` — создать задачу
- `PATCH /work-schedule/{id}/` — обновить задачу
- `DELETE /work-schedule/{id}/` — удалить задачу

**Форма создания/редактирования задачи:**
- Договор* (Select) — обязательно
- Наименование работ* (Text input) — обязательно
- Начало* (Date picker) — обязательно
- Окончание* (Date picker) — обязательно, должна быть >= начала
- Количество рабочих (Number input) — по умолчанию 0
- Статус (Select) — по умолчанию "Не начато"

**Валидация:**
- Дата начала задачи >= start_date договора
- Дата окончания задачи <= end_date договора
- Дата окончания >= даты начала
- Бэкенд вернет ошибку 400 если условия не выполнены

**UI требования:**
- Таблица задач с сортировкой по start_date
- Статусы (Badge): Не начато (pending) — серый, В работе (in_progress) — синий, Выполнено (done) — зеленый
- Визуализация графика (опционально): Gantt chart или timeline

---

## API Endpoints Reference

### Договоры (Contracts)

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/contracts/` | Список договоров |
| POST | `/contracts/` | Создать договор |
| GET | `/contracts/{id}/` | Детали договора |
| PATCH | `/contracts/{id}/` | Обновить договор |
| DELETE | `/contracts/{id}/` | Удалить договор |
| GET | `/contracts/{id}/balance/` | Баланс договора |
| GET | `/contracts/{id}/cash_flow/` | Cash-flow за период |
| GET | `/contracts/{id}/cash_flow_periods/` | Cash-flow по периодам |

### Рамочные договоры (Framework Contracts)

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/framework-contracts/` | Список рамочных договоров |
| POST | `/framework-contracts/` | Создать рамочный договор |
| GET | `/framework-contracts/{id}/` | Детали рамочного договора |
| PATCH | `/framework-contracts/{id}/` | Обновить рамочный договор |
| DELETE | `/framework-contracts/{id}/` | Удалить рамочный договор |
| GET | `/framework-contracts/{id}/contracts/` | Список договоров под рамочный |
| POST | `/framework-contracts/{id}/add_price_lists/` | Добавить прайс-листы |
| POST | `/framework-contracts/{id}/remove_price_lists/` | Удалить прайс-листы |
| POST | `/framework-contracts/{id}/activate/` | Активировать (draft -> active) |
| POST | `/framework-contracts/{id}/terminate/` | Расторгнуть (-> terminated) |

### Дополнительные соглашения (Contract Amendments)

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/contract-amendments/` | Список доп. соглашений |
| POST | `/contract-amendments/` | Создать доп. соглашение |
| GET | `/contract-amendments/{id}/` | Детали доп. соглашения |
| PATCH | `/contract-amendments/{id}/` | Обновить доп. соглашение |
| DELETE | `/contract-amendments/{id}/` | Удалить доп. соглашение |

### График работ (Work Schedule)

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/work-schedule/` | Список задач графика |
| POST | `/work-schedule/` | Создать задачу |
| GET | `/work-schedule/{id}/` | Детали задачи |
| PATCH | `/work-schedule/{id}/` | Обновить задачу |
| DELETE | `/work-schedule/{id}/` | Удалить задачу |

### Акты выполненных работ (Acts)

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/acts/` | Список актов |
| POST | `/acts/` | Создать акт |
| GET | `/acts/{id}/` | Детали акта |
| PATCH | `/acts/{id}/` | Обновить акт |
| DELETE | `/acts/{id}/` | Удалить акт |
| POST | `/acts/{id}/sign/` | Подписать акт (draft -> signed) |

---

## Бизнес-правила и валидация

### Договоры

1. **Статус "В работе":**
   - Для income: обязательно наличие ТКП со статусом 'approved'
   - Для expense: обязательно наличие МП со статусом 'approved'
   - Бэкенд вернет ошибку 400 если условия не выполнены

2. **Рамочный договор:**
   - Можно указать только для expense
   - Исполнитель в рамочном договоре должен совпадать с контрагентом
   - Рамочный договор должен быть в статусе 'active'
   - При выборе рамочного договора, counterparty подставляется автоматически

3. **Родительский договор:**
   - Используется для зеркальных договоров (доходный + расходный)
   - Родительский договор должен быть income
   - Дочерний договор должен быть expense

4. **Уникальность:**
   - Номер договора уникален в рамках объекта (unique_together: object, number)

### Рамочные договоры

1. **Контрагент:**
   - Должен быть типа 'vendor' или 'both'
   - Бэкенд вернет ошибку 400 если тип не подходит

2. **Срок действия:**
   - valid_until >= valid_from
   - Бэкенд вернет ошибку 400 если условие не выполнено

3. **Удаление:**
   - Нельзя удалить если contracts_count > 0
   - Бэкенд вернет ошибку 400 при попытке удаления

4. **Активация:**
   - Можно активировать только из статуса 'draft'
   - Бэкенд вернет ошибку 400 если статус не draft

### Акты

1. **Авторасчет НДС:**
   - Если указан amount_gross, а amount_net и vat_amount не указаны (или 0), они рассчитываются автоматически
   - Формула: Net = Gross / (1 + rate/100), VAT = Gross - Net
   - Используется vat_rate из договора

2. **Подписание:**
   - Можно подписать только из статуса 'draft'
   - Бэкенд вернет ошибку 400 если статус не draft

### График работ

1. **Валидация дат:**
   - Дата начала задачи >= start_date договора
   - Дата окончания задачи <= end_date договора
   - Дата окончания >= даты начала
   - Бэкенд вернет ошибку 400 если условия не выполнены

### Дополнительные соглашения

1. **Автоматическое обновление договора:**
   - При указании new_start_date, new_end_date, new_total_amount они автоматически обновляют договор
   - Обновление происходит на бэкенде при сохранении доп. соглашения

2. **Уникальность:**
   - Номер доп. соглашения уникален в рамках договора (unique_together: contract, number)

---

## UI/UX требования

### Общие требования

1. **Навигация:**
   - Добавить в Sidebar раздел "Договоры" с подразделами:
     - Договоры (`/contracts`)
     - Рамочные договоры (`/contracts/framework-contracts`)
     - Акты (`/contracts/acts`)

2. **Таблицы:**
   - Пагинация (если данных много)
   - Сортировка по колонкам (где применимо)
   - Фильтры с возможностью сброса
   - Поиск с дебаунсом (300ms)
   - Экспорт в Excel (опционально)

3. **Формы:**
   - Валидация на клиенте и сервере
   - Показ ошибок валидации
   - Автосохранение черновиков (опционально)
   - Подтверждение при удалении

4. **Уведомления:**
   - Toast-уведомления об успехе/ошибках операций
   - Подтверждения для критических действий (удаление, расторжение)

5. **Загрузка:**
   - Skeleton или Spinner при загрузке данных
   - Оптимистичные обновления где возможно

6. **Адаптивность:**
   - Таблицы с горизонтальным скроллом на мобильных
   - Адаптивные формы
   - Responsive layout

### Специфические требования

1. **Договоры:**
   - Разделение доходных и расходных договоров визуально (цвет, иконки)
   - Показ связи родитель-дочерний договор
   - Индикация договоров под рамочным договором

2. **Рамочные договоры:**
   - Предупреждение о скором истечении срока (days_until_expiration < 30)
   - Визуализация статуса активности (is_active)
   - Показ статистики по договорам

3. **Акты:**
   - Визуализация прогресса оплаты (оплачено / всего)
   - Индикация неоплаченных актов
   - Связь актов с платежами

4. **График работ:**
   - Визуализация графика (Gantt chart или timeline) — опционально
   - Цветовая индикация статусов задач
   - Показ перекрытий и задержек

---

## Критерии готовности

### Договоры
- [ ] Список договоров с фильтрами и поиском
- [ ] Создание и редактирование договоров
- [ ] Детальная страница договора со всеми вкладками
- [ ] Управление дополнительными соглашениями
- [ ] Управление графиком работ
- [ ] Управление актами выполненных работ
- [ ] Отображение баланса договора
- [ ] Отображение маржи (для income)
- [ ] Cash-flow (опционально)

### Рамочные договоры
- [ ] Список рамочных договоров с фильтрами
- [ ] Создание и редактирование рамочных договоров
- [ ] Детальная страница рамочного договора
- [ ] Управление прайс-листами
- [ ] Список договоров под рамочный
- [ ] Actions: активация, расторжение
- [ ] Валидация и обработка ошибок

### Общее
- [ ] Все формы валидируются корректно
- [ ] Обработка ошибок API
- [ ] Toast-уведомления работают
- [ ] Адаптивный дизайн
- [ ] Производительность (оптимизация запросов, кеширование)

---

## Примечания

1. **Рамочный договор vs Обычный договор:**
   - Рамочный договор НЕ привязан к объекту
   - Рамочный договор можно указать только для расходных договоров (expense)
   - При выборе рамочного договора, counterparty подставляется автоматически

2. **Валидация:**
   - Все валидации выполняются на бэкенде
   - Фронтенд должен показывать понятные сообщения об ошибках
   - Валидация на клиенте улучшает UX, но не заменяет серверную

3. **Вычисляемые свойства:**
   - is_active, is_expired, days_until_expiration — вычисляются на бэкенде
   - unpaid_amount — вычисляется на бэкенде
   - balance — вычисляется на бэкенде
   - margin — вычисляется на бэкенде

4. **Оптимизация:**
   - Использовать React Query для кеширования
   - Оптимистичные обновления для быстрого отклика
   - Виртуализация для длинных списков
   - Lazy loading для изображений

5. **Доступность:**
   - Все интерактивные элементы доступны с клавиатуры
   - aria-labels для иконок
   - Достаточный контраст цветов
