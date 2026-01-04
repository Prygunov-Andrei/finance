# Задания на разработку Фронтенда: ТКП и МП

**Стек:** Next.js (App Router), TypeScript, TailwindCSS, Shadcn UI, Axios, React Query.

**Базовый URL API:** `https://finance.ngrok.app/api/v1` (или `NEXT_PUBLIC_API_URL`)

**Связанные документы:**
- `FRONTEND_TASKS_01_FOUNDATION.md` — Базовые этапы (Фундамент, Справочники)
- `FRONTEND_TASKS_02_OBJECTS.md` — Объекты строительства
- `FRONTEND_TASKS_03_PRICELISTS.md` — Прайс-листы
- `FRONTEND_TASKS_04_PROJECTS_ESTIMATES.md` — Проекты и Сметы (используются в ТКП)
- `FRONTEND_TASKS_06_CONTRACTS.md` — Договоры (создаются из ТКП/МП)
- `FRONTEND_TASKS_INDEX.md` — Индекс всех заданий
- `PROJECT.md` — Полная документация проекта

---

## Этап 14: Справочники (Фронт работ, Условия для МП)

### Фронт работ (`/proposals/front-of-work-items`)
- **API:** `GET/POST/PATCH/DELETE /front-of-work-items/`
- **Тип:** `{ id, name, category, is_active, sort_order }`
- **UI:** Таблица с фильтрами (категория, активные), поиск по названию, CRUD формы

### Условия для МП (`/proposals/mounting-conditions`)
- **API:** `GET/POST/PATCH/DELETE /mounting-conditions/`
- **Тип:** `{ id, name, description, is_active, sort_order }`
- **UI:** Таблица с фильтрами, поиск, CRUD формы

**Важно:** Добавить в навигацию после Contracts.

---

## Этап 15: ТКП — Список и создание

### Список ТКП (`/proposals/technical-proposals`)

**API:** `GET /technical-proposals/` с пагинацией, фильтрами и поиском

**Фильтры:**
- `?object={id}` - по объекту
- `?legal_entity={id}` - по компании
- `?status={status}` - по статусу (draft, in_progress, checking, approved, sent)
- `?search={text}` - поиск по номеру/названию

**Типы данных:**
```typescript
type TKPStatus = 'draft' | 'in_progress' | 'checking' | 'approved' | 'sent';

interface TechnicalProposalListItem {
  id: number;
  number: string; // "210_15.12.25" (автогенерация)
  outgoing_number?: string;
  name: string;
  date: string;
  object: number;
  object_name: string;
  object_address: string;
  legal_entity: number;
  legal_entity_name: string;
  status: TKPStatus;
  total_amount: string; // Decimal
  total_with_vat: string;
  validity_date: string;
  version_number: number;
  parent_version?: number;
  created_by_name: string;
  created_at: string;
}
```

**UI:**
- Таблица: Номер, Название, Дата, Объект, Компания, Статус (Badge), Сумма, Версия, Действия
- Панель фильтров: объект, компания, статус, поиск
- Кнопка "Создать ТКП"
- Статусы: draft (серый), in_progress (синий), checking (желтый), approved (зеленый), sent (фиолетовый)

### Форма создания/редактирования ТКП

**API:** `POST /technical-proposals/`, `PATCH /technical-proposals/{id}/`

**Поля:**
- Название* (обязательно)
- Дата* (DatePicker)
- Объект* (Select)
- Площадь объекта м² (Number)
- Наша компания* (Select)
- Исходящий номер (Text)
- Необходимый аванс (Textarea)
- Срок проведения работ (Textarea)
- Срок действия дней (Number, default 30)
- Примечания (Textarea)
- Статус (Select)
- Кто проверил (Select, User)
- Кто утвердил (Select, User)
- Файл ТКП (File input, PDF)

**Важно:**
- `created_by` устанавливается автоматически
- Номер генерируется автоматически при сохранении (см. раздел "Автоматическая нумерация" ниже)
- После операций с данными (копирование из смет) нужен refetch из-за кэширования вычисляемых свойств

---

## Автоматическая нумерация и версионирование ТКП/МП

### Обзор

Система коммерческих предложений (ТКП/МП) поддерживает:
1. **Автоматическую нумерацию** — номера генерируются автоматически при создании
2. **Версионирование** — возможность создавать новые версии КП с наследованием данных

### Изменения в API

#### 1. Поле `number` теперь опциональное при создании

**Интерфейс:**
```typescript
interface CommercialProposal {
  id: number;
  object: number;
  object_name?: string;
  counterparty: number;
  counterparty_name?: string;
  contract_id?: number;
  
  proposal_type: 'income' | 'expense';
  number?: string; // ← Теперь опциональное! Генерируется автоматически
  date: string; // YYYY-MM-DD
  total_amount: string;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  description?: string;
  file?: string | File;
  
  // Новые поля
  parent_proposal_id?: number | null;
  parent_proposal_number?: string;
  mounting_proposals_count?: number;
  estimate_files?: EstimateFile[];
  
  created_at: string;
  updated_at: string;
}
```

**Важно:** 
- При `POST /commercial-proposals/` можно не указывать `number` (будет сгенерирован автоматически)
- После создания в ответе API будет возвращен сгенерированный `number`
- Если `number` указан вручную — он будет использован (но рекомендуется оставлять автогенерацию)

#### 2. Форматы номеров

**ТКП (proposal_type='income'):**
- Формат: `{порядковый_номер}_{дата_ДД.ММ.ГГ}`
- Примеры: `210_12.12.25`, `211_15.01.26`, `212_20.02.26`
- Порядковый номер глобальный (начинается с 210, настраивается на бэкенде)

**МП (proposal_type='expense'):**
- Формат: `{номер_ТКП}-{номер_МП}` с ведущими нулями
- Примеры: `210_12.12.25-01`, `210_12.12.25-02`, `211_15.01.26-01`
- Если МП без родительского ТКП (автономное) — генерируется как ТКП

**Версии:**
- Новая дата: `210_12.12.25` → `213_20.12.25` (новый порядковый номер)
- Та же дата: `210_12.12.25` → `210_12.12.25-v2`, `210_12.12.25-v3`

#### 3. API Endpoint: Создание версии

**Endpoint:** `POST /api/v1/commercial-proposals/{id}/create-version/`

**Request Body (опционально):**
```json
{
  "date": "2024-12-20"  // Опционально, новая дата для версии
}
```

**Response:** 
- Статус: `201 Created`
- Тело: объект `CommercialProposal` (новая версия)
- Новая версия имеет:
  - Статус: `draft`
  - Все поля наследованы (кроме `estimate_files`)
  - Новый `number` (автоматически сгенерирован)
  - Новый `id`

**Примеры использования:**
- Создание версии с новой датой: `POST /api/v1/commercial-proposals/123/create-version/` с телом `{ "date": "2024-12-20" }`
- Создание версии с той же датой (суффикс версии): `POST /api/v1/commercial-proposals/123/create-version/` с телом `{}` или без body

### Изменения в UI

#### 1. Форма создания КП

**Обновить поле "Номер":**

**Было:**
- Поле обязательное

**Стало:**
- Поле опциональное (можно оставить пустым)
- Placeholder: "Оставьте пустым для автогенерации"
- Help text: "Оставьте пустым для автоматической генерации номера. Формат: ТКП — {номер}_{дата}, МП — {номер_ТКП}-{номер}"

#### 2. Отображение номера после создания

**После успешного создания КП:**
- В ответе API приходит `number` (сгенерированный или указанный)
- Отобразить номер в карточке/таблице
- Показать уведомление: "КП создано. Номер: {number}"

**Логика:**
- При создании КП поле `number` можно не указывать (опционально)
- После успешного создания в ответе API приходит `number` (сгенерированный или указанный)
- Показать уведомление: "КП создано. Номер: {number}"

#### 3. Кнопка "Создать версию"

**Местоположение:**
- В карточке деталей КП (страница `/commercial-proposals/{id}`)
- ИЛИ в dropdown меню действий в таблице КП

**Реализация:**

**Вариант 1: Отдельная кнопка в карточке**
- Кнопка "Создать версию" с иконкой копирования
- При клике открывается Dialog для создания версии

**Вариант 2: В dropdown меню**
- Пункт меню "Создать версию" с иконкой копирования
- При клике открывается Dialog для создания версии

#### 4. Dialog создания версии

**Компонент: Dialog (Modal) с формой**

**Структура Dialog:**
- Заголовок: "Создать новую версию КП"
- Описание: "Новая версия наследует все данные (кроме файлов сметы)"
- Информационный блок (Alert):
  - Заголовок: "Как работает нумерация версий:"
  - Список:
    - Если дата изменилась — будет присвоен новый порядковый номер
    - Если дата та же — к номеру добавится суффикс версии (-v2, -v3 и т.д.)
- Поле "Дата новой версии" (DatePicker):
  - По умолчанию: дата исходного КП
  - Подсказка: "Оставьте без изменений для создания версии с той же датой"
- Кнопки: "Отмена", "Создать версию"

**Логика обработки:**
- При отправке формы: `POST /commercial-proposals/{id}/create-version/` с телом `{ date?: string }`
- Если дата не указана, отправлять пустой объект `{}`
- После успешного создания:
  - Показать уведомление: "Версия создана. Номер: {number}"
  - Перенаправить на страницу новой версии или обновить список
- При ошибке: показать уведомление с сообщением об ошибке

#### 5. Отображение версий (опционально, но желательно)

**В карточке КП добавить секцию "История версий":**

- Показывать секцию только если номер содержит суффикс версии (`number.includes('-v')`)
- Заголовок: "История версий"
- Текст: "Это версия {номер_версии} коммерческого предложения"
- Номер версии извлекается из суффикса номера (например, из "210_12.12.25-v2" извлечь "2")
- Можно добавить ссылку на предыдущие версии через фильтр по номеру

### Логика нумерации (для справки)

**Генерация номера ТКП:**
1. Ищется максимальный порядковый номер среди всех ТКП
2. Берется следующий номер (или начальный из настроек, если нет ТКП)
3. Формируется: `{номер}_{дата_ДД.ММ.ГГ}`

**Генерация номера МП:**
1. Проверяется наличие `parent_proposal`
2. Ищется максимальный номер МП для этого ТКП (парсинг суффикса `-XX`)
3. Берется следующий номер и форматируется с ведущими нулями: `{номер_ТКП}-{номер_МП}`

**Генерация номера версии:**
1. Если новая дата отличается от исходной:
   - Генерируется новый номер ТКП с новой датой
2. Если дата та же:
   - Парсится исходный номер
   - Извлекается версия (если есть `-vN`)
   - Добавляется суффикс `-v{N+1}`

### Важные замечания

1. **Обратная совместимость:** Старые КП с ручными номерами продолжают работать
2. **Валидация:** Можно указать номер вручную, но рекомендуется использовать автогенерацию
3. **Файлы сметы:** При создании версии файлы сметы НЕ наследуются (требуется загрузить заново)
4. **Статус версии:** Новая версия всегда создается со статусом `draft`

### Примеры API запросов

#### 1. Создание ТКП без номера
```http
POST /api/v1/commercial-proposals/
Content-Type: application/json

{
  "object": 1,
  "counterparty": 5,
  "proposal_type": "income",
  "date": "2024-12-25",
  "total_amount": "1000000.00",
  "description": "Тестовое ТКП"
  // number не указан - будет сгенерирован
}
```

**Response:**
```json
{
  "id": 123,
  "number": "210_25.12.24",  // ← Сгенерированный номер
  "object": 1,
  "counterparty": 5,
  "proposal_type": "income",
  "date": "2024-12-25",
  "total_amount": "1000000.00",
  "status": "draft",
  ...
}
```

#### 2. Создание МП с родительским ТКП
```http
POST /api/v1/commercial-proposals/
Content-Type: application/json

{
  "object": 1,
  "counterparty": 10,
  "proposal_type": "expense",
  "parent_proposal_id": 123,  // ID родительского ТКП
  "date": "2024-12-25",
  "total_amount": "800000.00"
  // number не указан - будет сгенерирован как "210_25.12.24-01"
}
```

**Response:**
```json
{
  "id": 124,
  "number": "210_25.12.24-01",  // ← Номер с привязкой к ТКП
  "parent_proposal_id": 123,
  "parent_proposal_number": "210_25.12.24",
  ...
}
```

#### 3. Создание версии с новой датой
```http
POST /api/v1/commercial-proposals/123/create-version/
Content-Type: application/json

{
  "date": "2024-12-30"
}
```

**Response:**
```json
{
  "id": 125,
  "number": "213_30.12.24",  // ← Новый порядковый номер (дата изменилась)
  "date": "2024-12-30",
  "status": "draft",
  ...
}
```

#### 4. Создание версии с той же датой
```http
POST /api/v1/commercial-proposals/123/create-version/
Content-Type: application/json

{}
```

**Response:**
```json
{
  "id": 126,
  "number": "210_25.12.24-v2",  // ← Суффикс версии (дата та же)
  "date": "2024-12-25",
  "status": "draft",
  ...
}
```

### Чек-лист реализации

**Автоматическая нумерация:**
- [ ] Поле "Номер" в форме создания КП сделано опциональным
- [ ] Добавлена подсказка про автогенерацию номера
- [ ] После создания КП отображается сгенерированный номер
- [ ] Номер корректно отображается в таблице и карточке КП

**Версионирование:**
- [ ] Добавлена кнопка "Создать версию" в интерфейс КП
- [ ] Реализован Dialog для создания версии
- [ ] Dialog содержит поле выбора даты (опционально)
- [ ] Dialog содержит информационные сообщения про нумерацию
- [ ] После создания версии происходит редирект или обновление списка
- [ ] Корректно обрабатываются ошибки API

**Тестирование:**
- [ ] Проверено создание ТКП без номера → номер генерируется
- [ ] Проверено создание МП без номера → номер генерируется с учетом родительского ТКП
- [ ] Проверено создание версии с новой датой → новый порядковый номер
- [ ] Проверено создание версии с той же датой → суффикс версии (-v2)
- [ ] Проверено отображение всех форматов номеров

---

## Этап 16: ТКП — Детальная страница

### Страница (`/proposals/technical-proposals/{id}`)

**API:** `GET /technical-proposals/{id}/` возвращает расширенные данные

**Дополнительные поля в детальной версии:**
```typescript
interface TechnicalProposalDetail extends TechnicalProposalListItem {
  advance_required: string;
  work_duration: string;
  notes: string;
  estimates: number[]; // ID смет
  estimate_sections: TKPEstimateSection[];
  characteristics: TKPCharacteristic[];
  front_of_work: TKPFrontOfWork[];
  total_profit: string;
  profit_percent: string;
  total_man_hours: string;
  currency_rates: { usd?: string, eur?: string, cny?: string };
  file_url?: string;
  signatory_name: string;
  signatory_position: string;
  versions_count: number;
}
```

**Структура страницы:**
1. **Шапка:** Название, номер, кнопки (Редактировать, Создать версию, Создать МП, Удалить, История версий)
2. **Панель:** Статус, даты, объект, компания, суммы (total_amount, total_with_vat, profit), человек-часы, курсы валют
3. **Вкладки:** Основное, Сметы, Разделы, Характеристики, Фронт работ, История версий

**Вкладка "Основное":** Все поля формы + подписант, утверждения, файл, версия

---

## Этап 17: ТКП — Управление сметами

### Вкладка "Сметы"

**API:**
- `POST /technical-proposals/{id}/add-estimates/` - `{ estimate_ids: [1,2], copy_data: true }`
- `POST /technical-proposals/{id}/remove-estimates/` - `{ estimate_ids: [1] }`
- `POST /technical-proposals/{id}/copy-from-estimates/` - копирование данных

**UI:**
- Список привязанных смет (таблица с данными из `/estimates/{id}/`)
- Кнопка "Добавить сметы" (Dialog с мультиселектом)
- Кнопка "Обновить данные из смет" (с подтверждением)
- Удаление смет

**Важно:** После копирования данных обязательно обновить кэш запросов для ТКП.

---

## Этап 18: ТКП — Разделы и характеристики

### Вкладка "Разделы"

**Данные:** `technicalProposal.estimate_sections[]` с вложенными `subsections[]`

**Типы:**
```typescript
interface TKPEstimateSection {
  id: number;
  name: string;
  subsections: TKPEstimateSubsection[];
  total_sale: string;
  total_purchase: string;
}

interface TKPEstimateSubsection {
  id: number;
  name: string;
  materials_sale: string;
  works_sale: string;
  materials_purchase: string;
  works_purchase: string;
  total_sale: string; // materials + works
  total_purchase: string;
}
```

**UI:**
- Accordion/Tree view по разделам
- Таблица подразделов с итогами по разделу
- Общая сводка внизу (итоги по всем разделам)

**Редактирование:** `PATCH /tkp-sections/{id}/`, `PATCH /tkp-subsections/{id}/`

### Вкладка "Характеристики"

**Данные:** `technicalProposal.characteristics[]`

**Тип:** `{ id, name, purchase_amount, sale_amount, sort_order }`

**UI:** Таблица с итогами (общая прибыль, процент)

**API:** `GET/POST/PATCH/DELETE /tkp-characteristics/?tkp={id}`

---

## Этап 19: ТКП — Фронт работ и версионирование

### Вкладка "Фронт работ"

**API:** `GET/POST/PATCH/DELETE /tkp-front-of-work/?tkp={id}`

**Тип:** `{ id, front_item, front_item_name, front_item_category, when_text, when_date, sort_order }`

**UI:**
- Таблица/список пунктов
- Форма добавления (Select пункта из справочника, when_text, when_date)
- Редактирование/удаление

**Валидация:** Один пункт может быть только один раз (unique_together на бэкенде)

### Версионирование ТКП

**API:**
- `POST /technical-proposals/{id}/create-version/` - создание новой версии (см. раздел "Автоматическая нумерация и версионирование" выше)
- `GET /technical-proposals/{id}/versions/` - история версий

**UI:**
- Кнопка "Создать версию" (Dialog с формой выбора даты, см. раздел "Автоматическая нумерация и версионирование" выше)
- Вкладка "История версий" (Timeline/Table со всеми версиями)
- Отображение связи версий на основной вкладке

**Важно:** 
- При создании версии копируются все данные, статус = draft, версия +1
- Номер версии генерируется автоматически (см. раздел "Автоматическая нумерация и версионирование" выше)

---

## Этап 20: МП — Список и создание

### Список МП (`/proposals/mounting-proposals`)

**API:** `GET /mounting-proposals/` с фильтрами и пагинацией

**Фильтры:**
- `?object={id}`, `?counterparty={id}`, `?parent_tkp={id}`, `?status={status}`
- `?telegram_published={true/false}`, `?search={text}`

**Типы:**
```typescript
type MPStatus = 'draft' | 'published' | 'sent' | 'approved' | 'rejected';

interface MountingProposalListItem {
  id: number;
  number: string; // "210_15.12.25-01" или "МП-2025-001"
  name: string;
  date: string;
  object: number;
  object_name: string;
  counterparty?: number;
  counterparty_name?: string;
  parent_tkp?: number;
  parent_tkp_number?: string;
  mounting_estimate?: number;
  total_amount: string;
  man_hours: string;
  status: MPStatus;
  telegram_published: boolean;
  telegram_published_at?: string;
  version_number: number;
  created_by_name: string;
}
```

**UI:** Таблица с фильтрами, статусы (Badge), иконка Telegram если опубликовано

### Форма создания/редактирования МП

**API:** `POST /mounting-proposals/`, `PATCH /mounting-proposals/{id}/`

**Поля:**
- Название*, Дата*, Объект* (обязательные)
- Исполнитель (Select, только vendor с subtype=executor)
- Родительское ТКП (Select, только approved)
- Монтажная смета (Select, `/mounting-estimates/`)
- Сумма, Человеко-часы
- Примечания
- Условия для МП (MultiSelect, `/mounting-conditions/?is_active=true`)
- Статус, Файл МП

**Валидация на бэкенде:**
- Исполнитель должен быть vendor
- Если указана монтажная смета, можно автозаполнить сумму и человек-часы

---

## Этап 21: МП — Детальная страница

### Страница (`/proposals/mounting-proposals/{id}`)

**API:** `GET /mounting-proposals/{id}/` с расширенными данными

**Дополнительные поля:**
```typescript
interface MountingProposalDetail extends MountingProposalListItem {
  notes: string;
  conditions: MountingCondition[];
  conditions_ids: number[]; // для записи
  file_url?: string;
  versions_count: number;
  parent_tkp_name?: string;
  mounting_estimate_number?: string;
}
```

**Структура:**
1. **Шапка:** Кнопки (Редактировать, Создать версию, Опубликовать в Telegram, Удалить)
2. **Панель:** Статус, дата, объект, исполнитель, ТКП, смета, суммы
3. **Вкладки:** Основное, Условия, История версий

### Действия МП

**API:**
- `POST /mounting-proposals/{id}/create-version/` - новая версия
- `POST /mounting-proposals/{id}/mark-telegram-published/` - публикация в Telegram
- `GET /mounting-proposals/{id}/versions/` - история версий

**Вкладка "Условия":**
- Список условий
- Добавление/удаление через обновление `conditions_ids` (PATCH)

**Копирование данных из монтажной сметы:**
- GET сметы → PATCH МП с `total_amount` и `man_hours`
- Или автозаполнение при выборе сметы в форме

---

## Этап 22: Создание МП из ТКП

### Интеграция ТКП → МП

**API:** `POST /technical-proposals/{id}/create-mp/`

**Тело:** `{ counterparty: id, mounting_estimate?: id, total_amount?: string, man_hours?: string, notes?: string, conditions_ids?: [1,2] }`

**UI:**
- Кнопка "Создать МП" на детальной странице ТКП (видна только если status = 'approved')
- Dialog/Sheet с формой: исполнитель*, монтажная смета, сумма, человек-часы, примечания, условия
- После создания → редирект на новую страницу МП

**Автозаполнение на бэкенде:**
- `parent_tkp` = текущий ТКП
- `object` = объект из ТКП
- `name` = "МП к {tkp.name}"
- Номер = `{tkp.number}-01` (первая версия)

---

## Этап 23: Интеграция и оптимизация

### Навигация
- Добавить в Sidebar: "ТКП" и "МП" (или подменю "Предложения")

### Пагинация
- Все списки поддерживают пагинацию: `?page=2&page_size=20`
- Ответ: `{ count, next, previous, results }`
- Использовать `useInfiniteQuery` для бесконечной прокрутки или стандартную пагинацию

### Обработка ошибок
- 400: валидационные ошибки `{ field: ["error"] }` - показывать под полями
- 403: нет прав - toast
- 404: не найдено - toast
- 500: ошибка сервера - toast

### Файлы
- Загрузка: `FormData` с полем `file`
- Отображение: `file_url` из API - кнопка "Скачать" или ссылка

### Инвалидация кэша React Query
После операций инвалидировать:
- Создание/обновление/удаление: обновить кэш списка ТКП и детальной страницы ТКП
- Копирование данных, добавление смет: обновить кэш детальной страницы ТКП
- Создание версии: инвалидировать старый и новый ТКП

### Производительность
- Lazy loading вкладок: `enabled: activeTab === 'sections'`
- Debounce для поиска (500ms)
- Skeleton loaders при загрузке
- Оптимистичные обновления где возможно

### Важные детали
- **Кэширование на бэкенде:** Вычисляемые свойства (`total_amount`, `profit_percent`, etc.) кэшируются. После изменений нужен refetch.
- **Статусы:** Показывать валидные переходы или отдельные кнопки действий.
- **Версионирование:** При создании версии копируются все данные, статус = draft, версия +1.
- **Рамочные договоры:** МП может быть связано с рамочным договором (`framework_contract`). Проверка: исполнитель должен совпадать, договор должен быть active.

---

## Чек-лист финальной проверки

- [ ] Все CRUD операции работают
- [ ] Версионирование работает
- [ ] Создание МП из ТКП работает
- [ ] Фильтры и поиск работают
- [ ] Пагинация работает
- [ ] Загрузка/скачивание файлов работает
- [ ] Ошибки обрабатываются корректно
- [ ] Кэш обновляется после операций
- [ ] Навигация обновлена
