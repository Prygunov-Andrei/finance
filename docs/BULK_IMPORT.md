# Массовый импорт счетов — архитектура

## Обзор

`InvoiceService.recognize()` — единственная точка обработки для всех сценариев:
- Одиночная загрузка через UI
- Массовая загрузка через UI (bulk-upload)
- Management command (`import_invoices_full`)
- Bitrix24 webhook (`process_bitrix_deal` → `recognize_invoice`)

## Статусный workflow

```
RECOGNITION → REVIEW → VERIFIED → [IN_REGISTRY → APPROVED → SENDING → PAID]
                                                              ↓ CANCELLED
```

| Статус | Описание |
|--------|----------|
| `recognition` | LLM обрабатывает файл |
| `review` | Оператор проверяет/исправляет данные |
| `verified` | Данные подтверждены, товары в каталоге. Счёт доступен для сравнения |
| `in_registry` | Отправлен на оплату (очередь директора) |
| `approved` | Директор подтвердил |
| `sending` | Отправляется в банк |
| `paid` | Оплачен |
| `cancelled` | Отменён на любом этапе |

**Важно:** VERIFIED → IN_REGISTRY — опциональный шаг. Не все счета идут на оплату (например, справочные счета сметчика для сравнения цен).

## Поток данных

```
1. Файл сохраняется в Invoice.invoice_file
2. Celery task recognize_invoice(invoice_id) запускается
3. InvoiceService.recognize():
   a) _parse_invoice_file()      → PDF/Excel/Image → ParsedInvoice
   b) _save_parsed_document()    → ParsedDocument (SHA256 file_hash)
   c) _populate_invoice_fields() → номер, дата, суммы
   d) _match_or_create_counterparty() → поиск/создание по ИНН
   e) _check_business_duplicate()    → номер + сумма + ИНН
   f) _create_invoice_items()    → InvoiceItem (product=None, raw_name сохраняется)
4. Invoice.status = REVIEW
5. Оператор проверяет данные → InvoiceService.verify():
   a) Валидация (контрагент обязателен, сумма обязательна)
   b) _create_products_from_items() → Product + ProductPriceHistory
   c) LLM batch-категоризация новых товаров
   d) Invoice.status = VERIFIED
6. [опционально] InvoiceService.submit_to_registry():
   Invoice.status = IN_REGISTRY (только VERIFIED → IN_REGISTRY)
```

**Ключевое изменение:** Товары создаются в каталоге только на шаге 5 (verify), а не при распознавании. Это исключает попадание ошибок OCR в каталог.

## Ключевые сервисы

| Сервис | Файл | Назначение |
|--------|------|-----------|
| InvoiceService | `payments/services.py` | Единый pipeline обработки |
| DocumentParser | `llm_services/services/document_parser.py` | PDF/Image → LLM Vision → ParsedInvoice |
| ExcelInvoiceParser | `llm_services/services/excel_parser.py` | Excel → текст → LLM → ParsedInvoice |
| ProductMatcher | `catalog/services.py` | Поиск/создание товаров (fuzzy + LLM) |
| ProductCategorizer | `catalog/categorizer.py` | LLM batch-категоризация |

## Модели

| Модель | Назначение |
|--------|-----------|
| `BulkImportSession` | Сессия массового импорта (прогресс, ошибки) |
| `Invoice.bulk_session` FK | Привязка счёта к сессии |
| `Invoice.Source.BULK_IMPORT` | Метка источника |

## Дедупликация

Два уровня:
1. **Файловый** — `ParsedDocument.file_hash` (SHA256). Одинаковый файл не парсится повторно.
2. **Бизнес-уровень** — после парсинга: `invoice_number` + `amount_gross` + ИНН контрагента. При обнаружении дубликата Invoice создаётся в REVIEW с предупреждением, Items НЕ создаются.

## API endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/v1/invoices/bulk-upload/` | Загрузка файлов → BulkImportSession |
| GET | `/api/v1/invoices/bulk-sessions/{id}/` | Статус сессии (поллинг) |
| POST | `/api/v1/invoices/{id}/verify/` | Подтвердить данные → VERIFIED |
| POST | `/api/v1/invoices/{id}/submit_to_registry/` | Отправить в реестр → IN_REGISTRY |

## Management commands

### import_invoices_full (базовый)

```bash
python manage.py import_invoices_full ./invoices [--dry-run] [--limit N] [--no-auto-counterparty]
```

Рекурсивный обход → recognize() для каждого файла. Счета остаются в REVIEW.

### import_invoices_bulk (полный цикл)

Расширенная команда для разовой массовой загрузки исторических счетов.
4-фазный pipeline: Discovery → Recognize → Auto-verify → FNS-обогащение.

```bash
# Посмотреть что будет обработано (без изменений в БД)
python manage.py import_invoices_bulk ./СЧЕТА --dry-run

# Тест на 5 файлах с полным циклом
python manage.py import_invoices_bulk ./СЧЕТА --limit 5 --verify-inline

# Полный запуск
python manage.py import_invoices_bulk ./СЧЕТА --verify-inline

# Продолжить после сбоя
python manage.py import_invoices_bulk ./СЧЕТА --verify-inline --resume _bulk_import_manifest.json

# Без FNS-обогащения
python manage.py import_invoices_bulk ./СЧЕТА --verify-inline --skip-fns
```

#### Аргументы

| Аргумент | Описание |
|----------|----------|
| `directory` | Путь к папке с файлами |
| `--dry-run` | Только показать файлы и статистику |
| `--limit N` | Обработать первые N файлов |
| `--offset N` | Пропустить первые N файлов |
| `--verify-inline` | Верифицировать сразу после recognize |
| `--skip-verify` | Пропустить auto-verify |
| `--skip-fns` | Пропустить FNS-обогащение |
| `--resume PATH` | Продолжить с manifest JSON |

#### 4 фазы

**Фаза 1: Discovery + фильтрация**
- Рекурсивный поиск файлов: `.pdf`, `.xlsx`, `.xls`, `.png`, `.jpg`, `.jpeg`
- Исключение папок: `Сметы`, `Письма контрагентам`, `Учредительные документы`
- Исключение по имени: Акт, КС, чек, Смета, Договор, Письмо, Накладная, УПД, ТОРГ

**Фаза 2: Recognize**
- `InvoiceService.recognize()` — стандартный pipeline
- Post-recognize фильтрация: если нет номера/суммы/позиций или confidence < 0.3 → CANCELLED
- Rate limit: exponential backoff (60с → 300с)
- Manifest JSON для resumability

**Фаза 3: Auto-verify**
- `InvoiceService.auto_verify()` — создаёт Product + ProductPriceHistory + категоризацию
- Статус → PAID с `paid_at = invoice_date` (исторические счета)
- Без контрагента или суммы → остаётся в REVIEW

**Фаза 4: FNS-обогащение**
- `FNSClient.get_egr()` по ИНН → обновление name, kpp, ogrn, address, legal_form
- Задержка 0.5с между запросами

#### auto_verify()

Метод `InvoiceService.auto_verify(invoice_id)` в `payments/services.py`:
- Проверяет наличие контрагента и суммы
- Вызывает `_create_products_from_items()` (Product + ProductPriceHistory + категоризация)
- Переводит в PAID с `paid_at = invoice_date`
- Два InvoiceEvent: REVIEWED + PAID с пометкой «массовый импорт»

#### Manifest JSON

Создаётся автоматически (`_bulk_import_manifest.json`). Формат:

```json
{
  "directory": "/path/to/СЧЕТА",
  "started_at": "2026-03-15T10:00:00+03:00",
  "completed_at": "2026-03-16T01:30:00+03:00",
  "files": {
    "/full/path/to/file.pdf": {
      "status": "paid",
      "invoice_id": 123,
      "counterparty_inn": "7707083893"
    }
  }
}
```

Статусы в manifest: `paid`, `verified`, `review`, `skipped_not_invoice`, `failed`.

#### FAQ

**Q: Rate limit — что делать?**
A: Команда автоматически делает паузу и повторяет. При повторном rate limit — пропускает файл. Используйте `--resume` для продолжения.

**Q: Как продолжить после Ctrl+C?**
A: `python manage.py import_invoices_bulk ./СЧЕТА --verify-inline --resume _bulk_import_manifest.json`

**Q: Как проверить результат?**
A: В Django shell:
```python
from payments.models import Invoice
Invoice.objects.filter(source='bulk_import').values('status').annotate(n=Count('id'))
```

## Тестирование

```bash
pytest payments/tests/test_bulk_import_models.py
pytest payments/tests/test_recognize_service.py
pytest payments/tests/test_bulk_upload_api.py
```
