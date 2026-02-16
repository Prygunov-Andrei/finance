# Коммерческий пайплайн (commercial_pipeline)

> Документация по единому Kanban-борду для Маркетинга и Коммерческих предложений.

## Архитектура

### Один борд — два view

Вместо двух отдельных канбан-досок используется **один** board `commercial_pipeline` с 12 колонками. Фронтенд показывает разные подмножества колонок через prop `visibleColumnKeys` компонента `KanbanBoardPage`.

```
commercial_pipeline (Board)
├── Маркетинг view (6 колонок)
│   ├── Новые клиенты
│   ├── Назначена встреча
│   ├── Проведена встреча
│   ├── Расчет подготовлен  ← возврат из КП
│   ├── Нет результата
│   └── Есть результат
│
└── КП view (6 колонок)
    ├── Новый расчет  ← приход из Маркетинга
    ├── В работе
    ├── Счета запрошены
    ├── Утверждение сметы
    ├── Смета утверждена
    └── Подготовлено КП
```

### Механизм «тоннеля»

Карточка перемещается между view через общие колонки board:

1. **Маркетинг → КП**: Оператор маркетинга переводит карточку в колонку «Объект передан на расчет» (key: `new_calculation`). Карточка пропадает из Маркетинг view и появляется в КП view (колонка «Новый расчет»).

2. **КП → Маркетинг**: Оператор КП переводит карточку в колонку «Расчет подготовлен» (key: `calculation_done`). Карточка пропадает из КП view и появляется в Маркетинг view.

Технически: dropdown перемещения карточки показывает **все** 12 колонок board, включая невидимые в текущем view.

## Колонки board

| # | key                | title              | order |
|---|--------------------|--------------------|-------|
| 1 | new_clients        | Новые клиенты      | 1     |
| 2 | meeting_scheduled  | Назначена встреча   | 2     |
| 3 | meeting_done       | Проведена встреча   | 3     |
| 4 | new_calculation    | Новый расчет        | 4     |
| 5 | in_progress        | В работе            | 5     |
| 6 | invoices_requested | Счета запрошены     | 6     |
| 7 | estimate_approval  | Утверждение сметы   | 7     |
| 8 | estimate_approved  | Смета утверждена    | 8     |
| 9 | kp_prepared        | Подготовлено КП     | 9     |
|10 | calculation_done   | Расчет подготовлен  | 10    |
|11 | no_result          | Нет результата      | 11    |
|12 | has_result         | Есть результат      | 12    |

## Backend

### Kanban микросервис (порт 8010)

- **kanban_core**: ядро (Board, Column, Card)
- **kanban_commercial**: оверлей с моделью `CommercialCase`

### CommercialCase модель

```python
class CommercialCase(models.Model):
    card = OneToOneField('kanban_core.Card')
    object_name = CharField(max_length=255)
    system_name = CharField(max_length=255, blank=True)
    counterparty_name = CharField(max_length=255, blank=True)
    linked_tkp_ids = JSONField(default=list)
    contacts = JSONField(default=dict)
    comments = TextField(blank=True)
```

### Инициализация board

```bash
python manage.py init_commercial_board
```

Создаёт board `commercial_pipeline` и 12 колонок.

### API Endpoints (kanban_service)

| Endpoint | Методы | Описание |
|----------|--------|----------|
| `/api/v1/commercial/cases/` | CRUD | Коммерческие кейсы |
| `/api/v1/boards/?key=commercial_pipeline` | GET | Получить board |
| `/api/v1/columns/?board_id={id}` | GET | Получить колонки |
| `/api/v1/cards/?board_id={id}&type=commercial_case` | GET | Получить карточки |
| `/api/v1/cards/{id}/move/` | POST | Переместить карточку |

## Frontend

### Роутинг

| Путь | Компонент | Описание |
|------|-----------|----------|
| `/commercial/kanban` | `KanbanBoardPage` | КП view (6 колонок) |
| `/marketing/objects` | `KanbanBoardPage` | Маркетинг view (6 колонок) |

### Props

```tsx
// КП view
<KanbanBoardPage
  boardKey="commercial_pipeline"
  pageTitle="Канбан КП"
  cardType="commercial_case"
  visibleColumnKeys={['new_calculation', 'in_progress', 'invoices_requested', 'estimate_approval', 'estimate_approved', 'kp_prepared']}
/>

// Маркетинг view
<KanbanBoardPage
  boardKey="commercial_pipeline"
  pageTitle="Канбан поиска объектов"
  cardType="commercial_case"
  visibleColumnKeys={['new_clients', 'meeting_scheduled', 'meeting_done', 'calculation_done', 'no_result', 'has_result']}
/>
```

## Тесты

### Backend
- `kanban_commercial/tests/test_models.py` — модель CommercialCase
- `kanban_commercial/tests/test_api.py` — CRUD API

### Frontend
- `__tests__/commercial-kanban.test.tsx` — visibleColumnKeys фильтрация, рендеринг колонок
