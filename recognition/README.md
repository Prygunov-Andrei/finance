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
      spec_parser.py     async spec parser: classify → extract (без dedup, E15.03-hotfix)
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

**Дедупликация:** отключена с E15.03-hotfix. Позиции возвращаются 1:1 как в PDF
(включая одинаковые `(name, model, brand)` из разных секций). Бизнес-правило —
смета = точная копия PDF; суммирование quantity между секциями меняет смысл
позиции. Если в будущем понадобится опциональный dedup — делать на UI-уровне с
явным UX (подсветка конфликта) и `section_name` в ключе.

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
PYTHONPATH=. .venv/bin/python -m pytest -q                          # обычный прогон, golden/golden_llm пропускаются
PYTHONPATH=. .venv/bin/python -m pytest -m golden -v                # legacy text-layer baseline (без LLM)
PYTHONPATH=. .venv/bin/python -m pytest -m golden_llm -v            # E15.04: column-aware + gpt-4o-mini (требует OPENAI_API_KEY)
PYTHONPATH=. .venv/bin/python -m pytest --cov=app --cov-report=term-missing
.venv/bin/python -m mypy app/ --disallow-untyped-defs
.venv/bin/python -m ruff check .
```

Ожидания: pytest 100+ passed, coverage ≥ 80%, mypy/ruff clean. Golden suite
включает два fixture'а (`ismeta/tests/fixtures/golden/`) — оба запускаются
при `pytest -m golden_llm` и проверяются в каждом релизе:

- **spec-ov2-152items.pdf** (ОВ2, 9 стр, ≈152 позиции) — основной recall
  baseline.
  - `golden` — legacy text-layer recall ≥ 138 items, Vision не вызывается;
  - `golden_llm` — E15.04+E15.05 column-aware recall ≥ 140 items, ≥ 6
    секций, time ≤ 45s.
- **spec-aov.pdf** (ЭОМ/автоматика, 2 стр, 29 позиций) — второй golden
  после QA-сессии 3 (2026-04-22).
  - `golden_llm` — все 29 позиций, ≥ 4 секций из 5, префикс «N.» очищен,
    штамп «Взаим.инв.» отфильтрован, column shift проверен на 10
    «Комплект автоматизации» (R19).

Dual-regression обязательна: оба теста должны проходить после любого
редактирования `spec_normalizer.py` / `pdf_text.py`.

## Pipeline: гибрид bbox + conditional multimodal (E15.05 it2)

SpecParser обрабатывает страницу в три уровня + conditional retry:

1. **Column-aware text-layer + LLM (Phase 1)** — основной путь.
   `extract_structured_rows(page)` в `services/pdf_text.py`:
   - применяет `page.rotation_matrix` для derotation ЕСКД landscape A3;
   - группирует span'ы в визуальные row'ы по Y (±5.5pt);
   - **R23 (E15.05 it2)** multi-row header склейка (`_merge_multi_row_header`):
     кластеризует спаны header zone по x, вертикально склеивает с word-dash
     rule («оборудо-» + «вания» → «оборудования»), матчит merged text
     против `_HEADER_MARKER_PATTERNS` → per-page column bounds. Fallback
     на single-row + shift-калибровку для простых шапок (spec-ov2/aov).
   - **R24** — span-join в cells через x-gap (gap < font_size × 0.3 =
     concat без пробела; иначе через пробел). Убирает «Pc=3 0 0 Па».
   - **R25** — `is_stamp_cell` filter на все 9 cells (pos/name/model/
     brand/manufacturer/unit/qty/mass/comments); ячейки-штампы чистятся,
     row дропается если все cells-штампы.
   - **R22** — отдельная колонка `manufacturer` (завод-изготовитель /
     производитель) помимо `brand` (торговая марка / поставщик).

   Затем `normalize_via_llm` делает один gpt-4o full call на страницу
   (temperature=0, response_format=json_object) для склейки multi-line имён
   (**R18-strict** — orphan-name ВСЕГДА continuation), sticky parent
   наследования, детекции секций, обработки артикульных вариантов,
   префикс-колонки «ПВ-ИТП», **R26** нормализации section_name
   (trailing `:`/`—`/`-` очищается).

2. **Multimodal Vision retry (Phase 2, R27)** — conditional.
   После Phase 1 для каждой страницы вычисляется `compute_confidence`
   (см. `services/spec_normalizer.py`). Если score < 0.7 (порог в
   `settings.llm_multimodal_retry_threshold`) — страница рендерится в PNG
   и отправляется `provider.multimodal_complete` с prompt + image_b64.
   Модель: gpt-4o full (всегда). Broker-selection принимает Phase 2
   результат только если его confidence выше Phase 1.

3. **Legacy line-based** (fallback без LLM). Если провайдер не поддерживает
   `text_complete` (Noop/Inert в тестах), LLM вернул битый JSON, или
   `settings.llm_normalize_enabled=False` — используется `parse_page_items`
   (reading-order). Recall ниже (~138/152), но не требует OpenAI-ключа.

4. **Vision fallback** (для сканов). Если text layer отсутствует
   (`has_usable_text_layer()` False) — страница идёт в `_classify_page` /
   `_extract_items` через gpt-4o-mini Vision (legacy Vision-роут).

**Метрики качества (3 goldens, baseline после E15.05 it2):**

| Fixture    | Pages | Items target | Sections | Time (P1+P2) | Phase 2 retries |
|------------|-------|--------------|----------|--------------|-----------------|
| spec-ov2   | 9     | ≥145 / 152   | ≥6       | ≤45с         | 0-1             |
| spec-aov   | 2     | 29 / 29      | ≥4       | ≤10с         | 0               |
| spec-tabs  | 9     | ≥120 / ~150  | ≥4       | ≤120с        | 2-4             |

Архитектурные решения: [ADR-0024](../ismeta/docs/adr/0024-column-aware-llm-normalization.md)
(bbox + text LLM) и [ADR-0025](../ismeta/docs/adr/0025-multimodal-fallback-gpt4o.md)
(гибрид it2).

**Kill switches:**
- `RECOGNITION_LLM_NORMALIZE_ENABLED=false` — отключает column-aware LLM,
  остаётся legacy text-layer + Vision.
- `RECOGNITION_LLM_MULTIMODAL_RETRY_ENABLED=false` — отключает Phase 2
  (только bbox + Phase 1).
- `RECOGNITION_LLM_MULTIMODAL_RETRY_THRESHOLD=0.5` — понизить порог retry
  (более агрессивный retry на пограничных страницах).
- `RECOGNITION_LLM_EXTRACT_MODEL=gpt-4o-mini` — вернуть mini для extract
  (cost-сохраняющий режим).

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
