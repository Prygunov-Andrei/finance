# Recognition Service

Standalone FastAPI микросервис распознавания PDF-документов. Stateless, один запрос = upload → parse → result. Клиенты: Айсмета (спецификации, КП), ERP payments (счета).

- ADR: [ADR-0023](../ismeta/docs/adr/0023-recognition-as-standalone-service.md)
- API контракт: [ismeta/specs/15-recognition-api.md](../ismeta/specs/15-recognition-api.md)
- Порт: **8003**

## Структура

```
recognition/
  app/
    main.py              FastAPI + lifespan + middleware + error handlers
    config.py            pydantic-settings
    auth.py              X-API-Key dependency
    logging_setup.py     JSON logger + request_id contextvars
    middleware.py        request_id + access log
    api/
      parse.py           POST /v1/parse/{spec,invoice,quote} + shared validation
      health.py          GET  /v1/healthz
      errors.py          RecognitionError иерархия + handlers (§5)
    providers/
      base.py            BaseLLMProvider (async)
      openai_vision.py   gpt-4o-mini Vision с retry 429/5xx
    schemas/
      spec.py            SpecItem / PagesStats / SpecParseResponse (§1)
      invoice.py         InvoiceItem / SupplierInfo / InvoiceMeta / InvoiceParseResponse (§2)
      quote.py           QuoteItem / QuoteSupplier / QuoteMeta / QuoteParseResponse (§3)
    services/
      _common.py         vision_json (retry+JSON), determine_status, dedupe_by_key
      spec_parser.py     async spec parser: classify → extract → dedup
      invoice_parser.py  async invoice parser: classify → header + items → dedup
      quote_parser.py    async quote parser (КП): + lead_time, warranty, valid_until
      pdf_render.py      PyMuPDF page → base64 PNG
  tests/                 pytest (35 tests, ≥85% coverage на app/)
  Dockerfile
  openapi.yaml           экспорт из FastAPI (регенерируем при изменении API)
  requirements.txt
  .env.example
```

## Запуск локально

### Через docker compose (из корня монорепо)

```bash
docker compose up -d recognition
curl http://localhost:8003/v1/healthz
# {"status":"ok","version":"0.1.0","provider":"openai-gpt-4o-mini"}
```

Обязательные env (см. `.env.example`):
- `RECOGNITION_API_KEY` — shared secret для `X-API-Key`
- `OPENAI_API_KEY` — ключ OpenAI для Vision API

### Без docker (dev)

```bash
cd recognition
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env  # и правим ключи
PYTHONPATH=. .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8003
```

## Примеры вызова

### Health

```bash
curl -s http://localhost:8003/v1/healthz | jq
```

### Предварительная проверка PDF — `/v1/probe`

Быстрая (≤10с) инспекция PDF без вызова LLM — для frontend progress bar и выбора
стратегии показа пользователю.

```bash
curl -s -X POST http://localhost:8003/v1/probe \
  -H "X-API-Key: $RECOGNITION_API_KEY" \
  -F "file=@/path/to/spec.pdf" | jq
```

Ответ:

```json
{
  "pages_total": 9,
  "text_layer_pages": 9,
  "has_text_layer": true,
  "text_chars_total": 12994,
  "estimated_seconds": 3
}
```

- `text_layer_pages` — сколько страниц проходят per-page порог
  (50 символов, константа `TEXT_LAYER_MIN_CHARS_PER_PAGE` в `pdf_text.py`).
- `has_text_layer = true` — **все** страницы пригодны для text-layer пути,
  парсер идёт по быстрому hybrid-пути (~0.1s/page). Симметрично per-page
  решению в `SpecParser` — исключает UX-регрессию «probe=true, но Spec уходит
  в Vision на части страниц».
- `has_text_layer = false` + `text_layer_pages < pages_total` — mixed PDF
  (частично сканирован). `estimated_seconds` смешан: `2 + 0.1 × text_pages +
  5 × vision_pages`.

Таймаут `/probe` = 10с — гигантские PDF отрубаются с `422 parse_failed`.

### Парсинг спецификации — §1

```bash
curl -s -X POST http://localhost:8003/v1/parse/spec \
  -H "X-API-Key: $RECOGNITION_API_KEY" \
  -F "file=@/path/to/spec.pdf" | jq
```

Ответ: `{status, items[], errors[], pages_stats}`. `items[].tech_specs` — строка.

**Hybrid path (E15.03):** парсер проверяет `page.get_text()` — если у страницы
есть usable text layer (≥100 символов), извлечение идёт по эвристикам без вызова
LLM (см. `app/services/pdf_text.py`). На нативно-экспортированных PDF-спецификациях
это даёт recall ≈95% за ~0.1s/страницу вместо ~5s/стр через Vision. Страницы без
text layer (сканы, фото) идут Vision fallback по прежней логике (classify → extract).

### Парсинг счёта поставщика — §2

```bash
curl -s -X POST http://localhost:8003/v1/parse/invoice \
  -H "X-API-Key: $RECOGNITION_API_KEY" \
  -F "file=@/path/to/invoice.pdf" | jq
```

Ответ: `{status, items[], supplier, invoice_meta, errors[], pages_stats}`.
- `supplier`: `{name, inn, kpp, bank_account, bik, correspondent_account}`.
- `invoice_meta`: `{number, date, total_amount, vat_amount, currency}`.
- `items[]` дополнительно содержит `price_unit, price_total, currency, vat_rate`.

### Парсинг КП — §3

```bash
curl -s -X POST http://localhost:8003/v1/parse/quote \
  -H "X-API-Key: $RECOGNITION_API_KEY" \
  -F "file=@/path/to/quote.pdf" | jq
```

Ответ: `{status, items[], supplier, quote_meta, errors[], pages_stats}`.
- `supplier`: `{name, inn}` (ИНН опционален).
- `quote_meta`: `{number, date, valid_until, currency, total_amount}`.
- `items[]` дополнительно содержит `price_unit, price_total, currency, tech_specs, lead_time_days, warranty_months`.

### Ошибки (см. §5 контракта)

| Код | Когда | Пример тела |
|---|---|---|
| 400 | пустой файл / отсутствует поле `file` | `{"error":"invalid_file","detail":"empty file"}` |
| 401 | нет/неверный `X-API-Key` | `{"error":"invalid_api_key"}` |
| 413 | файл > `MAX_FILE_SIZE_MB` | `{"error":"file_too_large","limit_mb":50}` |
| 415 | не PDF | `{"error":"unsupported_media_type","detail":"..."}` |
| 422 | LLM не вернул валидный JSON | `{"error":"parse_failed","detail":"..."}` |
| 500 | непредвиденное | `{"error":"internal_error","detail":"..."}` |
| 502 | OpenAI 429/5xx после 3 попыток | `{"error":"llm_unavailable","retry_after_sec":30}` |

Таймаут 300с — при превышении возвращается 200 со `status="partial"` и частичным результатом.

## Тесты

```bash
cd recognition
PYTHONPATH=. .venv/bin/python -m pytest -q                          # обычный прогон, golden пропускаются
PYTHONPATH=. .venv/bin/python -m pytest -m golden -v                # только golden-тесты на реальных PDF
PYTHONPATH=. .venv/bin/python -m pytest --cov=app --cov-report=term-missing
.venv/bin/python -m mypy app/ --disallow-untyped-defs
.venv/bin/python -m ruff check .
```

Ожидания: pytest 73 passed, coverage ≥ 80%, mypy/ruff clean. Golden suite (2
теста) идёт по реальной ОВ2-спецификации из `ismeta/tests/fixtures/golden/` —
recall ≥ 85%, Vision не вызывается.

## Логи

Формат — JSON в stdout (см. `app/logging_setup.py`), поля: `level, ts, msg, logger, request_id, ...` (страницы, items_count, status и пр.). `X-Request-ID` прокидывается в ответ.

## Регенерация OpenAPI

При изменении API вызвать:

```bash
cd recognition
PYTHONPATH=. .venv/bin/python -c "
import yaml; from app.main import app
yaml.safe_dump(app.openapi(), open('openapi.yaml','w'), sort_keys=False, allow_unicode=True)
"
```

## Как подключить клиента (E15.02b)

В монорепо есть два готовых клиента — асинхронный для ISMeta и синхронный для ERP.

### ISMeta (async, Django 5)

```python
# ismeta/backend/apps/integration/recognition_client.py
from apps.integration.recognition_client import RecognitionClient, RecognitionClientError

client = RecognitionClient()  # base_url + api_key из settings
try:
    data = await client.parse_spec(pdf_bytes, "spec.pdf")
    data = await client.parse_invoice(pdf_bytes, "invoice.pdf")
    data = await client.parse_quote(pdf_bytes, "kp.pdf")
except RecognitionClientError as e:
    # e.code: invalid_api_key | file_too_large | parse_failed | llm_unavailable | ...
    # e.detail: строка от сервиса
    # e.status_code: HTTP код (None для network errors)
    # e.extra: {"retry_after_sec": 30, "limit_mb": 50, ...}
    logger.warning("recognition failed: %s %s", e.code, e.detail)
```

Env для ISMeta (см. `ismeta/backend/.env.example`):
- `RECOGNITION_URL` (default `http://recognition:8003`)
- `RECOGNITION_API_KEY` (shared secret, совпадает с env в recognition/)

### ERP payments (sync)

```python
# backend/payments/services/recognition_client.py
from payments.services.recognition_client import (
    RecognitionClient,
    RecognitionClientError,
    response_to_parsed_invoice,
)

client = RecognitionClient()
response = client.parse_invoice(pdf_bytes, filename)  # sync, httpx.Client
parsed_invoice = response_to_parsed_invoice(response)  # legacy ParsedInvoice
```

`response_to_parsed_invoice` — адаптер под существующий контракт `llm_services.schemas.ParsedInvoice` (vendor/buyer/invoice/totals/items/confidence). Обязательные поля (номер, дата, поставщик) отсутствуют → `ValueError` — оператор доделывает вручную в REVIEW.

Env для ERP (см. `backend/.env.example`, `backend/finans_assistant/settings.py`):
- `RECOGNITION_URL`, `RECOGNITION_API_KEY` — те же переменные.

### Docker-compose

Корневой `docker-compose.yml`: сервис `recognition` на 8003 c healthcheck, `backend` (ERP) имеет `depends_on: recognition (service_healthy)`. `ismeta/docker-compose.yml`: тот же service name `recognition`, `ismeta-backend` depends_on.

## Что НЕ в этом сервисе

- Persistence / cache / sessions — сервис stateless.
- Прямых вызовов в ERP/Айсмету нет — recognition изолирован.
- Конвертация PNG/JPG → PDF (для ERP invoice images) — отдельная задача, пока
  изображения идут через legacy `llm_services.DocumentParser`.
