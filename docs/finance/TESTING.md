# Тестирование финансового модуля

**Файл тестов**: `backend/payments/tests/test_journal_entries.py`
**Обновлено**: Февраль 2026

---

## Запуск тестов

```bash
cd backend

# Все тесты финансового модуля
pytest payments/tests/test_journal_entries.py -v

# С покрытием
pytest payments/tests/test_journal_entries.py --cov=payments --cov-report=term-missing -v

# Конкретный класс
pytest payments/tests/test_journal_entries.py::TestJournalServiceExpensePostings -v

# Конкретный тест
pytest payments/tests/test_journal_entries.py::TestJournalServiceCheckBalance::test_check_balance_after_funding -v
```

---

## Структура тестов

### Fixtures

| Fixture | Модель | Описание |
|---------|--------|----------|
| `tax_system` | TaxSystem | ОСН, активная |
| `legal_entity` | LegalEntity | Тестовое юр. лицо |
| `bank_account` | Account | Расчётный счёт |
| `user` | User | Тестовый пользователь |
| `system_accounts` | ExpenseCategory ×3 | profit, working_capital, vat |
| `expense_category` | ExpenseCategory | Категория «Аренда» (type=expense) |
| `obj` | Object | Тестовый объект (status=in_progress) |
| `contract` | Contract | Тестовый договор (status=planned) |

---

## Тест-кейсы (18 тестов)

### TestExpenseCategoryAccountType (5 тестов)

| Тест | Описание |
|------|----------|
| `test_system_account_created` | Проверяет создание системных счетов (profit, working_capital, vat) |
| `test_object_account_auto_created` | Signal post_save Object → ExpenseCategory(type=object) |
| `test_contract_account_auto_created` | Signal post_save Contract → ExpenseCategory(type=contract, parent=obj) |
| `test_balance_calculation` | Одна проводка → баланс кредитного +100k, дебетного -100k |
| `test_balance_multiple_entries` | Две встречные проводки → корректное сальдо |

### TestJournalEntryModel (2 теста)

| Тест | Описание |
|------|----------|
| `test_create_journal_entry` | Создание проводки, проверка pk и __str__ |
| `test_validation_same_account` | Валидация: from_account == to_account → ValidationError |

### TestJournalServiceManualPosting (2 теста)

| Тест | Описание |
|------|----------|
| `test_create_manual_posting` | Ручная проводка: is_auto=False, amount корректна |
| `test_manual_posting_same_account_raises` | Одинаковые счета → ValueError |

### TestJournalServiceCheckBalance (2 теста)

| Тест | Описание |
|------|----------|
| `test_check_balance_insufficient` | Пустой объект → sufficient=False, deficit=amount |
| `test_check_balance_after_funding` | После пополнения → sufficient=True, balance=200k |

### TestJournalServiceExpensePostings (2 теста)

| Тест | Описание |
|------|----------|
| `test_household_posting` | Invoice(type=household) → проводка Прибыль→Категория |
| `test_supplier_posting_with_object` | Invoice(type=supplier, object) → проводка Объект→Категория |

### TestJournalServiceIncomePostings (1 тест)

| Тест | Описание |
|------|----------|
| `test_customer_income_posting` | IncomeRecord(type=customer_act) → проводка Категория→Объект |

### TestJournalEntryAPI (4 теста)

| Тест | Описание |
|------|----------|
| `test_list_journal_entries` | GET /journal-entries/ → 200, results ≥ 1 |
| `test_manual_posting_endpoint` | POST /journal-entries/manual/ → 201, amount=50000 |
| `test_check_balance_endpoint` | GET /invoices/check_balance/ → 200, sufficient=False |
| `test_expense_category_balance_endpoint` | GET /expense-categories/{id}/balance/ → 200, balance |

---

## Аутентификация в тестах

```python
@pytest.fixture
def auth_client(self, user):
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken
    client = APIClient()
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
    return client
```

---

## Покрытие

### Что покрыто

| Компонент | Покрытие |
|-----------|----------|
| `ExpenseCategory` (модель) | Типы счетов, баланс, auto-create через signals |
| `JournalEntry` (модель) | Создание, валидация |
| `JournalService` | Manual posting, check balance, expense postings, income postings |
| API endpoints | journal-entries (list, manual), check_balance, category balance |

### Что НЕ покрыто (на текущем этапе)

| Компонент | Описание |
|-----------|----------|
| InvoiceService workflow | submit_to_registry, approve, reject, reschedule |
| LLM-распознавание | recognize() → DocumentParser |
| BankPaymentOrder создание | _create_bank_payment_order |
| RecurringPayment генерация | generate_recurring, _calculate_next_date |
| Frontend-компоненты | React-тесты не реализованы |

---

## Зависимости тестов

```
pytest
pytest-django
pytest-cov
rest_framework_simplejwt (для JWT-токенов в API-тестах)
```

Конфигурация: `backend/pytest.ini` или `setup.cfg`.

---

## Результат последнего запуска

```
backend/payments/tests/test_journal_entries.py::TestExpenseCategoryAccountType::test_system_account_created PASSED
backend/payments/tests/test_journal_entries.py::TestExpenseCategoryAccountType::test_object_account_auto_created PASSED
backend/payments/tests/test_journal_entries.py::TestExpenseCategoryAccountType::test_contract_account_auto_created PASSED
backend/payments/tests/test_journal_entries.py::TestExpenseCategoryAccountType::test_balance_calculation PASSED
backend/payments/tests/test_journal_entries.py::TestExpenseCategoryAccountType::test_balance_multiple_entries PASSED
backend/payments/tests/test_journal_entries.py::TestJournalEntryModel::test_create_journal_entry PASSED
backend/payments/tests/test_journal_entries.py::TestJournalEntryModel::test_validation_same_account PASSED
backend/payments/tests/test_journal_entries.py::TestJournalServiceManualPosting::test_create_manual_posting PASSED
backend/payments/tests/test_journal_entries.py::TestJournalServiceManualPosting::test_manual_posting_same_account_raises PASSED
backend/payments/tests/test_journal_entries.py::TestJournalServiceCheckBalance::test_check_balance_insufficient PASSED
backend/payments/tests/test_journal_entries.py::TestJournalServiceCheckBalance::test_check_balance_after_funding PASSED
backend/payments/tests/test_journal_entries.py::TestJournalServiceExpensePostings::test_household_posting PASSED
backend/payments/tests/test_journal_entries.py::TestJournalServiceExpensePostings::test_supplier_posting_with_object PASSED
backend/payments/tests/test_journal_entries.py::TestJournalServiceIncomePostings::test_customer_income_posting PASSED
backend/payments/tests/test_journal_entries.py::TestJournalEntryAPI::test_list_journal_entries PASSED
backend/payments/tests/test_journal_entries.py::TestJournalEntryAPI::test_manual_posting_endpoint PASSED
backend/payments/tests/test_journal_entries.py::TestJournalEntryAPI::test_check_balance_endpoint PASSED
backend/payments/tests/test_journal_entries.py::TestJournalEntryAPI::test_expense_category_balance_endpoint PASSED

18 passed
```
