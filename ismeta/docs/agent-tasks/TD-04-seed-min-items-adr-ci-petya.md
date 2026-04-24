# ТЗ: TD-04 — seed / LLM_MIN_ITEMS / ADR cost / CI workflow (IS-Петя)

**Команда:** IS-Петя.
**Ветка:** `recognition/14-td-04-polish`.
**Worktree:** `ERP_Avgust_is_petya_td04`.
**Приоритет:** 🟢 tech debt (0.5 дня).

---

## Контекст

QA-цикл 10 заходов, PO тестирует заход 3/10. TD-02 и TD-03 замержены. Параллельно закрываем последние мелкие пункты DEV-BACKLOG перед чистой `main` перед крупными темами (Invoice UI / UI-11 live-progress / E17 Quote).

---

## Пункты

### 1. DEV-BACKLOG #1 — seed_dev_data обогатить tech_specs (30 мин)

**Файл:** `ismeta/backend/apps/workspace/management/commands/seed_dev_data.py` (или где сейчас команда seed).

Сейчас `seed_dev_data` создаёт items с `tech_specs={}` у всех — ручная проверка UI-02 / UI-04 / inline-edit требует SQL `UPDATE`. Нужно в цикле создания items прописать 4-5 вариантов:

```python
TECH_SPECS_VARIANTS = [
    # оба поля + произвольный
    {"brand": "Korf", "model_name": "WNK 100/1", "flow": "2600 м³/ч"},
    # только model
    {"model_name": "500x400"},
    # только brand
    {"brand": "ExtraLink"},
    # manufacturer + comments
    {"manufacturer": "АО «ДКС»", "comments": "+10%", "system": "ПДВ"},
    # пустой (negative control)
    {},
    # power + class (для tooltip полного tech_specs)
    {"brand": "Арктика", "model_name": "АМН-300х100", "power_kw": "7.5", "class": "EI60"},
]
```

Распределить по первым 6 items демо-сметы в `seed_dev_data`.

**Тест:** `test_seed_dev_data.py::test_tech_specs_populated` — проверить что после seed есть items с заполненными `brand`, `model_name`, `manufacturer`, `comments`, `system`, `power_kw`.

### 2. DEV-BACKLOG #20 — LLM_MIN_ITEMS 140→142 (15 мин + 3 прогона)

Ранее on-hold в TD-03 (Петин разумный отказ без сигнала). Сейчас есть свежая база с TD-03 фиксами + regression 150 items в моём прогоне. Попробуй:

1. Сделай **3 curl-прогона** на spec-ov2 подряд с минимальной паузой (чтобы поймать LLM variance):
   ```bash
   for i in 1 2 3; do
     curl -s -X POST http://localhost:8003/v1/parse/spec \
       -H "X-API-Key: dev-recognition-key" \
       -F "file=@ismeta/tests/fixtures/golden/spec-ov2-152items.pdf" \
       | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('items',[])))"
   done
   ```

2. Если **все 3** ≥142 → поднимай `LLM_MIN_ITEMS = 142` в `recognition/tests/golden/test_spec_ov2.py`. Зафиксируй числа в отчёте.

3. Если хотя бы один < 142 → оставь 140, отметь числа в отчёте как «variance всё ещё широк».

**Не делай 10 прогонов** — 3 достаточно. Стоимость ~$0.03 суммарно.

### 3. ADR cost refresh (45 мин)

**Файлы:** `ismeta/docs/adr/0024-*.md`, `0025-*.md`, `0026-*.md` (точные имена проверь в папке).

ADR были написаны до gpt-5.2 switch + prompt caching. Cost-оценки устарели. Обнови:

- Реальные `prompt_tokens` / `completion_tokens` / `cached_tokens` из логов recognition на spec-ov2 (9 pages):
  ```bash
  docker logs ismeta-recognition --since 10m 2>&1 | grep -i "spec_parse llm metrics" | tail -1
  ```
- Стоимость gpt-5.2 на 2026-04-24: https://platform.openai.com/docs/pricing (Input / Output / Cached input). Посмотри точные цифры.
- Пересчитай cost/doc для spec-ov2, spec-aov, spec-tabs, spec-АОВ.
- Обнови ADR таблички с old-gpt-4o → new-gpt-5.2 diff.

**Не переписывай ADR полностью** — только секции «Cost» / «Метрики» / «Проверено на». Архитектурные решения оставить как есть.

### 4. DEV-BACKLOG #23 — CI golden_llm workflow (draft, 30 мин)

**Файл:** `.github/workflows/recognition-golden-llm.yml` (новый).

Создай **drafted** (не активируй) workflow:
- Trigger: `workflow_dispatch` (ручной запуск) + `schedule` cron раз в сутки 02:00 UTC (закомментирован пока PO не даст GitHub secrets).
- Matrix: 3 goldens (spec-ov2, spec-aov, spec-tabs).
- Env vars: `OPENAI_API_KEY` from `${{ secrets.OPENAI_API_KEY_CI }}` (пока nonexistent).
- Steps: checkout → docker-compose build recognition → docker-compose up -d postgres redis → run `pytest -m golden_llm`.
- Artifacts: `pages_summary` JSON на проверку.

**Не включай** schedule cron в первом коммите (только dispatch). PO настроит secrets → раскомментируешь позже в follow-up.

**Проверь:** `act -l` (если есть актл) или GitHub Actions linter что YAML валиден.

---

## Приёмочные критерии

1. ✅ `seed_dev_data` создаёт items с разнообразным tech_specs; тест зелёный.
2. ✅ LLM_MIN_ITEMS — 142 (если 3/3 ≥142) или 140 с отчётом чисел (если variance).
3. ✅ 3 ADR (0024, 0025, 0026) обновлены по cost-секциям, архитектурные решения не тронуты.
4. ✅ `.github/workflows/recognition-golden-llm.yml` существует, YAML валиден, `workflow_dispatch` работает.
5. ✅ `pytest recognition/tests/` + `pytest ismeta/backend/apps/estimate/tests/` — все зелёные.
6. ✅ `ruff check` + `mypy` — clean на всех правленых файлах.

---

## Ограничения

- **НЕ трогать** NORMALIZE_PROMPT_TEMPLATE / spec_parser hot-path / post-process.
- **НЕ активировать** CI cron — PO должен сначала дать secrets.
- **НЕ менять** архитектуру ADR (решения остаются, обновляются только метрики).
- **Shared-файлы** (корневой `.github/` — общий для всего репо) — перед правкой пинг в чате. Если AC Rating команда возражает — отложить CI в follow-up.

---

## Формат отчёта

1. Ветка + hash.
2. По каждому пункту: что сделал, изменения в файлах.
3. 3 curl-прогона на spec-ov2 — числа items и решение по LLM_MIN_ITEMS.
4. ADR diff — какие числа были / стали.
5. CI workflow — ссылка на YAML, `workflow_dispatch` работает (если действительно можно проверить локально).
6. pytest + ruff + mypy статусы.

---

## Start-prompt для Пети (копировать)

```
Добро пожаловать. Ты — IS-Петя, backend AI-программист проекта
ISMeta. Работаешь автономно в своей Claude-сессии.

ПЕРВЫМ ДЕЛОМ (в таком порядке):

1. Прочитай онбординг полностью:
   ismeta/docs/agent-tasks/ONBOARDING.md

2. Прочитай своё ТЗ:
   ismeta/docs/agent-tasks/TD-04-seed-min-items-adr-ci-petya.md

Рабочая директория (уже в ней):
  /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_petya_td04

Твоя ветка: recognition/14-td-04-polish (создана от origin/main
с TD-02 + TD-03 + UI-10/UI-12/UI-13 уже в main).

Текущий контекст: QA-цикл 10 заходов PO. Заходы 1/10 и 2/10
закрыты, 3/10 в процессе. Параллельно чистим последний хвост
backlog'а до крупных тем.

Суть TD-04 — 4 мелких пункта:
 (1) DEV-BACKLOG #1 seed_dev_data обогатить tech_specs
 (2) DEV-BACKLOG #20 LLM_MIN_ITEMS 140→142 (3 прогона для проверки)
 (3) ADR-0024/0025/0026 cost refresh после gpt-5.2 + caching
 (4) DEV-BACKLOG #23 CI golden_llm workflow (draft, без secrets)

Работай строго по ТЗ. После — коммит в свою ветку
(git push origin recognition/14-td-04-polish), пиши отчёт
по формату из ТЗ.

Вопросы — пиши Андрею (PO). Напрямую с тех-лидом не общаешься.
```
