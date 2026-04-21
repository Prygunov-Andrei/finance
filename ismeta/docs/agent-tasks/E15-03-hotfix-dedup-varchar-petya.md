# ТЗ: E15.03-hotfix — убрать dedup + defensive truncate name (IS-Петя)

**Команда:** IS-Петя.
**Ветка:** `recognition/05-hotfix-dedup-varchar`.
**Worktree:** `ERP_Avgust_is_petya_hotfix_dedup`.
**Приоритет:** 🔴 критичный (блокирует дальнейший QA на реальных PDF).
**Срок:** 30–60 мин.

---

## Контекст

QA-сессия 2 на golden `spec-ov2-152items.pdf` (см. `ismeta/docs/QA-FINDINGS-2026-04-21.md` #4 и #25) вскрыла **два блокера**, которые надо закрыть немедленно — до большого рефактора парсера (E15.04):

### Проблема #25 — dedup суммирует позиции из разных систем

`SpecParser._deduplicate` склеивает items по ключу `(name, model, brand)` и **суммирует quantity**. На реальной спецификации это приводит к ошибочным цифрам: «Огнезащитная клеящая смесь Kleber» в разделе «Общеобменная» (140 кг) и в разделе «Противодымная» (40 кг) сливаются в одну строку с qty=180.

**Решение Андрея (PO):** dedup убираем полностью. Бизнес-правило:

> «Смета = точная копия PDF. Нельзя суммировать одинаковые позиции из разных систем — в этом может быть свой смысл.»

### Проблема #4 — VARCHAR(500) overflow

`EstimateItem.name = CharField(max_length=500)`. При багнутом парсинге (до E15.04) multi-line buffer может дать name длиной >500 символов → `apply_parsed_items` падает с `value too long for type character varying(500)` → **500 Internal Server Error на весь import**.

**Решение:** defensive truncate на стороне ISMeta (`apply_parsed_items`) + warning log.

---

## Задача

### 1. Убрать dedup из Recognition SpecParser

**Файл:** `recognition/app/services/spec_parser.py`.

- Удалить метод `_deduplicate`.
- Удалить вызов `state.items = self._deduplicate(state.items)` в `SpecParser.parse`.
- Удалить вызов в `build_partial` (там тоже `_deduplicate(list(state.items))`) — просто убрать вызов, оставить `items = list(state.items)`.

### 2. Обновить golden test — убрать dedup-assert

**Файл:** `recognition/tests/golden/test_spec_ov2.py`.

- В `test_ov2_spec_text_layer_recall` убрать блок проверки уникальности `(name, model, brand)` (`# Dedup должен выдавать уникальные ...`).
- `MIN_ITEMS` оставить 138 — даже без dedup должно быть ≥138 (без суммирования может оказаться **больше** позиций, так что порог пройдёт).
- Обновить docstring теста — упомянуть «dedup отключён, позиции из разных секций остаются отдельными».

### 3. Обновить тесты test_parse_spec.py (если есть ассерты про сумирование)

**Файл:** `recognition/tests/test_parse_spec.py`.

- Найти тесты которые опираются на склейку одинаковых items → переписать: ожидаем N отдельных позиций вместо суммирования.
- Если тестов нет — добавить **новый** юнит-тест: 2 items с одинаковыми (name, model, brand) но разными section_name → результат содержит 2 позиции, quantity не суммируется.

### 4. Defensive truncate в ISMeta apply_parsed_items

**Файл:** `ismeta/backend/apps/estimate/services/pdf_import_service.py`.

Найти создание `EstimateItem` в `apply_parsed_items`. Перед сохранением:

```python
MAX_ITEM_NAME_LEN = 500  # == EstimateItem.name max_length

raw_name = str(item.get("name", "")).strip()
if len(raw_name) > MAX_ITEM_NAME_LEN:
    logger.warning(
        "pdf_import: item name truncated from %d to %d chars (page=%s): %r...",
        len(raw_name),
        MAX_ITEM_NAME_LEN,
        item.get("page_number"),
        raw_name[:80],
    )
    raw_name = raw_name[:MAX_ITEM_NAME_LEN]
```

**Важно:** это не лечит корень (багнутый парсер E15.03, решение в E15.04) — это предотвращает 500-ошибку и даёт диагностический лог для отладки.

### 5. Добавить тест на truncate

**Файл:** `ismeta/backend/apps/estimate/tests/test_pdf_import.py`.

- В `TestApplyParsedItems`: новый тест `test_apply_truncates_oversized_name` — передаём item с name длиной 600 символов, ожидаем:
  - item создан без exception,
  - `item.name` длиной 500,
  - `logger.warning` содержит «truncated».

### 6. Обновить Recognition docs

**Файл:** `recognition/README.md`.

Найти секцию про dedup (если есть упоминание) → обновить или удалить. Добавить короткий параграф в секцию `/v1/parse/spec`:

> **Дедупликация:** отключена с E15.03-hotfix. Позиции возвращаются 1:1 как в PDF (включая одинаковые `(name, model, brand)` из разных секций). Бизнес-правило — смета = точная копия PDF.

### 7. Обновить DEV-BACKLOG

**Файл:** `ismeta/docs/DEV-BACKLOG.md`.

Добавить запись:

```markdown
### 17. dedup убран — E15.03-hotfix (2026-04-21)

Контекст: бизнес-правило «смета = точная копия PDF». Раньше `_deduplicate` суммировал
одинаковые (name, model, brand) из разных секций → неверные количества в итоге.

Решение: `SpecParser._deduplicate` удалён. Если в будущем понадобится опциональная
дедупликация — делать на UI-уровне с явным UX (конфликт позиций) + section_name в ключе.
```

---

## Приёмочные критерии

1. ✅ `pytest -q` в `recognition/` — все тесты зелёные (ожидаем 84 → возможно +1-2 новых).
2. ✅ `pytest -m golden` — проходит, recall не упал (142+, возможно больше за счёт отсутствия слияния).
3. ✅ `pytest -q` в `ismeta/backend/` — все тесты зелёные (+1 новый на truncate).
4. ✅ `ruff` + `mypy` clean в `recognition/`.
5. ✅ Ручная проверка: загрузить golden PDF через ISMeta UI → видим **≥ 142 позиции, никаких 500**. Если есть одинаковые (name, model, brand) из разных разделов — они **не слиты**.
6. ✅ DEV-BACKLOG обновлён (#17).

---

## Ограничения

- **НЕ менять** модель `EstimateItem` (миграции — отдельное решение, см. CLAUDE.md).
- **НЕ трогать** логику парсинга (`pdf_text.py`, `parse_page_items`) — это задача E15.04.
- **НЕ менять** сигнатуру `SpecParseResponse` (только поведение `items` — теперь без дедупа).
- Этот hotfix **не решает** багов парсинга (#6–#24) — только убирает слияние и предотвращает 500.

---

## Формат отчёта

1. Ветка и хеш последнего коммита.
2. Diff по файлам (кратко — что поменяли).
3. Прогон:
   - `pytest -q` в recognition — N passed.
   - `pytest -m golden` — recall items_count (ожидаем ≥142, возможно больше).
   - `pytest -q` в ismeta/backend — N passed.
   - `ruff` + `mypy` — clean.
4. Готово к мержу.
