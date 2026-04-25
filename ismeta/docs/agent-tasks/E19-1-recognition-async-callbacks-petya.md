# ТЗ: E19-1 — Recognition: async endpoint + page-level callbacks + cancellation (IS-Петя)

**Команда:** IS-Петя.
**Ветка:** `recognition/e19-1-async-callbacks`.
**Worktree:** `ERP_Avgust_is_petya_e19_1`.
**Приоритет:** 🟢 feature E19. Старт строго после явного go PO.
**Срок:** ~1 день.

---

## Контекст

Master spec: [`ismeta/specs/17-background-recognition-jobs.md`](../../specs/17-background-recognition-jobs.md) — прочитай ПОЛНОСТЬЮ.

Текущее состояние recognition:
- `POST /v1/parse/spec` — синхронный. Клиент ждёт до `parse_timeout_seconds=300` (теперь 1500). Backend (Django) ждёт через httpx с таймаутом 1800сек. На DeepSeek v4-pro thinking high — реально 10-15 мин на больших PDF.

PO хочет async pattern: backend моментально отдаёт `job_id`, recognition обрабатывает в background, шлёт callbacks по мере progress.

---

## Задача

### 1. Новый endpoint `POST /v1/parse/spec/async`

**Файл:** `recognition/app/api/parse.py` (или близко).

```python
@router.post("/parse/spec/async", status_code=202)
async def parse_spec_async(
    file: UploadFile = File(...),
    x_callback_url: str = Header(...),
    x_job_id: str = Header(...),
    x_callback_token: str = Header(""),
    request: Request,
    background_tasks: BackgroundTasks,
    provider: BaseLLMProvider = Depends(get_llm_provider),  # E18 headers
):
    """Async parsing. Возвращает 202 сразу, парсит в фоне, шлёт callbacks
    на x_callback_url с auth header X-Callback-Token = x_callback_token.
    """
    pdf_bytes = await file.read()
    asyncio.create_task(_run_async_job(
        job_id=x_job_id,
        pdf_bytes=pdf_bytes,
        filename=file.filename,
        callback_url=x_callback_url,
        callback_token=x_callback_token,
        provider=provider,
        request_headers=dict(request.headers),  # для прокидывания X-LLM-* в provider
    ))
    return {"status": "accepted", "job_id": x_job_id}
```

### 2. Job registry для cancellation

**Файл:** `recognition/app/services/job_registry.py` (новый).

```python
import asyncio

_JOBS: dict[str, asyncio.Task] = {}
_LOCK = asyncio.Lock()

async def register(job_id: str, task: asyncio.Task) -> None:
    async with _LOCK:
        _JOBS[job_id] = task

async def cancel(job_id: str) -> bool:
    async with _LOCK:
        task = _JOBS.get(job_id)
        if task and not task.done():
            task.cancel()
            return True
        return False

async def cleanup(job_id: str) -> None:
    async with _LOCK:
        _JOBS.pop(job_id, None)
```

In-memory. Теряется при рестарте — это known limit MVP (см. master spec).

### 3. Cancellation endpoint

```python
@router.post("/parse/spec/cancel/{job_id}", status_code=200)
async def cancel_spec_job(job_id: str):
    cancelled = await job_registry.cancel(job_id)
    return {"cancelled": cancelled}
```

### 4. `_run_async_job` — обёртка над существующим SpecParser

```python
async def _run_async_job(job_id, pdf_bytes, filename, callback_url, callback_token, provider, request_headers):
    task = asyncio.current_task()
    await job_registry.register(job_id, task)
    
    async def send_callback(event: str, payload: dict):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    callback_url,
                    headers={"X-Callback-Token": callback_token, "Content-Type": "application/json"},
                    json={"job_id": job_id, "event": event, **payload},
                )
        except Exception as e:
            logger.warning("callback failed", extra={"job_id": job_id, "event": event, "error": str(e)})
    
    try:
        await send_callback("started", {})
        # SpecParser принимает per-page callback (см. п.5)
        result = await parser.parse_streaming(
            pdf_bytes=pdf_bytes,
            filename=filename,
            on_page_done=lambda page, items: send_callback("page_done", {
                "page": page, "items": [it.model_dump() for it in items], "partial_count": ...
            }),
        )
        await send_callback("finished", {
            "items": [it.model_dump() for it in result.items],
            "pages_total": result.pages_total,
            "pages_processed": result.pages_processed,
            "llm_costs": result.llm_costs.model_dump() if result.llm_costs else None,
            "warnings": result.warnings,
        })
    except asyncio.CancelledError:
        await send_callback("cancelled", {})
        raise
    except Exception as e:
        await send_callback("failed", {"error": str(e), "code": getattr(e, "code", "internal_error")})
        logger.exception("async job failed", extra={"job_id": job_id})
    finally:
        await job_registry.cleanup(job_id)
```

### 5. SpecParser per-page callback

**Файл:** `recognition/app/services/spec_parser.py`.

Текущий метод `parse(self, doc, ...)` накапливает items внутри. Расширить:

```python
async def parse(
    self, doc, ...,
    on_page_done: Callable[[int, list[NormalizedItem]], Awaitable[None]] | None = None,
) -> SpecParseResponse:
    ...
    # Внутри Phase 3 параллельной обработки страниц:
    async def run_one(page_num, rows, ...):
        ...
        # после postprocess для page_num:
        if on_page_done:
            await on_page_done(page_num + 1, page_items)
        return page_num, ...
```

`on_page_done` вызывается ПОСЛЕ post-process данной страницы, но ДО cross-page continuation merge. Cross-page изменения last item доедут в финальном `finished` callback.

Если `on_page_done = None` — поведение идентично текущему (для backward compat).

### 6. Глобальный concurrency semaphore

Текущий `LLM_MAX_CONCURRENCY=3` — внутри одного парсинга. С двумя параллельными jobs — 6 одновременных DeepSeek calls. Можем упереться в rate-limit.

Добавить **process-level semaphore** в `app/services/llm_throttle.py`:

```python
import asyncio
from app.config import settings

_global_sema = asyncio.Semaphore(getattr(settings, "llm_global_concurrency", 4))

def get_global_semaphore() -> asyncio.Semaphore:
    return _global_sema
```

`OpenAIVisionProvider._post_with_retry` использует это до per-job semaphore (или вместо).

Default `llm_global_concurrency = 4` (можно поднять при необходимости через .env).

### 7. Тесты

`recognition/tests/test_parse_spec_async.py`:
- POST `/v1/parse/spec/async` возвращает 202 + job_id моментально
- Через mock recognition completes → callback events: started → page_done × N → finished
- Cancel endpoint работает (Task.cancel) → cancelled callback
- Failure path: исключение в parse → failed callback
- Multiple jobs concurrent — оба завершаются, callbacks разделены по job_id

`tests/test_llm_throttle.py`:
- semaphore лимитирует одновременные calls

### 8. Конфигурация

`recognition/app/config.py`:
- `llm_global_concurrency: int = 4`
- `async_callback_timeout: float = 10.0`

---

## Приёмочные критерии

1. ✅ `POST /v1/parse/spec/async` возвращает 202 + `{job_id}` за < 200ms.
2. ✅ В фоне отправляются callbacks: `started`, `page_done` (по странице), `finished` (с llm_costs из E18) ИЛИ `failed` ИЛИ `cancelled`.
3. ✅ `POST /v1/parse/spec/cancel/{job_id}` останавливает задачу, callback `cancelled`.
4. ✅ Глобальный semaphore ограничивает суммарные DeepSeek calls по всему процессу.
5. ✅ Старый sync endpoint `/v1/parse/spec` работает идентично текущему (не сломан).
6. ✅ E18 `X-LLM-*` headers пропускаются в async pipeline.
7. ✅ Все тесты зелёные. Live-прогон 3 голд-PDF через async с моком callback'а возвращает те же items.

---

## Ограничения

- **НЕ менять** старый sync endpoint поведение.
- **НЕ персистить** state — `_JOBS` in-memory. При рестарте jobs теряются.
- **НЕ ретраить** callbacks (если backend недоступен — лог warning).
- **НЕ изменять** `SpecParser` post-process логику — только добавить callback hook.

---

## Формат отчёта

1. Ветка + hash.
2. Список изменённых/новых файлов.
3. Curl-демо: POST async → видно 202; затем mock-callback receiver (или просто log) показывает события started → page_done × N → finished.
4. pytest summary.

---

## Start-prompt для Пети (копировать)

```
Добро пожаловать. Ты — IS-Петя, backend AI-программист.
Работаешь автономно в своей Claude-сессии.

ПЕРВЫМ ДЕЛОМ:

1. Прочитай онбординг:
   ismeta/docs/agent-tasks/ONBOARDING.md

2. Прочитай master спеку:
   ismeta/specs/17-background-recognition-jobs.md

3. Прочитай своё ТЗ:
   ismeta/docs/agent-tasks/E19-1-recognition-async-callbacks-petya.md

Рабочая директория:
  /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_petya_e19_1

Твоя ветка: recognition/e19-1-async-callbacks (от origin/main).

Контекст: PO хочет background-jobs UX. Сметчик загрузил PDF → закрыл
диалог → работает дальше. В шапке индикатор. Toast при готовности.
Сейчас sync endpoint держит backend 10-15 мин — нужно async pattern.

Твоя часть — async endpoint в recognition + callbacks + cancellation.
E19-2 (Django job model + queue) и E19-3 (frontend panel) делают другие
после твоего merge.

Работай строго по ТЗ. Push в свою ветку, отчёт по формату.
```
