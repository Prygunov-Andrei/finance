# ТЗ для Пети — E15.01 Recognition Service: скелет + /parse/spec

**Кому:** Петя (backend, Python).
**Ветка:** `recognition/01-skeleton-and-spec-parser`.
**Базовая ветка:** `main`.
**Статус:** готово к работе.

---

## Контекст

Мы разрабатываем **ISMeta** — отдельный продукт для создания смет (см. `ismeta/CONCEPT.md`). Прод: `ismeta.hvac-info.com`. MVP в dogfood.

В основе монорепо ERP Август Климат (`/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust`). ISMeta живёт в `ismeta/`, исторический ERP — в `backend/`.

### Что сейчас болит

В ERP (`backend/llm_services/services/specification_parser.py` — 307 строк, работает) есть парсер PDF-спецификаций. Айсмета пыталась им пользоваться через HTTP-обёртку ISMeta→ERP. **Провалилось:** 4+ часов на auth/networking/format/cache баги (коммиты `bee690d`, `427800f`, `27fc8fb`, `a6bc5d6`, `2e6d2a8`).

Принято решение (ADR-0023): **вынести распознавание в отдельный микросервис**. Читай:
- `ismeta/docs/adr/0023-recognition-as-standalone-service.md` — мотивация и решение;
- `ismeta/specs/15-recognition-api.md` — **это твой API-контракт**, реализуешь под него;
- `ismeta/docs/EPICS.md` раздел E15 — общий scope;
- `backend/llm_services/services/specification_parser.py` — логика, которую переносим.

### Кто ещё работает

- Федя параллельно делает UI (resizable panels в Айсмете), он в ветке `ismeta/ui-resizable-panels`. Он тебя не блокирует и ты его — не блокируешь.
- Я (Claude tech lead) ревьюлю твои PR и мержу.

---

## Задача (scope E15.01)

Создать скелет сервиса и реализовать **первый endpoint — `POST /v1/parse/spec`**. Остальные (`/parse/invoice`, `/parse/quote`) — в E15.02, после ревью.

### Что создаёшь

1. **`recognition/`** в корне репо (рядом с `backend/`, `frontend/`, `ismeta/`, `bot/`). Внутри:

   ```
   recognition/
     app/
       __init__.py
       main.py              # FastAPI app, startup
       config.py            # pydantic-settings: RECOGNITION_API_KEY, OPENAI_API_KEY, PROVIDER, LOG_LEVEL
       auth.py              # X-API-Key middleware/dependency
       logging_setup.py     # JSON-логи в stdout
       api/
         __init__.py
         parse.py           # роутер /v1/parse/*
         health.py          # /v1/healthz
         errors.py          # exception handlers → JSON errors из спеки §5
       services/
         __init__.py
         spec_parser.py     # перенесённый SpecificationParser, без Django
         pdf_render.py      # PyMuPDF utils (render_page, classify helpers)
       providers/
         __init__.py
         base.py            # интерфейс BaseLLMProvider
         openai_vision.py   # OpenAI gpt-4o-mini Vision
       schemas/
         __init__.py
         spec.py            # pydantic модели SpecItem, SpecParseResponse, PagesStats (по спеке §1)
         common.py          # ErrorResponse
     tests/
       __init__.py
       conftest.py
       test_health.py
       test_auth.py
       test_parse_spec.py   # unit + cassette на реальный PDF
       fixtures/
         sample_spec.pdf    # копия из backend/ если есть, иначе ручная
         cassettes/         # vcrpy/respx записи LLM ответов
     Dockerfile
     pyproject.toml         # FastAPI, uvicorn, pydantic, pydantic-settings, pymupdf, httpx, openai, pytest, pytest-asyncio, vcrpy (или respx)
     README.md
     .env.example           # RECOGNITION_API_KEY=dev-change-me, OPENAI_API_KEY=sk-..., LOG_LEVEL=INFO
     openapi.yaml           # экспортированный из FastAPI (ручной `python -c "..."` скрипт)
   ```

2. **Обновить корневой `docker-compose.yml`** (и `docker-compose.prod.yml`, если уместно): добавить сервис `recognition` на порт 8003, env `RECOGNITION_API_KEY`, `OPENAI_API_KEY`, healthcheck на `/v1/healthz`. НЕ добавлять в зависимости другим сервисам в этой задаче — подключение клиентов будет в E15.02.

3. **`Dockerfile`**: python:3.12-slim, установить системные зависимости для PyMuPDF (если нужно), poetry/pip install, CMD `uvicorn app.main:app --host 0.0.0.0 --port 8003`.

4. **Функциональность `POST /v1/parse/spec`** — чётко по `ismeta/specs/15-recognition-api.md §1`.

### Что НЕ делаешь в этой задаче

- НЕ трогаешь `/parse/invoice`, `/parse/quote` — следующий заход (E15.02).
- НЕ подключаешь Айсмету и ERP как клиентов — E15.02.
- НЕ удаляешь `specification_parser.py` из ERP — оставляем до фазы 2 (E28).
- НЕ лепишь auth кроме `X-API-Key`. НЕ JWT, НЕ OAuth.
- НЕ делаешь persistence, кэш, очереди, sessions.
- НЕ рисуешь UI.
- НЕ трогаешь `estimates/` в ERP.

---

## Приёмочные критерии

1. **`docker compose up recognition`** поднимает сервис, `curl http://localhost:8003/v1/healthz` → 200 с `{"status":"ok", ...}`.
2. **Auth** — запрос без `X-API-Key` → 401, `{"error":"invalid_api_key"}`.
3. **`POST /v1/parse/spec`** с валидным PDF и правильным ключом:
   - валидный ответ по схеме из `specs/15-recognition-api.md §1`;
   - `items[].page_number` заполнен, `sort_order` проставлен, `tech_specs` строка (не объект);
   - дедупликация работает: три одинаковых вентилятора (name+model+brand) → один item с `quantity=3`;
   - при ошибках страниц — `status="partial"`, `errors[]` непустой, часть items всё равно возвращается.
4. **Негативные кейсы возвращают коды из §5:** отсутствие файла → 400; не-PDF → 415; большой файл → 413.
5. **Тесты** (`pytest recognition/tests/ -v`):
   - `test_health.py` — здоровье;
   - `test_auth.py` — 401/200 по ключу;
   - `test_parse_spec.py` — хотя бы 3 теста:
     - happy path на реальном тестовом PDF (через cassette OpenAI — либо respx mock, либо vcrpy);
     - partial success (мокаем ошибку на одной странице);
     - негативные кейсы (не-PDF, пустой файл).
   - coverage ≥ 80% по `recognition/app/`.
6. **Тип-чек и линт:** `ruff check recognition/` без ошибок; `mypy recognition/app/` (или pyright) без ошибок на свой код (сторонние игнорируются).
7. **OpenAPI:** `recognition/openapi.yaml` сгенерирован из FastAPI и закоммичен; соответствует `specs/15-recognition-api.md §1`.
8. **Логи**: в stdout JSON с полями `level`, `ts`, `msg`, `request_id`, `pages_total`, `pages_processed`, `items_count`.
9. **Миграция логики из ERP** чистая:
   - никаких импортов из `backend/` в `recognition/`;
   - `SpecificationParser` не зависит от Django, `LLMProvider` модели, `llm_services.*`;
   - PyMuPDF тот же (fitz), DPI 200, MAX_PAGE_RETRIES=2, prompts те же (можешь улучшить но не ломать поведение).

---

## Ограничения

- **Python 3.12**, тот же что в `backend/`.
- **FastAPI ≥ 0.110**, pydantic v2.
- **stateless** — никаких глобальных словарей/кэшей. Провайдер инициализируется через DI в startup.
- **async** эндпоинты, но LLM-вызовы допустимо синхронные (OpenAI SDK поддерживает async — лучше async). PyMuPDF — sync, обернуть в `run_in_threadpool`.
- **timeout** на весь `/parse/spec` — 300 секунд (настраивается env). При превышении отдаём `status="partial"` с тем что успели, код 200 (не 504), чтобы клиент мог сохранить частичный результат.
- **Prompt'ы** — можно скопировать текущие из `specification_parser.py` 1-в-1. Правки промптов — отдельная задача.
- **LLM provider** — один, OpenAI gpt-4o-mini через Vision API. Ключ из env. Никакого `LLMProvider` из Django БД.
- **Error handling:** если LLM падает на странице → ретрай 2 раза, потом записываем в `errors[]` и идём дальше. Весь документ не валим.
- **Никаких HTTP-обёрток** внутри сервиса, никаких вызовов в ERP/Айсмету. Recognition изолирован.

---

## Подсказки

- Структура `SpecificationParser` в `backend/llm_services/services/specification_parser.py` — хорошая база. Выкинь `LLMProvider.get_default()`, сделай `provider: BaseLLMProvider` через DI.
- `BaseLLMProvider.parse_with_prompt` смотри в `backend/llm_services/providers/` (файлы `openai_provider.py` или аналог) — логика vision через base64 + сообщение.
- Для `sort_order` в items — назначай после дедупликации, как в оригинале.
- `pages_stats` — дай те же поля что в спеке (`total`, `processed`, `skipped`, `error`).
- Для cassette-тестов используй `respx` (HTTPX mocks) или `vcrpy` — на твой вкус. `respx` проще с FastAPI.

---

## Формат отчёта (после завершения)

Кидаешь Андрею одно сообщение:

```
Ветка: recognition/01-skeleton-and-spec-parser
Коммиты: <hash-ы>

Что сделано:
- <список по пунктам>

Тесты:
- pytest: 12 passed, coverage 84%
- ruff: clean
- mypy: clean
- docker compose up recognition: ok, healthz 200
- POST /v1/parse/spec на sample.pdf: <кол-во items>, status done/partial

Вопросы/сомнения:
- <если есть>

Что дальше:
- Жду ревью → мерж → приступить к E15.02 (invoice+quote+клиенты)
```

---

## Чек-лист перед отчётом

- [ ] `docker compose up recognition` работает локально;
- [ ] `POST /v1/parse/spec` на реальном PDF → валидный ответ;
- [ ] тесты зелёные, coverage ≥ 80%;
- [ ] `ruff`, `mypy` чистые;
- [ ] никаких импортов из `backend/`;
- [ ] README объясняет как запустить локально и как вызывать;
- [ ] OpenAPI сгенерирован;
- [ ] `.env.example` заполнен;
- [ ] корневой `docker-compose.yml` обновлён.

---

**Вопросы — в отдельном сообщении до начала работы, если что-то неясно.** Лучше спросить сейчас, чем переделывать.
