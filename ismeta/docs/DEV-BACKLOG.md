# DEV Backlog — задачи для улучшения dev-ergonomics

Не бизнес-фичи — боль разработчиков/агентов при локальной работе.

## Средний приоритет

### 1. seed_dev_data: обогатить tech_specs
- Сейчас `seed_dev_data` создаёт items с `tech_specs={}` у всех 5 позиций.
- Из-за этого ручную проверку UI-02 (brand/model/подстроки) нельзя сделать сразу после `make ismeta-seed` — нужно вручную лезть в БД и UPDATE.
- Что доделать: в команде `seed_dev_data` добавить для 3–5 items в тестовую смету разные комбинации:
  - оба поля: `{"brand": "MOB", "model_name": "MOB2600/45-3a", "flow": "2600 м³/ч"}`
  - только model: `{"model_name": "500x400"}`
  - только brand: `{"brand": "ExtraLink"}`
  - пустой (для контроля негативного кейса): `{}`
- Один item — с дополнительными произвольными полями (flow/power/class/cooling) — чтобы tooltip tech_specs тоже было чем тестировать.
- Реализация: `backend/apps/estimates/management/commands/seed_dev_data.py` — в цикле создания items прописать `tech_specs=...`.

## Средний приоритет

### 2. PDF import end-to-end с реальным Recognition

- UI-PDF-verify проверен через Playwright MCP + `window.fetch` override (unit-level). Реальный запуск Recognition Service требует `OPENAI_API_KEY` — в dev-среде Феди ключа не было.
- Нужна верификация на stand (prod-like): смета → загрузка реального PDF → Recognition → items с `tech_specs.brand/model_name` → UI-02 подстроки.
- Исполнитель: Андрей (на prod) или любой агент при наличии ключа.

### 3. Унификация контракта ImportResult (Excel vs PDF)

- Сейчас Excel отдаёт `{created, updated, errors}`, PDF через Recognition — `{created, sections, errors, pages_total, pages_processed}`.
- MVP-решение: `updated?: number` optional в общем `ImportResult` type.
- Tech debt: разделить на два type — `ExcelImportResult` и `PdfImportResult`. Разные операции, разные смыслы, общий type вносит путаницу.
- Реализация: `ismeta/frontend/lib/api/types.ts` + соответствующие mappers в `ExcelImportDialog` / `PdfImportDialog`.

## Низкий приоритет

### 4. Playwright MCP screenshot зависание с Radix Dialog

- Стабильно «waiting for fonts to load» после нескольких взаимодействий с открытым Radix Dialog.
- Workaround для ручных верификаций: закрывать Dialog перед `browser_take_screenshot`.
- Долгосрочное решение: прямые Playwright-скрипты (без MCP) для тяжёлых UI-проверок. Или PR в Playwright MCP.

### 5. Mid-session 400 на GET /api/v1/estimates/{id}/ в dev ISMeta backend

- После сотен запросов в одной dev-сессии endpoint детали сметы начинает отвечать 400 Bad Request, хотя endpoint списка возвращает смету с тем же id.
- Возможные причины: workspace-middleware, session state, connection pool exhaustion, cache drift.
- Исполнитель: backend (Петя). Расследовать — нужны логи с момента 400, state middleware, БД-сессии.

## Высокий приоритет

### 6. TechSpecs Pydantic schema drift

- **Контракт schema** (`ismeta/backend/apps/estimate/schemas.py::TechSpecs`): whitelist `manufacturer / model / power_kw / weight_kg / dimensions`.
- **Runtime данные** (Recognition + pdf_import_service + UI-02): `brand / model_name / flow / cooling / source_page / ...` произвольные ключи.
- Сейчас spared только тем, что Pydantic v2 по default делает `extra="ignore"` — но поле `CONTRIBUTING §10.1` декларирует whitelist как контракт, хотя он не соблюдается. Любая смена на `extra="forbid"` или явный `.model_dump()` после `.model_validate()` сломает всё.
- **Решение:**
  - (a) Обновить TechSpecs под реальные поля Recognition (brand, model_name, flow, cooling, power, class, section, material, manufacturer как alias ...) + explicit `model_config = ConfigDict(extra="allow")` для будущих расширений.
  - (b) Или удалить schema если она не даёт ценности (всё равно dict JSONB).
- **Исполнитель:** IS-Петя (backend). Проверить использование `.model_validate` — возможно `.clean()` не вызывается при save через ORM и это мёртвая валидация.

### 7. respx в dev venv пропадает

- При повторных reset/make ismeta-setup пакет `respx>=0.21` в requirements.txt не устанавливается в главный venv (проявлялось у Феди в worktree `ERP_Avgust_is_fedya_seed`).
- Причина неясна — возможно Makefile ismeta-setup использует старый lock или разные venvs в worktrees.
- **Решение:** поправить Makefile / requirements lock, чтобы `make ismeta-backend-install` надёжно тянул все test deps.

### 8. MaterialMatchingService.apply_matches — на ORM + transaction.atomic()

- Сейчас `apps/estimate/matching/materials.py::MaterialMatchingService.apply_matches`
  делает raw `UPDATE estimate_item ... WHERE id = %s` по одному запросу в цикле.
- Для MVP ок (подборов мало, workflow ручной), но при массовом apply появятся
  N+1 roundtrips и нет единой транзакции.
- Что доделать: `EstimateItem.objects.filter(id__in=[...]).update(...)` в
  `transaction.atomic()`, либо `bulk_update(items, ["material_price", "version"])`
  по пачкам; сохранить инкремент `version` (optimistic lock consistent с
  остальным API).
- Исполнитель: backend (Петя), когда будет >100 apply per click.

### 9. match_item → возвращать top-3 для yellow-бакета

- Сейчас `matching/materials.py::match_item` возвращает только топ-1
  кандидат. Для green (≥0.90) это ок — матч уверенный.
- Для yellow (0.70–0.90) оператор в UI должен видеть 2–3 похожих
  материала и выбирать сам. Сейчас если top-1 угадан неверно, оператор
  не знает что ниже по рейтингу было что-то лучше.
- Что доделать: `match_item → match_item_candidates(item, n=3) -> list[MaterialMatch]`.
  В endpoint `/match-materials/` для green сохраняем 1 (auto-apply),
  для yellow отдаём всю тройку с флагом `needs_review=True`.
  Frontend UI (Федя): выпадающий список с вариантами для yellow.
- Исполнитель: backend (Петя), когда Федя начнёт делать UI подтверждения.

## Записано
- 2026-04-20: #1 seed_dev_data tech_specs (UI-03, Федя)
- 2026-04-21: #2–5 (UI-PDF-verify, Федя)
- 2026-04-21: #6–7 (E-SEED-01, Федя — TechSpecs schema drift, respx env)
- 2026-04-21: #8–9 (E-MAT-01 минорные, Петя — apply_matches raw SQL, match_item top-3)
