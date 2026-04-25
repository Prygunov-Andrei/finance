# 16. LLM-профили + стоимость распознавания (E18)

**Статус:** DRAFT (2026-04-25). PO ожидает старта после захода 4/10.

## Зачем

PO хочет:
1. **Оперативно сравнивать модели** на конкретном PDF без редактирования `.env` и рестарта recognition (gpt-5.4, gpt-4o, deepseek-chat, потенциально claude-sonnet-4-6 через anthropic-proxy).
2. **Видеть цену каждого распознания** прямо в UI после import.
3. **History costs** в списке смет / отчётах workspace.

## Use cases

1. PO загружает spec-3 на gpt-5.4 → 199 items, $0.42. Тот же PDF на deepseek-chat → 197 items, $0.04. Решает что 99% качества за 10× дешевле = удобно для черновиков.
2. PO видит что workspace тратит $X в месяц на recognition (история).
3. Внутренний пользователь компании выбирает «Дешевая модель» по умолчанию, для важных смет PO разово переключает на флагман.

## Архитектура (3 слоя)

### 1. Recognition (FastAPI :8003) — stateless override через headers

**Зачем headers:** Recognition — standalone сервис, рестарт ради смены модели тяжёл. Передаём профиль на каждом запросе.

**Заголовки запроса (`POST /v1/parse/spec`, `/v1/parse/invoice`):**

| Header | Default | Описание |
|---|---|---|
| `X-LLM-Base-URL` | `settings.openai_api_base` | OpenAI-совместимый base. https://api.openai.com или https://api.deepseek.com |
| `X-LLM-API-Key` | `settings.openai_api_key` | API ключ. Если не передан → дефолт из env |
| `X-LLM-Extract-Model` | `settings.llm_extract_model` | Текстовая модель для extract |
| `X-LLM-Multimodal-Model` | `settings.llm_multimodal_model` | Vision модель |
| `X-LLM-Classify-Model` | `settings.llm_classify_model` | Классификатор |
| `X-LLM-Vision-Counter-Enabled` | `settings.llm_vision_counter_enabled` | `false` для providers без vision |
| `X-LLM-Multimodal-Retry-Enabled` | `settings.llm_multimodal_retry_enabled` | Аналогично |

**Реализация:**
- Новый dependency `get_provider(request)` в `app/deps.py`. Читает headers, создаёт `OpenAIVisionProvider(api_key=..., api_base=...)` per-request.
- Provider обновлён: принимает `api_base` параметр, не только `api_key`. Default = `settings.openai_api_base`.
- Per-request override settings (vision toggles) через context-var или прокидывание в SpecParser.
- Connection pool — теряется per-request (новый httpx client). На MVP терпимо. Optimizer: lru-кэш по (api_base, api_key) → reusable provider.

**Response payload — добавить `llm_costs`:**

```json
{
  "items": [...],
  "pages_summary": [...],
  "llm_costs": {
    "extract": {
      "model": "deepseek-chat",
      "calls": 9,
      "prompt_tokens": 18234,
      "completion_tokens": 4103,
      "cached_tokens": 0,
      "cost_usd": 0.0427
    },
    "multimodal": null,
    "classify": null,
    "total_usd": 0.0427
  }
}
```

**Pricing table** — JSON config файл `recognition/app/pricing.json`:

```json
{
  "gpt-4o": {"input": 2.5, "output": 10.0, "cached": 1.25},
  "gpt-4o-mini": {"input": 0.15, "output": 0.60, "cached": 0.075},
  "gpt-5.2": {"input": 1.25, "output": 10.0, "cached": 0.125},
  "gpt-5.4": {"input": 2.0, "output": 12.0, "cached": 0.20},
  "deepseek-chat": {"input": 0.14, "output": 0.28, "cached": 0.0},
  "claude-sonnet-4-6": {"input": 3.0, "output": 15.0, "cached": 0.30}
}
```
Цены `per 1M tokens`. Если модель не найдена → `cost_usd = null` (UI покажет «—»).

### 2. Backend (Django ismeta)

**Модель `LLMProfile`** (новое app `llm_profiles` или внутри `estimate`):

```python
class LLMProfile(models.Model):
    name = models.CharField(max_length=100, unique=True)  # "OpenAI gpt-5.4", "DeepSeek"
    base_url = models.URLField(default="https://api.openai.com")
    api_key_encrypted = models.BinaryField()  # Fernet
    extract_model = models.CharField(max_length=100)
    multimodal_model = models.CharField(max_length=100, blank=True)
    classify_model = models.CharField(max_length=100, blank=True)
    vision_supported = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
```

Encryption: `cryptography.fernet.Fernet`, key из `LLM_PROFILE_ENCRYPTION_KEY` env var (gitignored, добавить в `.env`).

**API endpoints `/api/llm-profiles/`:**
- `GET /` — list (api_key вернуть как `***last4`)
- `POST /` — create (api_key plain, шифруется на save)
- `PATCH /{id}/` — update
- `DELETE /{id}/`
- `POST /{id}/set-default/` — атомарно: сбросить is_default у всех + поставить у этого

**Proxy**: при `POST /api/v1/estimates/{id}/import-pdf/` бэкенд читает `profile_id` из body (или query), декриптует api_key, проксирует на recognition с заполненными headers. Возвращает clientу полный response (включая `llm_costs`).

**`ImportLog` модель** (новая или расширение существующего):
```python
class ImportLog(models.Model):
    estimate = models.ForeignKey(Estimate, on_delete=models.CASCADE)
    file_type = models.CharField(...)  # pdf/excel/spec/invoice
    profile = models.ForeignKey(LLMProfile, null=True, on_delete=models.SET_NULL)
    cost_usd = models.DecimalField(max_digits=8, decimal_places=4, null=True)
    items_created = models.IntegerField()
    pages_processed = models.IntegerField(null=True)
    llm_metadata = JSONField()  # llm_costs payload
    created_at = models.DateTimeField(auto_now_add=True)
```

### 3. Frontend (Next.js ismeta)

**Settings → tab «Модели LLM» (`/settings/llm`):**
- Таблица профилей (name, base_url, extract_model, default badge, actions)
- Modal create/edit: name, base_url (predefined dropdown OpenAI/DeepSeek/Anthropic + custom), api_key (password field + reveal toggle), модели extract/multimodal/classify, vision_supported toggle
- Кнопка «Тест соединения» — `POST /api/llm-profiles/test/` с временным ключом, recognition пробует `GET /v1/models`

**`PdfImportDialog`:**
- Сверху dropdown «Модель распознавания» (default profile preselected)
- После import — ниже результата:
  ```
  ✓ 199 позиций, 9 страниц обработано
  Стоимость: $0.04 (DeepSeek-chat: 18,234 input + 4,103 output tokens)
  ```

**Список смет (`/estimates`):**
- Колонка «Цена распознавания» (опционально, скрыто по умолчанию). Чтобы PO смотрел только когда нужно.
- Иконка «$» в строке открывает popover с разбивкой: модель + tokens + cost.

## Открытые вопросы (ответ PO до старта)

1. ❓ **Per-workspace профили или глобальные?** MVP: глобальные. Per-workspace добавим если PO попросит.
2. ❓ **Default profile.** Глобальный, виден всем. Один на весь ismeta deployment.
3. ❓ **Budget alerts.** НЕ в MVP. Реализуем по запросу.
4. ❓ **API key encryption key rotation.** На MVP — single key из env. Rotation позже.
5. ❓ **«Anthropic через proxy».** Anthropic API не openai-совместим. Рассмотреть в follow-up (либо использовать LiteLLM proxy, либо свой адаптер).

## Декомпозиция в task'и

- **E18-1 (IS-Петя, recognition):** headers override + `OpenAIVisionProvider(api_base)` + `llm_costs` в response + `pricing.json`. ~0.5 дня.
- **E18-2 (IS-Петя, backend):** модель `LLMProfile` + CRUD + proxy в `/import-pdf/` + `ImportLog`. ~1.5 дня.
- **E18-3 (IS-Федя, frontend):** Settings page + dialog dropdown + cost display + (optional) колонка в estimates list. ~2 дня.

Старт строго после захода 4/10. PO даёт go отдельной командой.
