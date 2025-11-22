# День 9. Бизнес-логика и расчёты cash-flow

## 1. Реализация калькулятора cash-flow

Создан модуль `core/cashflow.py` с классом `CashFlowCalculator` для расчёта cash-flow.

### Основные методы:

#### `calculate_for_contract(contract_id, start_date=None, end_date=None)`
Рассчитывает cash-flow для конкретного договора за период.
- Возвращает: `{'income': Decimal, 'expense': Decimal, 'cash_flow': Decimal}`
- Cash-flow = поступления (income) - расходы (expense)

#### `calculate_for_object(object_id, start_date=None, end_date=None)`
Рассчитывает cash-flow для объекта (суммирует все договоры объекта) за период.
- Возвращает: `{'income': Decimal, 'expense': Decimal, 'cash_flow': Decimal}`

#### `calculate_for_all_objects(start_date=None, end_date=None)`
Рассчитывает cash-flow для всей компании (все объекты) за период.
- Возвращает: `{'income': Decimal, 'expense': Decimal, 'cash_flow': Decimal}`

#### `calculate_by_periods(object_id=None, contract_id=None, period_type='month', start_date=None, end_date=None)`
Рассчитывает cash-flow с разбивкой по периодам.
- `period_type`: 'month', 'week' или 'day'
- Возвращает: `List[Dict]` с данными по каждому периоду
- Каждый элемент содержит: `period`, `income`, `expense`, `cash_flow`, `count`

## 2. Методы в моделях

Добавлены удобные методы в модели `Object` и `Contract`:

### Object
- `get_cash_flow(start_date=None, end_date=None)` — расчёт cash-flow для объекта
- `get_cash_flow_by_periods(period_type='month', start_date=None, end_date=None)` — расчёт по периодам

### Contract
- `get_cash_flow(start_date=None, end_date=None)` — расчёт cash-flow для договора
- `get_cash_flow_by_periods(period_type='month', start_date=None, end_date=None)` — расчёт по периодам

## 3. Особенности реализации

### Использование Decimal
Все расчёты выполняются с использованием `Decimal` для точности финансовых вычислений.

### Оптимизация запросов
- Использование `Coalesce` для обработки NULL значений
- Агрегация на уровне БД через `Sum()`
- Фильтрация по типам платежей через `Q()` объекты

### Группировка по периодам
Использование Django ORM функций:
- `TruncMonth` — группировка по месяцам
- `TruncWeek` — группировка по неделям
- `TruncDay` — группировка по дням

## 4. Тесты

Добавлены comprehensive тесты в `core/tests_cashflow.py`:
- Тесты расчёта для договора (с периодом и без)
- Тесты расчёта для объекта
- Тесты расчёта для всех объектов
- Тесты группировки по периодам (месяц, неделя, день)
- Тесты граничных случаев (пустой договор)
- Тесты методов в моделях

Всего 12 новых тестов для бизнес-логики cash-flow. Общее количество тестов в проекте: 50 (все проходят успешно).

## 5. Примеры использования

### Расчёт cash-flow для договора
```python
contract = Contract.objects.get(id=1)
result = contract.get_cash_flow()
# {'income': Decimal('800000.00'), 'expense': Decimal('200000.00'), 'cash_flow': Decimal('600000.00')}
```

### Расчёт cash-flow за период
```python
from datetime import date, timedelta
start_date = date.today() - timedelta(days=30)
end_date = date.today()
result = contract.get_cash_flow(start_date=start_date, end_date=end_date)
```

### Расчёт cash-flow по месяцам
```python
periods = contract.get_cash_flow_by_periods(period_type='month')
# [{'period': datetime.date(2024, 1, 1), 'income': Decimal('500000'), ...}, ...]
```

## 6. Следующие шаги

- Создать REST API endpoints для доступа к cash-flow данным (Дни 19-21)
- Добавить кэширование для часто запрашиваемых расчётов
- Реализовать экспорт отчётов cash-flow в Excel/PDF

