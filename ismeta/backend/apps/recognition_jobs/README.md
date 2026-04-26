# apps.recognition_jobs (E19-2)

Backend-сервис фоновых задач распознавания PDF.

## Зачем

Сметчик загружает PDF → распознавание идёт 4-15 мин на DeepSeek V4-Pro thinking high. Раньше запрос был синхронным — сметчик ждал с открытым диалогом. Теперь:

1. POST `/api/v1/estimates/{id}/import/pdf/` (default `?async=true`) → 202 моментально + `RecognitionJob` (status=`queued`).
2. Sidecar `recognition-worker` пулит queued jobs через `SELECT FOR UPDATE SKIP LOCKED`, переводит в `running`, POST'ит на recognition `/v1/parse/spec/async` с callback URL.
3. Recognition (см. E19-1) шлёт callbacks `started` / `page_done` / `finished` / `failed` / `cancelled` на `/api/v1/recognition-jobs/{id}/callback/`. Handler обновляет state и в `finished` вызывает `apply_parsed_items()` — те же `EstimateItem`'ы что в sync flow.
4. Frontend (E19-3, IS-Федя) поллит `/api/v1/recognition-jobs/?status=running,queued` каждые 5с, показывает 🔄 в шапке + toast при завершении.

## Endpoints

| Метод | URL | Описание |
|---|---|---|
| POST | `/api/v1/estimates/{id}/import/pdf/?async=true` | Создать job → 202 + `RecognitionJob` JSON |
| POST | `/api/v1/estimates/{id}/import/pdf/?async=false` | Backward-compat sync flow |
| GET | `/api/v1/recognition-jobs/?status=queued,running&estimate_id=...` | Список с фильтрами |
| GET | `/api/v1/recognition-jobs/{id}/` | Details |
| POST | `/api/v1/recognition-jobs/{id}/cancel/` | Отмена. running → POST на recognition `/cancel/{id}` |
| POST | `/api/v1/recognition-jobs/{id}/callback/` | Приём callback'ов от recognition (auth: `X-Callback-Token`) |

## Callback contract

Recognition POST'ит JSON:
```json
{ "job_id": "<uuid>", "event": "page_done", "page": 3, "items": [...], "partial_count": 47 }
```

Auth — header `X-Callback-Token` (constant-time comparison c `RecognitionJob.cancellation_token`, генерится `secrets.token_urlsafe(32)` при создании job'а).

Events:
- `started`: status → `running`, started_at = now (если ещё не выставлен).
- `page_done`: items накапливаются в `RecognitionJob.items`, `pages_done += 1`.
- `finished`: финальный snapshot (items, pages_stats, pages_summary, llm_costs). Вызывается `apply_parsed_items` → создаёт `EstimateItem`'ы → status=`done`. При ошибке apply — status=`failed`.
- `failed`: status=`failed`, error_message сохраняется.
- `cancelled`: status=`cancelled`, completed_at = now.

Callbacks после terminal-статуса игнорируются (idempotent).

## Worker (sidecar)

```bash
python manage.py recognition_worker
```

В docker-compose поднимается отдельным сервисом `recognition-worker`. Полит таблицу каждые `RECOGNITION_WORKER_POLL_INTERVAL` секунд, запускает до `RECOGNITION_MAX_PARALLEL_JOBS` параллельных dispatch-task'ов (asyncio.Semaphore).

Воркер не ждёт finish'а — после успешного 202 от recognition он освобождается и берёт следующий job. Рестарт воркера безопасен (jobs в `queued` ждут, jobs в `running` уже у recognition).

⚠️ **Persistence через restart recognition НЕ MVP.** Если recognition перезапустится — running jobs зависнут (callback не придёт). Подхватим follow-up задачей.

## Settings

| Variable | Default | Назначение |
|---|---|---|
| `RECOGNITION_URL` | `http://recognition:8003` | Где живёт recognition |
| `RECOGNITION_API_KEY` | _(empty)_ | Shared с recognition |
| `BACKEND_INTERNAL_URL` | `http://ismeta-backend:8000` | Куда recognition POST'ит callbacks |
| `RECOGNITION_MAX_PARALLEL_JOBS` | `2` | Конкурентность dispatch'а |
| `RECOGNITION_WORKER_POLL_INTERVAL` | `2.0` | Сек между опросами очереди |

## E18 (LLM-профили) — независимость

E18 ещё не запущен — `RecognitionJob.profile_id` сейчас `IntegerField(null=True, blank=True)` без FK. Worker НЕ передаёт `X-LLM-*` headers — recognition использует defaults из своего .env (DeepSeek V4-Pro thinking high).

После E18-2 будет миграция: `profile_id → ForeignKey(LLMProfile, SET_NULL)` + worker начнёт читать `LLMProfile` и проксировать headers.

## Smoke-test (curl)

```bash
# 1. Создать job (sync API всё равно нужно — для PDF blob; ?async=true возвращает 202).
curl -s -X POST "http://localhost:8001/api/v1/estimates/<EST_ID>/import/pdf/?async=true" \
  -H "X-Workspace-Id: <WS_ID>" \
  -F "file=@/path/to/spec.pdf"
# → 202 + {"id": "<JOB_ID>", "status": "queued", ...}

# 2. Поллинг
curl -s "http://localhost:8001/api/v1/recognition-jobs/?status=queued,running" \
  -H "X-Workspace-Id: <WS_ID>"

# 3. Cancel
curl -s -X POST "http://localhost:8001/api/v1/recognition-jobs/<JOB_ID>/cancel/" \
  -H "X-Workspace-Id: <WS_ID>"
```

## Тесты

```bash
docker exec ismeta-backend python -m pytest apps/recognition_jobs/tests/ -x
```

Покрытие: модель (6), views (19), worker (7), async-flow в estimate (6) = 38 тестов.
