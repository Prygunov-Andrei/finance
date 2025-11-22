# День 8. Сериализаторы DRF для всех моделей

## 1. Создание сериализаторов

Созданы сериализаторы для всех моделей проекта:

### Object (objects/serializers.py)
- `ObjectSerializer` — полный сериализатор для объекта
- `ObjectListSerializer` — упрощённый сериализатор для списка объектов

### Contract (contracts/serializers.py)
- `ContractSerializer` — полный сериализатор для договора
  - Включает `object_name` (read-only) для удобства
  - `object_id` для связи с объектом при создании
- `ContractListSerializer` — упрощённый сериализатор для списка договоров

### Payment (payments/serializers.py)
- `PaymentSerializer` — полный сериализатор для платежа
  - Включает информацию о договоре (`contract_number`, `contract_name`)
  - `payment_type_display` для отображения типа платежа
- `PaymentListSerializer` — упрощённый сериализатор для списка платежей

### PaymentRegistry (payments/serializers.py)
- `PaymentRegistrySerializer` — полный сериализатор для планового платежа
  - Включает информацию о договоре
  - `status_display` для отображения статуса
- `PaymentRegistryListSerializer` — упрощённый сериализатор для списка

### ImportLog (imports/serializers.py)
- `ImportLogSerializer` — полный сериализатор для журнала импорта
  - Включает `user_username` для отображения пользователя
  - `status_display` и `file_type_display` для удобства
  - `success_rate` (read-only property) для отображения процента успеха
- `ImportLogListSerializer` — упрощённый сериализатор для списка импортов

## 2. Особенности реализации

### Read-only поля
Все сериализаторы включают read-only поля:
- `id` — идентификатор записи
- `created_at`, `updated_at` — временные метки
- Дополнительные вычисляемые поля (display значения, связанные объекты)

### Связанные объекты
Сериализаторы автоматически включают информацию о связанных объектах:
- Contract → Object (object_name)
- Payment → Contract (contract_number, contract_name)
- PaymentRegistry → Contract (contract_number, contract_name)
- ImportLog → User (user_username)

### Валидация
Сериализаторы используют стандартную валидацию Django REST Framework:
- Проверка обязательных полей
- Валидация типов данных
- Проверка связей (ForeignKey)

## 3. Тесты

Добавлены unit-тесты для сериализаторов:
- `objects/tests_serializers.py` — тесты для ObjectSerializer
- `contracts/tests_serializers.py` — тесты для ContractSerializer

Всего 6 новых тестов для сериализаторов. Общее количество тестов в проекте: 38 (все проходят успешно).

## 4. Следующие шаги

- Создать REST API endpoints (ViewSets) для всех моделей (Дни 19-21)
- Добавить фильтрацию и сортировку
- Настроить пагинацию
- Добавить бизнес-логику расчёта cash-flow (Дни 16-18)

