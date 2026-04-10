# Supplier RFQ (Request for Quotation) — Дизайн-документ

## Цель

Создать систему формирования запросов поставщикам (RFQ) из сметы, получения ответов (КП и счетов), сравнения цен и применения лучших предложений к смете.

## Воркфлоу

```
Смета (EstimateItem без цен)
  ↓
Выбор позиций → Создание RFQ (draft)
  ↓
Выбор поставщиков → Отправка (email / Breez API)
  ↓
Ожидание ответов
  ↓
Загрузка КП/счетов от поставщиков → Распознавание цен
  ↓
Сравнение цен (таблица: позиция × поставщик → цена)
  ↓
Применение лучших цен к смете
```

## Модели данных

### SupplierRFQ
```python
class SupplierRFQ(TimestampedModel):
    class Status(TextChoices):
        DRAFT = 'draft', 'Черновик'
        SENT = 'sent', 'Отправлен'
        PARTIALLY_RESPONDED = 'partial', 'Частичный ответ'
        RESPONDED = 'responded', 'Получены ответы'
        APPLIED = 'applied', 'Применён к смете'
        CLOSED = 'closed', 'Закрыт'

    estimate = FK(Estimate)              # Из какой сметы
    number = CharField(auto)             # RFQ-2026-001
    name = CharField                     # "Запрос на вентиляцию Клин"
    status = CharField(choices)
    due_date = DateField(null)           # Крайний срок ответа
    message = TextField(blank)           # Сопроводительное письмо
    created_by = FK(User)
    counterparties = M2M(Counterparty)   # Кому отправлен
```

### SupplierRFQItem
```python
class SupplierRFQItem(TimestampedModel):
    rfq = FK(SupplierRFQ, related='items')
    estimate_item = FK(EstimateItem, null)  # Связь со строкой сметы
    name = CharField                         # Наименование (может отличаться)
    model_name = CharField(blank)
    unit = CharField
    quantity = DecimalField
    sort_order = IntegerField
```

### SupplierRFQResponse
```python
class SupplierRFQResponse(TimestampedModel):
    class Status(TextChoices):
        UPLOADED = 'uploaded', 'Загружен'
        RECOGNIZED = 'recognized', 'Распознан'
        REVIEWED = 'reviewed', 'Проверен'

    rfq = FK(SupplierRFQ, related='responses')
    counterparty = FK(Counterparty)
    status = CharField(choices)
    file = FileField(null)                   # Загруженный КП/счёт
    received_at = DateTimeField(auto_now_add)
    delivery_days = IntegerField(null)       # Срок поставки
    validity_days = IntegerField(null)       # Срок действия предложения
    notes = TextField(blank)
```

### SupplierRFQResponseItem
```python
class SupplierRFQResponseItem(TimestampedModel):
    response = FK(SupplierRFQResponse, related='items')
    rfq_item = FK(SupplierRFQItem)           # К какой позиции запроса
    price = DecimalField                      # Цена за единицу
    total = DecimalField(null)               # Общая сумма
    available = BooleanField(default=True)   # В наличии
    notes = CharField(blank)                 # Примечание поставщика
```

## API Endpoints

```
# RFQ CRUD
POST   /api/v1/supplier-rfq/                    # Создать запрос
GET    /api/v1/supplier-rfq/                    # Список запросов
GET    /api/v1/supplier-rfq/{id}/               # Детали запроса
PATCH  /api/v1/supplier-rfq/{id}/               # Обновить
DELETE /api/v1/supplier-rfq/{id}/               # Удалить (только draft)

# Позиции запроса
POST   /api/v1/supplier-rfq/{id}/add-items/     # Добавить позиции из сметы
DELETE /api/v1/supplier-rfq/{id}/remove-items/   # Удалить позиции

# Отправка
POST   /api/v1/supplier-rfq/{id}/send/          # Отправить email поставщикам
POST   /api/v1/supplier-rfq/{id}/send-api/      # Отправить через API (Breez)

# Ответы
POST   /api/v1/supplier-rfq/{id}/upload-response/  # Загрузить КП/счёт
PATCH  /api/v1/supplier-rfq-responses/{id}/         # Обновить ответ
POST   /api/v1/supplier-rfq-responses/{id}/recognize/ # OCR распознавание

# Сравнение и применение
GET    /api/v1/supplier-rfq/{id}/compare/        # Таблица сравнения цен
POST   /api/v1/supplier-rfq/{id}/apply/          # Применить лучшие цены к смете
```

## UX-флоу

### 1. Создание запроса
- Кнопка "Запрос поставщикам" на toolbar сметы (рядом с "Подобрать цены")
- Диалог: выбор позиций без цен (или все) → название запроса → срок ответа
- Создаётся RFQ в статусе DRAFT

### 2. Выбор поставщиков и отправка
- Экран RFQ: список позиций + выбор поставщиков (чекбоксы)
- Кнопка "Отправить" → email каждому поставщику с Excel-таблицей позиций
- Статус → SENT

### 3. Получение ответов
- Кнопка "Загрузить ответ" → upload файл + выбрать поставщика
- OCR/LLM распознаёт цены из файла и маппит на позиции RFQ
- Или ручной ввод цен в таблицу

### 4. Сравнение
- Таблица: строки = позиции, столбцы = поставщики
- Ячейки: цена (зелёным — минимальная, красным — максимальная)
- Чекбокс на каждой ячейке — какое предложение принять

### 5. Применение
- Кнопка "Применить выбранные" → обновляет material_unit_price + product в EstimateItem
- Создаёт ProductPriceHistory записи
- Статус → APPLIED

## Email шаблон

```
Тема: Запрос цен #{rfq.number} — {rfq.name}

Уважаемые коллеги,

Просим предоставить коммерческое предложение на следующие позиции:

[Excel-приложение с позициями]

Срок предоставления: {rfq.due_date}
Контактное лицо: {rfq.created_by.get_full_name()}

С уважением,
{legal_entity.name}
```

## Интеграции

### Email (SMTP)
- Django `send_mail()` с Excel-вложением
- Шаблон настраивается через Django templates

### Breez API (будущее)
- `SupplierIntegration` модель уже существует
- Нужен адаптер: `SupplierRFQItem` → Breez API запрос → ответ → `SupplierRFQResponseItem`

### OCR/LLM распознавание ответов
- Переиспользовать `supply.tasks.recognize_invoice` — уже умеет парсить счета
- Маппинг: распознанные позиции → `SupplierRFQItem` через fuzzy matching
