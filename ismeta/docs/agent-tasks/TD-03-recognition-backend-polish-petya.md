# ТЗ: TD-03 — Recognition + backend tech debt batch (IS-Петя)

**Команда:** IS-Петя.
**Ветка:** `recognition/13-td-03-polish`.
**Worktree:** `ERP_Avgust_is_petya_td03`.
**Приоритет:** 🟢 tech debt (параллельно заходу 3/10 QA PO).
**Срок:** 0.5–1 день.

---

## Контекст

QA-цикл 10 заходов, 2/10 закрыто без замечаний (spec-ov2 153/153, spec-АОВ 29/29). Пока PO тестирует заход 3/10 — закрываем мелкие tech-debt пункты из DEV-BACKLOG. Все независимы, не трогают hot-path парсинга.

**Источники:** `ismeta/docs/DEV-BACKLOG.md` пункты #6, #13, #14, #15, #16, #20.

---

## Пункты (по приоритетам)

### 1. #16 — `except Exception` без traceback (10 мин)

**Файл:** `recognition/app/services/spec_parser.py`.

`_process_page` и подобные места — `except Exception as e: logger.warning("msg: %s", e)`. Теряется stack trace — отладка крашей через логи невозможна.

**Fix:** заменить на `logger.exception("msg")` (либо `logger.warning("msg", exc_info=True)` если хотим уровень warning). Автоматически капсулит traceback.

**Тест:** один unit — замокать exception, проверить что `caplog` содержит traceback.

### 2. #14 — `_STAMP_EXACT` короткие токены (20 мин)

**Файл:** `recognition/app/services/pdf_text.py` строка 57, `_STAMP_EXACT` set.

Прочитай set — если есть токены длиной ≤ 3 символов (типа "Изм", "ИП"), они могут случайно задеть реальный контент (например название модели содержит "ИП-"). Это хрупко на не-ГОСТ формах (напр. американский/европейский формат).

**Fix:** либо (а) поднять min-length до 4, либо (б) для коротких токенов требовать точное равенство всей ячейки (уже частично делается — `if s in _STAMP_EXACT`). Проверь логику — возможно достаточно нашего текущего `is_stamp_line` + уже применяется `is_stamp_cell` после column-merge.

Если риск есть — убрать 1-2 самых коротких токена или пометить их как requires-exact-match.

**Тест:** `test_stamp_exact_does_not_match_model_with_short_token` — model='ИП-55' не должна классифицироваться как штамп.

### 3. #15 — `_SECTION_RE` только ОВиК (30 мин)

**Файл:** `recognition/app/services/pdf_text.py` строка 123, `_SECTION_RE`.

Сейчас regex покрывает паттерны из ОВиК-разделов. Если PDF от другой дисциплины (ЭОМ, СК, СС, ИТП, АОВ, ОВ2, ВС, К1…) — может не детектить section-headings.

**Fix:** расширить regex list section-keywords:
- ОВиК: вентиляция, кондиционирование, отопление, теплоснабжение, воздуховоды, клапаны, решётки
- ЭОМ: электроснабжение, освещение, силовое, кабели, провода, щитовое
- СС: слаботочные, охранная сигнализация, пожарная, видеонаблюдение, СКС
- ИТП: теплоснабжение, ГВС, ХВС, оборудование ИТП
- Общее: оборудование, комплектующие, материалы, монтаж, работы

Компактно через OR-группу. Не переусложнять — regex не должен быть монструозным.

**Тест:** `test_section_re_matches_all_disciplines` — 5-6 типовых headings из разных дисциплин.

**Регрессия:** spec-ov2 detections sections должно остаться стабильным (8 разделов).

### 4. #13 — Vision path sticky_parent_name (30 мин)

**Файл:** `recognition/app/services/spec_parser.py::_process_page_sequential` (legacy Vision fallback для pages без text-layer).

Проверь: обновляет ли функция `state.sticky_parent_name` после нормализации? Batch-path (`_process_batch_column_aware`) делает это корректно (строка ~523: `state.sticky_parent_name = norm.new_sticky or state.sticky_parent_name`). В sequential path может быть пропуск.

**Fix:** если пропуск — добавить симметричное обновление после `normalize_via_llm_multimodal`.

**Тест:** `test_vision_path_updates_sticky` — mock Vision response с `new_sticky="Воздуховод"`, проверить что `state.sticky_parent_name` обновился.

### 5. #6 — TechSpecs Pydantic schema drift (30 мин)

**Файл:** `ismeta/backend/apps/estimate/schemas.py::TechSpecs`.

Сейчас whitelist: `manufacturer / model / power_kw / weight_kg / dimensions`. Runtime пишутся ключи: `brand, model_name, flow, cooling, source_page, comments, system, manufacturer, comments`.

**Fix:**
- Добавить в Pydantic model: `model_config = ConfigDict(extra="allow")` (Pydantic v2).
- Расширить whitelist on реальные ключи: `brand, model_name, flow, cooling, source_page, comments, system, manufacturer, power_kw, weight_kg, dimensions`.
- Проверить где `TechSpecs.model_validate` вызывается — возможно мёртвая валидация.

**Тест:**
- `test_tech_specs_accepts_brand_and_model_name` — создать из dict с реальными ключами, не упасть.
- `test_tech_specs_accepts_unknown_key` — extra="allow" — добавить future key `power_supply`, не упасть.

### 6. #20 — LLM_MIN_ITEMS 140 → 142 (5 мин + прогоны)

**Файл:** `recognition/tests/golden/test_spec_ov2.py::LLM_MIN_ITEMS`.

Сейчас 140 (защита от regression — live-прогон 152-153 items после всех фиксов). Прогоны стабильно дают ≥150. Поднять порог до **142** (consistent с уровнем E15.05 it2 и PO подтверждение 153 целевых).

**Подтверждение:** сделай `pytest -m golden_llm test_spec_ov2.py` **3 раза подряд** — если везде ≥142 → поднимай до 142. Если хоть раз падает — 140 оставить, отметить в отчёте.

---

## Приёмочные критерии

1. ✅ `pytest recognition/tests/` — все зелёные.
2. ✅ `pytest ismeta/backend/apps/estimate/tests/` — все зелёные.
3. ✅ `mypy app/` (recognition) + `mypy apps/estimate/` (backend) — 0 errors.
4. ✅ `ruff check app/ tests/` (recognition) + `ruff check apps/estimate/` (backend) — 0 errors.
5. ✅ Regression spec-ov2 через curl — 150+ items, Противопожарные/Огнезащитные/Воздуховоды на местах.
6. ✅ Regression spec-АОВ через curl — 29/29 items, (N)-0,66 в model 12-14, Шпилька в name 26.

---

## Ограничения

- **НЕ трогать** hot-path парсинга (apply_no_qty_merge, cover_bbox_rows, restore_from_bbox_rows, backfill_source_row_index, cross-page continuation).
- **НЕ менять** промпт `NORMALIZE_PROMPT_TEMPLATE` (закрыто в E15-06 it3).
- **НЕ менять** docker-compose.yml (модели gpt-5.2 трогать нельзя).
- **НЕ поднимать** LLM_MIN_ITEMS больше 145 (PO target 153 ± LLM variance).

---

## Формат отчёта

1. Ветка + hash.
2. По каждому пункту: что сделал, какие тесты добавил.
3. Regression curl на spec-ov2 + spec-АОВ: items count, ключевые позиции.
4. pytest + mypy + ruff статусы.
5. Если #20 LLM_MIN_ITEMS остался 140 — объяснить (какой прогон из 3 упал).

---

## Start-prompt для Пети

```
Добро пожаловать. Ты — IS-Петя, backend AI-программист проекта
ISMeta. Работаешь автономно в своей Claude-сессии.

ПЕРВЫМ ДЕЛОМ (в таком порядке):

1. Прочитай онбординг полностью:
   ismeta/docs/agent-tasks/ONBOARDING.md

2. Прочитай своё ТЗ:
   ismeta/docs/agent-tasks/TD-03-recognition-backend-polish-petya.md

Рабочая директория (уже в ней):
  /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_petya_td03

Твоя ветка: recognition/13-td-03-polish
(создана от origin/main с текущими фиксами).

Текущий контекст: QA-цикл 10 заходов PO. Заходы 1/10 и 2/10
закрыты без замечаний (153/153 и 29/29 items). Сейчас PO
тестирует 3/10, пока идёт тестирование — чистим tech debt.

Суть TD-03 — 6 мелких независимых пунктов из DEV-BACKLOG:
 (1) #16 except Exception без traceback → logger.exception
 (2) #14 _STAMP_EXACT short tokens — требуют exact-match
 (3) #15 _SECTION_RE — расширить на ЭОМ/СС/ИТП/АОВ
 (4) #13 Vision path (legacy) не обновляет sticky_parent_name
 (5) #6 TechSpecs Pydantic schema — extra="allow" + реальные ключи
 (6) #20 LLM_MIN_ITEMS 140→142 (после 3 стабильных прогонов)

Работай строго по ТЗ, не расширяй scope. После — коммит в свою
ветку (git push origin recognition/13-td-03-polish), пиши отчёт
по формату из ТЗ.

Вопросы — пиши Андрею (PO). Напрямую с тех-лидом не общаешься.
```
