# Задания на разработку Фронтенда: Исправление упущений (для уже реализованных заданий 1-6)

Этот документ содержит задания для обновления уже реализованного функционала (задания 1-6) с учётом исправленных упущений на бэкенде.

**Важно:** 
- Задания 1-6 уже реализованы на фронтенде, поэтому все изменения для них вынесены в отдельный файл (этот).
- Изменения для заданий 7-9 добавлены непосредственно в соответствующие файлы заданий (`FRONTEND_TASKS_07_PAYMENTS.md`).

**Стек:** Next.js (App Router), TypeScript, TailwindCSS, Shadcn UI, Axios, React Query.

**Базовый URL API:** `https://finance.ngrok.app/api/v1` (или `NEXT_PUBLIC_API_URL`)

**Связанные документы:**
- `FRONTEND_TASKS_02_OBJECTS.md` — Объекты строительства (обновление статусов)
- `FRONTEND_TASKS_06_CONTRACTS.md` — Договоры (новые endpoints и поле в актах)
- `FRONTEND_TASKS_INDEX.md` — Индекс всех заданий
- `BACKEND_MISSING_ITEMS.md` — Документ с упущениями и исправлениями

---

## Этап 38: Обновление статусов объектов

### Обновление интерфейсов и UI для статуса `suspended`

**Изменения в бэкенде:**
- Добавлен статус `SUSPENDED = 'suspended', 'Приостановлен'` в `Object.Status`

**Обновление TypeScript интерфейсов:**

```typescript
// Обновить тип статуса объекта
type ObjectStatus = 'planned' | 'in_progress' | 'completed' | 'suspended';

interface ConstructionObject {
  id: number;
  name: string;
  address: string;
  status: ObjectStatus; // Теперь включает 'suspended'
  start_date: string | null;
  end_date: string | null;
  description?: string;
  contracts_count?: number;
  created_at: string;
  updated_at: string;
}
```

**Обновление UI:**

1. **Страница списка объектов (`/objects`):**
   - Добавить Badge для статуса `suspended`:
     - Цвет: Orange (оранжевый)
     - Текст: "Приостановлен"
   - Обновить фильтр по статусу: добавить опцию "Приостановлен"

2. **Страница деталей объекта (`/objects/[id]`):**
   - Обновить отображение статуса в шапке страницы
   - Обновить форму редактирования: добавить опцию "Приостановлен" в Select статуса

3. **Форма создания/редактирования объекта:**
   - В поле "Статус" добавить опцию:
     - Значение: `suspended`
     - Отображаемый текст: "Приостановлен"

**API:** Без изменений, используется существующий `GET /objects/`, `POST /objects/`, `PATCH /objects/{id}/`

### ✅ Чек-лист проверки
- [ ] Тип `ObjectStatus` обновлён и включает `'suspended'`
- [ ] Badge для статуса "Приостановлен" отображается оранжевым цветом
- [ ] Фильтр по статусу включает опцию "Приостановлен"
- [ ] Форма создания/редактирования объекта содержит опцию "Приостановлен"
- [ ] Сохранение объекта со статусом `suspended` работает корректно

---

## Этап 39: Обновление актов — срок оплаты

### Добавление поля `due_date` в акты

**Изменения в бэкенде:**
- Добавлено поле `due_date: DateField` в модель `Act`

**Обновление TypeScript интерфейсов:**

```typescript
interface Act {
  id: number;
  contract: number;
  contract_number: string; // Read-only
  number: string;
  date: string; // YYYY-MM-DD
  period_start: string | null; // YYYY-MM-DD
  period_end: string | null; // YYYY-MM-DD
  amount_gross: string; // Decimal string
  amount_net: string; // Decimal string
  vat_amount: string; // Decimal string
  status: 'draft' | 'signed' | 'cancelled';
  file: string | null; // URL файла
  description?: string;
  due_date: string | null; // YYYY-MM-DD — Новое поле
  allocations?: ActPaymentAllocation[]; // Read-only
  unpaid_amount?: string; // Read-only: Decimal string
  created_at: string;
  updated_at: string;
}
```

**Обновление UI:**

1. **Страница списка актов:**
   - Добавить колонку "Срок оплаты" (если `due_date` указан)
   - Визуально выделять просроченные акты:
     - Если `due_date < сегодня` и `status === 'signed'` и `unpaid_amount > 0`:
       - Показать Badge "Просрочен" (красный цвет)
       - Выделить строку красным border или фоном

2. **Форма создания/редактирования акта:**
   - Добавить поле "Срок оплаты" (Date picker, опциональное)
   - Подсказка: "Дата, до которой должен быть оплачен акт"
   - Валидация: `due_date` должен быть >= `date` (дата подписания акта)

3. **Детальная страница акта:**
   - Отображать поле "Срок оплаты" в разделе "Основная информация"
   - Если срок просрочен и акт не оплачен полностью:
     - Показать предупреждение: "⚠️ Срок оплаты просрочен"
     - Выделить красным цветом

4. **Страница договора — вкладка "Акты":**
   - В таблице актов добавить колонку "Срок оплаты"
   - Визуально выделять просроченные акты

**API:**
- `GET /acts/` — теперь возвращает поле `due_date`
- `POST /acts/` — принимает поле `due_date`
- `PATCH /acts/{id}/` — принимает поле `due_date`

### ✅ Чек-лист проверки
- [ ] Интерфейс `Act` обновлён с полем `due_date`
- [ ] Поле "Срок оплаты" отображается в списке актов
- [ ] Просроченные акты визуально выделяются
- [ ] Форма создания/редактирования содержит поле "Срок оплаты"
- [ ] Валидация даты работает (due_date >= date)
- [ ] Сохранение акта с сроком оплаты работает корректно
- [ ] Детальная страница акта отображает срок оплаты и предупреждения

---

## Этап 40: Новые endpoints для договоров

### Интеграция новых endpoints в детальную страницу договора

**Изменения в бэкенде:**
- Добавлены `@action` методы в `ContractViewSet`:
  - `GET /api/v1/contracts/{id}/correspondence/` — получение переписки по договору
  - `GET /api/v1/contracts/{id}/schedule/` — получение графика работ по договору
  - `POST /api/v1/contracts/{id}/amendments/` — создание доп. соглашения к договору

**Обновление TypeScript интерфейсов:**

```typescript
// Интерфейсы уже определены в других заданиях, но нужно убедиться, что они используются

interface Correspondence {
  id: number;
  type: 'incoming' | 'outgoing';
  category: 'letter' | 'notification' | 'claim' | 'agreement' | 'other';
  status: 'draft' | 'sent' | 'delivered' | 'received' | 'processed' | 'cancelled';
  contract: number;
  contract_number?: string; // Read-only
  counterparty: number | null;
  counterparty_name?: string; // Read-only
  number: string;
  date: string; // YYYY-MM-DD
  subject: string;
  description?: string;
  file: string | null;
  related_to: number | null;
  related_to_number?: string; // Read-only
  created_at: string;
  updated_at: string;
}

interface WorkScheduleItem {
  id: number;
  contract: number;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  workers_count: number;
  status: 'pending' | 'in_progress' | 'done';
  created_at: string;
  updated_at: string;
}

interface ContractAmendment {
  id: number;
  contract: number;
  number: string;
  date: string; // YYYY-MM-DD
  reason: string;
  new_start_date: string | null; // YYYY-MM-DD
  new_end_date: string | null; // YYYY-MM-DD
  new_total_amount: string | null; // Decimal string
  file: string | null; // URL файла
  created_at: string;
  updated_at: string;
}
```

**Обновление UI:**

1. **Детальная страница договора (`/contracts/[id]`):**

   #### Вкладка "Переписка"
   - **API:** `GET /api/v1/contracts/{id}/correspondence/`
   - Заменить использование `GET /correspondence/?contract={id}` на новый endpoint
   - Таблица переписки:
     - Колонки: Дата, Тип, Номер, Тема, Статус
     - Кнопка "Добавить переписку" → Modal форма
   - Преимущества нового endpoint:
     - Более явный API
     - Возможность добавить дополнительную логику на бэкенде

   #### Вкладка "График работ"
   - **API:** `GET /api/v1/contracts/{id}/schedule/`
   - Заменить использование `GET /work-schedule/?contract={id}` на новый endpoint
   - Таблица графика работ:
     - Колонки: Название, Начало, Окончание, Рабочих, Статус
     - Кнопка "Добавить задачу" → Modal форма
   - Преимущества нового endpoint:
     - Более явный API
     - Упрощённая фильтрация

   #### Вкладка "Доп. соглашения"
   - **API:** 
     - `GET /contract-amendments/?contract={id}` — для списка (остаётся как есть)
     - `POST /api/v1/contracts/{id}/amendments/` — для создания (новый endpoint)
   - Таблица доп. соглашений:
     - Колонки: Номер, Дата, Причина, Новые даты/сумма, Файл
     - Кнопка "Создать доп. соглашение" → Modal форма
   - Форма создания доп. соглашения:
     - Использовать новый endpoint `POST /api/v1/contracts/{id}/amendments/`
     - Поля:
       - Номер* (обязательно)
       - Дата* (обязательно)
       - Причина* (обязательно, Textarea)
       - Новая дата начала (Date picker, опционально)
       - Новая дата окончания (Date picker, опционально)
       - Новая сумма (Number input, опционально)
       - Файл (File input, опционально)
     - При отправке формы:
       - `contract` автоматически устанавливается из URL (не нужно передавать в теле запроса)
       - Отправлять только поля формы

2. **Обновление функций API:**

```typescript
// Пример использования новых endpoints (только интерфейсы, без реализации)

// Получение переписки по договору
const getContractCorrespondence = async (contractId: number): Promise<Correspondence[]> => {
  // GET /api/v1/contracts/{contractId}/correspondence/
};

// Получение графика работ по договору
const getContractSchedule = async (contractId: number): Promise<WorkScheduleItem[]> => {
  // GET /api/v1/contracts/{contractId}/schedule/
};

// Создание доп. соглашения к договору
const createContractAmendment = async (
  contractId: number,
  data: Omit<ContractAmendment, 'id' | 'contract' | 'created_at' | 'updated_at'>
): Promise<ContractAmendment> => {
  // POST /api/v1/contracts/{contractId}/amendments/
  // В теле запроса НЕ передавать contract, он берётся из URL
};
```

**API Endpoints:**
- `GET /api/v1/contracts/{id}/correspondence/` — возвращает массив `Correspondence[]`
- `GET /api/v1/contracts/{id}/schedule/` — возвращает массив `WorkScheduleItem[]`
- `POST /api/v1/contracts/{id}/amendments/` — принимает данные доп. соглашения (без поля `contract`), возвращает `ContractAmendment`

### ✅ Чек-лист проверки
- [ ] Вкладка "Переписка" использует новый endpoint `/contracts/{id}/correspondence/`
- [ ] Вкладка "График работ" использует новый endpoint `/contracts/{id}/schedule/`
- [ ] Вкладка "Доп. соглашения" использует новый endpoint `/contracts/{id}/amendments/` для создания
- [ ] Форма создания доп. соглашения не требует указания `contract` (берётся из URL)
- [ ] Все новые endpoints работают корректно
- [ ] Обработка ошибок реализована для всех новых endpoints

---

## Итоговый чек-лист этапа

### Обновления интерфейсов
- [ ] Тип `ObjectStatus` обновлён (добавлен `'suspended'`)
- [ ] Интерфейс `Act` обновлён (добавлено `due_date`)

### Обновления UI
- [ ] Статус "Приостановлен" для объектов отображается корректно
- [ ] Поле "Срок оплаты" в актах работает
- [ ] Новые endpoints для договоров интегрированы

### API интеграция
- [ ] Все новые поля отправляются/получаются корректно
- [ ] Все новые endpoints используются корректно
- [ ] Обработка ошибок реализована

### Тестирование
- [ ] Создание объекта со статусом `suspended` работает
- [ ] Создание акта с сроком оплаты работает
- [ ] Использование новых endpoints для договоров работает
- [ ] Визуальные индикаторы (Badges, предупреждения) отображаются корректно

---

## Примечания

1. **Обратная совместимость:** Все новые поля опциональные (`null` или `false` по умолчанию), поэтому существующий код должен продолжать работать.

2. **Валидация:**
   - Для `due_date` в актах: должна быть >= `date` (дата подписания)

3. **Визуальные улучшения:**
   - Просроченные акты должны быть хорошо заметны
   - Статус "Приостановлен" должен быть понятен пользователю

4. **Производительность:**
   - Новые endpoints для договоров могут быть более эффективными, чем фильтрация через стандартные ViewSets
   - Использование новых endpoints упрощает код на фронтенде

---

*Документ создан: 13.12.2025*
