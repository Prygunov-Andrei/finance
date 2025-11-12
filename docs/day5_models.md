# День 5. Моделирование объектов и договоров

## 1. Обновление модели Object
- Добавлено поле `address` (CharField, max_length=255, обязательное).
- Сгенерирована миграция `objects/migrations/0001_initial.py`.
- Документация обновлена (`docs/planning/models_planning.md`).

## 2. Реализация модели Contract
- Создано приложение `contracts`, добавлено в `INSTALLED_APPS`.
- Модель `Contract` содержит ключевые поля: `number`, `name`, `contract_date`, `contractor`, `total_amount`, `currency`, `vat_rate`, `status`, `document_link`, `notes`.
- Связь `Object (1) → Contract (N)` реализована через `ForeignKey` с `related_name='contracts'`.
- Ограничения: уникальность номера договора в пределах объекта, перечисления для статуса и валюты.
- Админка обновлена (`contracts/admin.py`) для управления договорами.
- Создана миграция `contracts/migrations/0001_initial.py`.

## 3. Тесты и контроль качества
- Добавлены unit-тесты в `contracts/tests.py` (создание договора, проверка уникальности номера, поддержка одинаковых номеров для разных объектов).
- Прогон `python3 manage.py test` проходит успешно.

## 4. Следующие шаги
- Подготовить фикстуры на основе шаблонов из `docs/sample_data/`.
- Перейти к моделям платежей и реестра (дальнейшие пункты плана).
