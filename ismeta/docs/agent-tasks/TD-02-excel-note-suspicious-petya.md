# ТЗ: TD-02 — Excel columns + Estimate.note + pages_summary в import (IS-Петя)

**Команда:** IS-Петя.
**Ветка:** `ismeta/td-02-excel-note-suspicious`.
**Worktree:** `ERP_Avgust_is_petya_td02`.
**Приоритет:** 🟢 tech debt.
**Срок:** 0.5 дня (3 независимых пункта).

---

## Контекст

QA-цикл 10 заходов, pause после заход 1/10 (main @ `f1fa6a3`). Пока PO тестирует заход 2/10, закрываем follow-up задачи:

1. **DEV-BACKLOG #28** — при скачивании Excel (`/export.xlsx`) столбец «Модель» не формируется, только «Наименование». Вместе с Моделью проверить остальные новые поля из UI-04.
2. **DEV-BACKLOG #29** — backend-часть стикера-заметки: `Estimate.note: TextField`, миграция, сериализатор.
3. **Follow-up UI-10** — backend должен прокинуть `pages_summary` из recognition response через `/import/pdf/` endpoint, чтобы фронт мог показать suspicious warning (это блокер для Феди UI-10).

---

## Задача 1 — Excel exporter + importer с новыми полями (#28)

**Файлы:**
- `ismeta/backend/apps/estimate/excel/exporter.py`
- `ismeta/backend/apps/estimate/excel/importer.py`
- `ismeta/backend/apps/estimate/tests/test_excel_export.py`
- `ismeta/backend/apps/estimate/tests/test_excel_import.py`

### 1.1 — Audit

Запусти `git log --oneline ismeta/backend/apps/estimate/excel/` + прочитай оба файла. Определи какие колонки сейчас есть, каких нет.

**Ожидаемый минимум полей в `.xlsx`:**
- Стандартные: `name`, `unit`, `quantity`, `equipment_price`, `material_price`, `work_price`, `total`.
- Новые из UI-04 / E15.04 / E15.05: `tech_specs.model_name` (**Модель**), `tech_specs.manufacturer` (**Производитель**), `tech_specs.brand` (**Бренд**), `tech_specs.comments` (**Примечание**), `tech_specs.system_prefix` (**Система**).
- `page_number` / `source_page` — опционально, для traceability, если не мешает.

### 1.2 — Exporter

В `exporter.py::export_estimate_xlsx` (или как метод называется) добавить новые колонки **между «Наименование» и «Ед. изм.»**:
1. Наименование
2. **Модель** (model_name) ← NEW
3. **Производитель** (manufacturer) ← NEW, опционально показывать
4. **Бренд** (brand) ← NEW
5. Ед. изм.
6. Кол-во
7. ...цены...
8. **Примечание** (comments) ← NEW, в конце

**Заполнение:** читать `item.tech_specs` как dict, fallback на пустую строку если ключ отсутствует.

**Backwards compat:** если tech_specs пуст — ячейки пустые, не ломать старый экспорт.

### 1.3 — Importer

`importer.py::import_xlsx_to_estimate` (или эквивалент) — симметрично читать новые колонки и писать в `tech_specs` dict при создании items. Если колонки нет в excel — игнорировать (старый формат).

### 1.4 — Тесты

В `test_excel_export.py`:
- `test_export_includes_model_name` — item с `tech_specs.model_name="MOB2600"` → в .xlsx колонка «Модель» = "MOB2600".
- `test_export_includes_manufacturer_brand_comments` — аналогично.
- `test_export_empty_tech_specs_no_crash` — item с `tech_specs={}` → пустые ячейки, не падает.

В `test_excel_import.py`:
- `test_import_reads_model_name_to_tech_specs` — xlsx с колонкой «Модель» → item.tech_specs.model_name заполнен.
- `test_import_legacy_format_still_works` — xlsx без новых колонок (старый формат) → импорт проходит.

---

## Задача 2 — Estimate.note field (#29 backend)

**Файлы:**
- `ismeta/backend/apps/estimate/models.py`
- `ismeta/backend/apps/estimate/serializers.py`
- `ismeta/backend/apps/estimate/services/estimate_service.py` (если update_estimate использует whitelist)
- `ismeta/backend/apps/estimate/migrations/NNNN_estimate_note.py`
- `ismeta/backend/apps/estimate/tests/test_api.py`

### 2.1 — Модель

В `Estimate` (`models.py:~25`) добавить:
```python
note = models.TextField(blank=True, default="")
```

Никаких индексов, никаких constraints. TextField достаточно для заметок до ~10KB.

### 2.2 — Миграция

```bash
cd ismeta/backend && python manage.py makemigrations estimate
```

Проверь что миграция только добавляет колонку `note TEXT NOT NULL DEFAULT ''` — **не должно быть** RunPython, data-миграции, alter других полей. Если видишь что-то лишнее — разберись и сделай чистую миграцию.

### 2.3 — Сериализатор + whitelist

В `EstimateSerializer` (`serializers.py`) добавить `"note"` в `fields`.

Если в `update_estimate` (в services) есть whitelist колонок UPDATE — добавить туда `"note"` **с тем же паттерном как UI-09 data-loss fix** (см. `estimate_service.py:UPDATABLE_COLUMNS`).

### 2.4 — Тесты

В `test_api.py`:
- `test_patch_estimate_note` — PATCH `/api/v1/estimates/:id/` `{"note": "купить провод ВВГ до пятницы"}` → 200, item.note сохранён в БД.
- `test_patch_estimate_empty_note` — `{"note": ""}` → 200, note пусто.
- `test_estimate_note_in_get_response` — GET `/api/v1/estimates/:id/` → response.note есть в JSON.

---

## Задача 3 — pages_summary в /import/pdf/ response (блокер UI-10)

**Файл:** `ismeta/backend/apps/estimate/services/pdf_import_service.py`.

Сейчас `parse_pdf_via_recognition` возвращает:
```python
{
    "items": response.get("items", []),
    "status": response.get("status", "error"),
    "errors": response.get("errors", []),
    "pages_total": stats.get("total", 0),
    "pages_processed": stats.get("processed", 0),
    "pages_skipped": stats.get("skipped", 0),
}
```

Расширить на:
```python
{
    ...existing,
    "pages_summary": response.get("pages_summary", []),
}
```

И `apply_parsed_items` возвращает:
```python
{
    "created": created,
    "sections": len(sections_map),
}
```

Расширить на:
```python
{
    "created": created,
    "sections": len(sections_map),
    "pages_summary": pages_summary,  # прокинуто из parse_pdf_via_recognition
}
```

Для этого сигнатура `apply_parsed_items(estimate_id, workspace_id, parsed_items, pages_summary=None)` принимает optional `pages_summary`, вьюха `pdf_views.py::pdf_import` прокидывает оба из `parsed_result`.

**Минимальный тест:** `test_pdf_import.py::test_pdf_import_returns_pages_summary` — mock recognition возвращает pages_summary, ответ `/import/pdf/` содержит этот список.

---

## Приёмочные критерии

1. ✅ `pytest apps/estimate/tests/test_excel_export.py apps/estimate/tests/test_excel_import.py -x` — все passing + 4 новых теста.
2. ✅ `pytest apps/estimate/tests/test_api.py -k "note" -x` — 3 новых теста passing.
3. ✅ `pytest apps/estimate/tests/test_pdf_import.py -k "pages_summary" -x` — 1 новый тест passing.
4. ✅ Миграция `0NNN_estimate_note.py` — минимальная (только добавить колонку), применяется без ошибок.
5. ✅ Реальная экспорт/импорт смены с model/comments → round-trip проверен (ручной smoke).
6. ✅ `mypy apps/estimate/` — 0 errors (если проект использует mypy — проверить через `grep -r "mypy" Makefile`).
7. ✅ `ruff check apps/estimate/` — 0 errors.

---

## Ограничения

- **НЕ трогать** recognition service — это uplift только backend ismeta + миграция.
- **НЕ менять** структуру `tech_specs` в БД — работает как dict, только читаем/пишем ключи.
- **НЕ трогать** Estimate версионирование (`version_number`, `parent_version`) — поле `note` просто перезаписывается, история не нужна (см. DEV-BACKLOG #29 scope PO).
- Миграция **идемпотентна** — если запустить дважды, не падает.
- Никаких breaking changes в API `/export.xlsx` и `/import/xlsx/` — старый формат (без новых колонок) должен продолжать работать.

---

## Формат отчёта

1. Ветка и hash.
2. Три список: (а) Excel колонки добавлены, (б) Estimate.note миграция + API, (в) pages_summary в import response.
3. pytest + mypy + ruff статусы.
4. Ручная проверка: смоук smart-scenarий export → import → сверка что tech_specs сохранился.

---

## Start-prompt для Пети (копировать)

```
Добро пожаловать. Ты — IS-Петя, backend AI-программист проекта
ISMeta. Работаешь автономно в своей Claude-сессии.

ПЕРВЫМ ДЕЛОМ (в таком порядке):

1. Прочитай онбординг полностью:
   ismeta/docs/agent-tasks/ONBOARDING.md

   Там: кто мы, что за проект, процесс работы, конвенции
   кода, shared-файлы, правила. Не пропускай — там написано
   всё что нужно знать до старта задачи.

2. Прочитай своё ТЗ:
   ismeta/docs/agent-tasks/TD-02-excel-note-suspicious-petya.md

Рабочая директория (уже в ней):
  /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_petya_td02

Твоя ветка: ismeta/td-02-excel-note-suspicious
(создана от origin/main @ f1fa6a3).

Текущий контекст: QA-цикл 10 заходов PO. Заход 1/10 закрыт
вчера (spec-ov2 = 153/153 items). Сейчас PO тестирует 2/10,
пока идёт тестирование — мы чистим накопленный backlog.

Суть TD-02 — три независимых пункта tech debt:
 (1) Excel exporter/importer с новыми полями UI-04
     (Модель/Производитель/Бренд/Примечание/Система из tech_specs)
 (2) поле Estimate.note + миграция + API (backend-часть стикера)
 (3) pages_summary прокинуть в response /import/pdf/ endpoint
     (это блокирует задачу UI-10 Феди, сделай раньше)

Работай строго по ТЗ, не расширяй scope. В конце коммити в свою
ветку (git push origin ismeta/td-02-excel-note-suspicious),
пиши отчёт по формату из ТЗ — Андрей принесёт его тех-лиду
Claude на ревью.

Вопросы — пиши Андрею (PO). Напрямую с тех-лидом не общаешься.
```
