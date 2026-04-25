# ТЗ: E18-1 — Recognition: LLM-профиль через headers + cost tracking (IS-Петя)

**Команда:** IS-Петя.
**Ветка:** `recognition/e18-1-llm-profile-headers`.
**Worktree:** `ERP_Avgust_is_petya_e18_1`.
**Приоритет:** 🟢 feature E18 (LLM-профили + cost). Запускать **только после явного go PO** (раздел «Старт» из master spec).
**Срок:** ~0.5-1 день.

---

## Контекст

Master spec: [`ismeta/specs/16-llm-profiles.md`](../../specs/16-llm-profiles.md) — прочитай ПОЛНОСТЬЮ перед стартом.

Текущее состояние recognition (main @ `4e83e70`):
- Модель/base_url зашиты через env vars (`OPENAI_API_BASE`, `LLM_*_MODEL`, `OPENAI_API_KEY`) → меняются только рестартом контейнера.
- `OpenAIVisionProvider.__init__(api_key, model)` — base_url приклеен в `_chat_url()` и `_models_url()` функциях через `settings.openai_api_base`.
- Pricing нигде не считается — `TextCompletion` отдаёт `prompt_tokens`/`completion_tokens`/`cached_tokens`, но нет долларового пересчёта.

---

## Задача

### 1. Per-request override через headers

**Файл:** новый `recognition/app/deps.py` (или расширить существующий).

Создать FastAPI dependency `get_llm_provider(request: Request) -> BaseLLMProvider`:

```python
async def get_llm_provider(request: Request) -> BaseLLMProvider:
    """Per-request LLM provider. Если переданы X-LLM-* headers,
    создаёт provider с override; иначе — singleton с дефолтами env."""
    base_url = request.headers.get("X-LLM-Base-URL") or settings.openai_api_base
    api_key = request.headers.get("X-LLM-API-Key") or settings.openai_api_key
    extract_model = request.headers.get("X-LLM-Extract-Model") or settings.llm_extract_model
    multimodal_model = request.headers.get("X-LLM-Multimodal-Model") or settings.llm_multimodal_model
    classify_model = request.headers.get("X-LLM-Classify-Model") or settings.llm_classify_model
    vision_counter = _bool_header(request, "X-LLM-Vision-Counter-Enabled", settings.llm_vision_counter_enabled)
    multimodal_retry = _bool_header(request, "X-LLM-Multimodal-Retry-Enabled", settings.llm_multimodal_retry_enabled)
    
    return OpenAIVisionProvider(
        api_key=api_key, api_base=base_url,
        extract_model=extract_model, multimodal_model=multimodal_model, classify_model=classify_model,
        vision_counter_enabled=vision_counter, multimodal_retry_enabled=multimodal_retry,
    )
```

`_bool_header()` парсит `"true"/"false"/"1"/"0"` → bool, иначе default.

### 2. `OpenAIVisionProvider` — принимает per-request параметры

**Файл:** `recognition/app/providers/openai_vision.py`.

Текущий конструктор:
```python
def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
```

Расширить:
```python
def __init__(
    self,
    api_key: str | None = None,
    model: str | None = None,
    api_base: str | None = None,
    extract_model: str | None = None,
    multimodal_model: str | None = None,
    classify_model: str | None = None,
    vision_counter_enabled: bool | None = None,
    multimodal_retry_enabled: bool | None = None,
) -> None:
```

Все аргументы — `None` означает «брать из settings». Сохранить как instance fields (`self.extract_model`, etc).

Удалить module-level функции `_chat_url()`, `_models_url()` — заменить на instance methods:
```python
def _chat_url(self) -> str:
    return f"{(self.api_base or settings.openai_api_base).rstrip('/')}/v1/chat/completions"
```

В `text_complete`/`vision_complete`/`multimodal_complete` использовать `self.extract_model` / `self.multimodal_model` / `self.classify_model` вместо `settings.llm_*_model`.

`SpecParser` сейчас читает `settings.llm_vision_counter_enabled` напрямую — пробросить через provider или контекст-менеджер. **Простой вариант:** добавить в `SpecParser.__init__(provider, ...)` чтение `provider.vision_counter_enabled` если доступно, fallback `settings.llm_vision_counter_enabled`.

### 3. `llm_costs` в response

**Файл:** `recognition/app/schemas/spec.py` (или соответствующий — где определены `SpecParseResponse`).

Добавить новый pydantic модель:

```python
class LLMCallCost(BaseModel):
    model: str
    calls: int
    prompt_tokens: int
    completion_tokens: int
    cached_tokens: int
    cost_usd: float | None  # None если модель не в pricing.json

class LLMCosts(BaseModel):
    extract: LLMCallCost | None
    multimodal: LLMCallCost | None
    classify: LLMCallCost | None
    total_usd: float

class SpecParseResponse(BaseModel):
    ...existing...
    llm_costs: LLMCosts
```

Аналогично для `InvoiceParseResponse`.

### 4. Pricing table

**Файл:** `recognition/app/pricing.json` (новый).

```json
{
  "gpt-4o": {"input": 2.5, "output": 10.0, "cached": 1.25},
  "gpt-4o-mini": {"input": 0.15, "output": 0.60, "cached": 0.075},
  "gpt-5.2": {"input": 1.25, "output": 10.0, "cached": 0.125},
  "gpt-5.4": {"input": 2.0, "output": 12.0, "cached": 0.20},
  "deepseek-chat": {"input": 0.14, "output": 0.28, "cached": 0.0},
  "deepseek-v4-flash": {"input": 0.27, "output": 1.10, "cached": 0.027},
  "deepseek-v4-pro": {"input": 0.55, "output": 2.20, "cached": 0.055}
}
```
(Цены `per 1M tokens`. Уточни актуальность у DeepSeek docs до коммита.)

**Файл:** `recognition/app/services/pricing.py` (новый).

```python
import json
from pathlib import Path

_PRICING: dict[str, dict[str, float]] | None = None

def _load() -> dict[str, dict[str, float]]:
    global _PRICING
    if _PRICING is None:
        path = Path(__file__).parent.parent / "pricing.json"
        _PRICING = json.loads(path.read_text(encoding="utf-8"))
    return _PRICING

def calc_cost(model: str, prompt_tokens: int, completion_tokens: int, cached_tokens: int = 0) -> float | None:
    """Стоимость в USD по таблице. None если модель не найдена."""
    table = _load()
    rates = table.get(model)
    if not rates:
        return None
    uncached = prompt_tokens - cached_tokens
    return (
        uncached * rates["input"] / 1_000_000
        + cached_tokens * rates.get("cached", rates["input"] * 0.5) / 1_000_000
        + completion_tokens * rates["output"] / 1_000_000
    )
```

### 5. SpecParser/InvoiceParser — собирают costs

В `SpecParser` (и `InvoiceParser`):
- Заведи `self._cost_accumulator: dict[str, list[TextCompletion]]` — собирай completion'ы по типу call (extract/multimodal/classify).
- Каждый text/vision/multimodal complete пушит в свой bucket.
- В конце метода `parse(...)` собери `LLMCosts` через `pricing.calc_cost(model, sum_prompt, sum_completion, sum_cached)` для каждого bucket'а.
- Заполни `response.llm_costs`.

`vision_counter` тоже трекать как отдельный «classify» (или новый тип `vision_count`).

### 6. Использовать dependency в endpoint'ах

**Файлы:** `recognition/app/api/spec.py`, `recognition/app/api/invoice.py`.

```python
@router.post("/parse/spec")
async def parse_spec(
    file: UploadFile = File(...),
    provider: BaseLLMProvider = Depends(get_llm_provider),
):
    parser = SpecParser(provider=provider, ...)
    return await parser.parse(file)
```

Раньше provider был singleton — теперь per-request.

### 7. Connection pool — оптимизация (optional MVP)

Каждый request создаёт новый `httpx.AsyncClient` → cold TCP/TLS. Для MVP терпимо (распознавание PDF — секунды, handshake — миллисекунды).

**Если успеешь:** lru_cache по `(api_base, api_key_hash)` → reusable provider instance. **Не блокер для приёмки.**

### 8. Тесты

`recognition/tests/test_llm_provider_override.py` (новый):
- POST `/v1/parse/spec` без headers → провайдер с дефолтами env
- POST с `X-LLM-Base-URL` + `X-LLM-API-Key` → провайдер использует override
- POST с `X-LLM-Vision-Counter-Enabled: false` → vision counter disabled
- Smoke: response содержит `llm_costs` поле, `total_usd` ≥ 0

`recognition/tests/test_pricing.py` (новый):
- `calc_cost("gpt-4o", 1000, 500, 0)` → ожидаемая сумма
- `calc_cost("unknown-model", ...)` → None
- Cached tokens учитываются как часть prompt_tokens

### 9. Регрессия

После всех изменений запусти 3 голд-PDF — должны вернуть тот же результат что и сейчас (203±5 на spec-3, 153 на ov2, 29 на АОВ):

```bash
curl -s -X POST http://localhost:8003/v1/parse/spec \
  -H "X-API-Key: dev-recognition-key" \
  -F "file=@ismeta/tests/fixtures/golden/spec-ov2-152items.pdf" -o /tmp/r.json
# В response должны быть items + llm_costs
```

И response должен содержать `llm_costs.total_usd` — для gpt-5.4 на spec-3 ожидается ~$0.30-0.50.

---

## Приёмочные критерии

1. ✅ Headers `X-LLM-Base-URL`, `X-LLM-API-Key`, `X-LLM-Extract-Model`, `X-LLM-Multimodal-Model`, `X-LLM-Classify-Model`, `X-LLM-Vision-Counter-Enabled`, `X-LLM-Multimodal-Retry-Enabled` обрабатываются в endpoint `/v1/parse/spec` И `/v1/parse/invoice`.
2. ✅ Если headers не переданы — поведение идентично текущему (defaults из settings).
3. ✅ Response содержит `llm_costs` со структурой из спеки (extract/multimodal/classify/total_usd).
4. ✅ `pricing.json` содержит все актуальные модели (gpt-4o/4o-mini/5.2/5.4 + deepseek-chat/v4-flash/v4-pro). Цены проверены против документации провайдеров.
5. ✅ Тесты `test_llm_provider_override.py` и `test_pricing.py` зелёные.
6. ✅ Все существующие тесты `tests/test_pdf_text.py`, `test_spec_postprocess.py`, `test_spec_parser_*.py` зелёные.
7. ✅ Live-прогон spec-ov2 / spec-АОВ / spec-3 даёт тот же items_count что сейчас (LLM variance ±1) И `llm_costs.total_usd > 0`.
8. ✅ Type checker `mypy app/` clean (если был clean).

---

## Ограничения

- **НЕ менять** `app/services/spec_parser.py` логику пайплайна — только инжект provider + cost tracking.
- **НЕ удалять** существующие env vars (`OPENAI_API_BASE`, `LLM_*_MODEL` etc) — они остаются как defaults.
- **НЕ хардкодить** пути pricing.json — через `Path(__file__).parent`.
- **НЕ изменять** API ключ кодом (encryption — задача backend'а E18-2).
- **НЕ интегрироваться** с Anthropic API — только OpenAI-совместимые. Anthropic — follow-up.
- **НЕ ставить** version bump pricing.json в pre-commit hook — manual update.

---

## Формат отчёта

1. Ветка + hash коммита.
2. Список изменённых/созданных файлов.
3. Результаты live-прогонов 3 голд-PDF: items_count + llm_costs.total_usd (показать что cost > 0).
4. Snapshot полного response одного PDF (например spec-АОВ как самый маленький) — чтобы PO видел структуру `llm_costs`.
5. pytest summary (passed/failed).
6. Open questions / отклонения от ТЗ — явно перечислить.

---

## Start-prompt для Пети (копировать)

```
Добро пожаловать. Ты — IS-Петя, backend AI-программист проекта
ISMeta + Recognition. Работаешь автономно в своей Claude-сессии.

ПЕРВЫМ ДЕЛОМ:

1. Прочитай онбординг:
   ismeta/docs/agent-tasks/ONBOARDING.md

2. Прочитай master спеку фичи:
   ismeta/specs/16-llm-profiles.md

3. Прочитай своё ТЗ:
   ismeta/docs/agent-tasks/E18-1-recognition-llm-profile-headers-petya.md

Рабочая директория:
  /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_petya_e18_1

Твоя ветка: recognition/e18-1-llm-profile-headers (создана от
origin/main).

Контекст: Заход 3/10 QA-цикла закрыт (gpt-5.4 даёт 199±1 на
spec-3). PO хочет добавить возможность переключать LLM-модели
без рестарта контейнера + видеть стоимость каждого распознавания
прямо в UI. E18-1 — твоя часть в recognition. После твоей части
— E18-2 (Django LLMProfile + proxy) и E18-3 (Federa frontend).

Работай строго по ТЗ. После — push в свою ветку, отчёт по формату.

Вопросы — Андрею (PO). С тех-лидом напрямую не общаешься.
```
