# Документация финансового модуля

Модуль **Finance** — центральный модуль управления финансами: внутренний план счетов, счета на оплату, проводки (двойная запись), входящие платежи, дашборд.

**Приложение Django**: `payments`
**Обновлено**: Февраль 2026

---

## Содержание

| Документ | Описание |
|----------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Архитектура — компоненты, диаграммы, потоки данных |
| [MODELS.md](./MODELS.md) | Модели данных — все модели, поля, связи, choices |
| [API.md](./API.md) | REST API — эндпоинты, форматы запросов/ответов |
| [JOURNAL_SERVICE.md](./JOURNAL_SERVICE.md) | Проводки — бизнес-логика двойной записи, JournalService |
| [FRONTEND.md](./FRONTEND.md) | Frontend — React-компоненты, маршруты, UI |
| [TESTING.md](./TESTING.md) | Тестирование — тесты, запуск, покрытие |

---

## Быстрый старт

```bash
# Backend
cd backend
python manage.py migrate
python manage.py runserver

# Frontend
cd frontend
npm run dev
```

---

## Ключевые концепции

### Внутренний план счетов (ExpenseCategory)

Единая модель для всех типов счетов:
- **expense** — категории расходов (аренда, зарплата, материалы)
- **income** — категории доходов
- **system** — системные счета (`profit`, `working_capital`, `vat`)
- **object** — виртуальные счета объектов (создаются автоматически)
- **contract** — субсчета договоров (создаются автоматически)

### Двойная запись (JournalEntry)

Каждое перемещение средств = проводка `from_account → to_account`:
- Автоматические: при оплате Invoice или поступлении IncomeRecord
- Ручные: через `POST /api/v1/journal-entries/manual/`
- Сальдо-контроль: проверка баланса объекта перед расходной проводкой

### Workflow счёта (Invoice)

```
RECOGNITION → REVIEW → IN_REGISTRY → APPROVED → SENDING → PAID
                                ↓
                           CANCELLED
```

### Типы счетов (Invoice.InvoiceType)

| Тип | Описание | Привязки |
|-----|----------|----------|
| `supplier` | От поставщика | Object, Contract, Counterparty |
| `act_based` | По акту выполненных работ | Object, Contract, Act |
| `household` | Хозяйственная деятельность | ExpenseCategory |
| `warehouse` | Закупка на склад | Counterparty |
| `internal_transfer` | Внутренний перевод | ExpenseCategory → ExpenseCategory |

---

## Структура файлов

```
backend/payments/
├── models.py              # Модели: ExpenseCategory, Invoice, IncomeRecord, JournalEntry, ...
├── services.py            # PaymentService, InvoiceService (workflow, LLM, BPO)
├── journal_service.py     # JournalService (проводки, двойная запись)
├── serializers.py         # DRF-сериализаторы
├── views.py               # ViewSets + actions
├── signals.py             # Auto-create accounts for Object/Contract
├── admin.py               # Django Admin
├── migrations/
│   ├── 0012_finance_internal_accounts_journal.py
│   └── 0013_create_system_accounts.py
└── tests/
    └── test_journal_entries.py

frontend/src/components/finance/
├── FinanceDashboard.tsx       # Дашборд с балансами
├── PaymentsTabPage.tsx        # Контейнер с 3 табами
├── InvoicesTab.tsx            # Список счетов + фильтры
├── InvoiceCreateDialog.tsx    # Создание счёта (5 типов)
├── PaymentRegistryTab.tsx     # Реестр оплат + workflow
└── IncomingPaymentsTab.tsx    # Входящие платежи + касса

frontend/public/help/
└── finance.md                 # Справка для пользователей
```

---

## Текущий статус

- ✅ Модели: ExpenseCategory (расширена), Invoice, IncomeRecord, JournalEntry
- ✅ Сервисы: JournalService, InvoiceService (полный workflow)
- ✅ API: 6 ViewSets, OpenAPI-документация
- ✅ Frontend: Дашборд, 3 таба платежей, диалог создания
- ✅ Тесты: 18 unit-тестов (модели, сервисы, API)
- ✅ Справка: `/help/finance.md` для пользователей
- ⬜ Автоматический импорт из банковской выписки (заглушка)
- ⬜ Стабы дашборда: ДЗ, КЗ, Прибыль, Отчёты, Налоги
