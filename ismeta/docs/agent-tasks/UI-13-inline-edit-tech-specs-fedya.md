# ТЗ: UI-13 — inline-edit для tech_specs.model_name / brand (IS-Федя)

**Команда:** IS-Федя.
**Ветка:** `ismeta/ui-13-inline-edit-tech-specs`.
**Worktree:** `ERP_Avgust_is_fedya_ui13`.
**Приоритет:** 🟡 UX gap (DEV-BACKLOG #11).
**Срок:** 0.5 дня.

---

## Контекст

DEV-BACKLOG #11 — gap редактирования. Сейчас в таблице сметы:
- `name`, `unit`, `quantity`, `equipment_price`, `material_price`, `work_price` — редактируемые через `EditableCell`.
- `tech_specs.model_name`, `tech_specs.brand` — **только display** (UI-04 отображает как подстроку под name).

Пользователь видит «MOB 2600/45-3a», хочет поправить на «MOB 2600/45-3b» → идёт в админку / SQL / Excel round-trip. Это раздражает.

**PO-контекст** (из QA-цикла): «смета = точная копия PDF». После импорта PDF model часто близок к правильному, но требует косметической правки. Inline-edit радикально ускоряет workflow.

Backend уже принимает PATCH `{tech_specs: {...existing, model_name: "новое"}}` (JSONB, не нужно доп. миграций). Нужна только UI-часть.

---

## Задача

### 1. Новая колонка «Модель» в items-table

**Файл:** `ismeta/frontend/components/estimate/items-table.tsx`.

Сейчас в таблице display-mode для model_name — есть как подстрока под name или отдельная колонка (проверь текущее состояние после UI-04).

**Требуется:**

- Отдельная колонка «Модель» с `EditableCell` — справа от «Наименование», до «Ед.изм.».
- Cell читает `item.tech_specs.model_name` (строка, если есть, иначе `""`).
- При коммите редактирования вызывает `itemApi.update(id, { tech_specs: {...existing, model_name: next} }, version, workspaceId)`.
- После успеха — `qc.invalidateQueries(["estimate-items", estimateId])` (как делают остальные cell-editing в этом файле).

**Важно:** при PATCH нужен **merge** с существующим tech_specs, не полная замена. Frontend должен читать текущий `item.tech_specs` и посылать обновлённую копию. Backend не делает deep-merge сам (см. E15-04 реализацию).

### 2. Опционально — колонка «Производитель»

Если в таблице есть свободное место (проверь column widths из UI-08), добавить аналогичную колонку «Производитель» с полем `tech_specs.manufacturer`. Если места нет — отложить в DEV-BACKLOG follow-up.

### 3. Опционально — колонка «Бренд»

Аналогично, но с `tech_specs.brand`. Если PO предпочитает видеть `brand` рядом с name (а не в отдельной колонке) — оставить как есть (display в подстроке) и не добавлять.

**Рекомендация:** сделай **ТОЛЬКО «Модель»** как primary task. Остальные (`manufacturer`, `brand`) — опционально, только если time позволяет и layout не ломается. В отчёте укажи какие добавил и почему.

### 4. EditableCell контракт

Существующий `EditableCell` (`components/estimate/editable-cell.tsx`):
```tsx
<EditableCell
  value={item.tech_specs?.model_name ?? ""}
  onCommit={(next) => updateTechSpec(item, "model_name", next)}
  className="whitespace-normal break-words"  // если name длинный — для согласованности
/>
```

Где `updateTechSpec` — helper:
```tsx
const updateTechSpec = (item: EstimateItem, key: keyof TechSpecs, value: string) => {
  const nextTechSpecs = { ...(item.tech_specs ?? {}), [key]: value };
  updateItemMutation.mutate({
    id: item.id,
    data: { tech_specs: nextTechSpecs },
    version: item.version,
  });
};
```

Проверь что `updateItemMutation` уже существует (см. UI-04 / UI-06). Если нет — реализуй через существующий `itemApi.update`.

### 5. Тесты

**Файл:** `ismeta/frontend/__tests__/inline-edit-tech-specs.test.tsx` (новый).

- `test_model_column_renders_existing_value` — item с tech_specs.model_name="MOB 2600" → ячейка показывает «MOB 2600».
- `test_edit_model_sends_patch_with_merged_tech_specs` — отредактировать model_name → PATCH содержит `tech_specs: { brand: "existing", model_name: "new" }` (merge не перезатирает brand).
- `test_edit_model_empty_value_allowed` — удалить значение полностью (пустая строка) → PATCH проходит с `model_name: ""`.
- `test_save_error_toast` — API возвращает error → toast.error.
- Если добавил `manufacturer` колонку — аналогичные тесты `test_manufacturer_column_*`.

### 6. Визуальная проверка

Dev-server + реальная смета с импортированной PDF (spec-ov2 через UI):
1. Открыть смету с items где есть `tech_specs.model_name`.
2. Кликнуть по ячейке «Модель» → появляется input.
3. Отредактировать → Enter / blur → PATCH → ячейка показывает новое значение.
4. Перезагрузить страницу → значение сохранилось.
5. Попробовать очистить значение → пусто, сохраняется.

Скриншоты «до/после» редактирования — в PR.

---

## Приёмочные критерии

1. ✅ Колонка «Модель» редактируемая через `EditableCell`.
2. ✅ PATCH отправляет **merged** `tech_specs` (brand/manufacturer/comments/system не перезатираются).
3. ✅ Пустое значение допустимо (позволяет «очистить» модель).
4. ✅ Ошибка API → `toast.error` с detail.
5. ✅ Optimistic-lock через `version` (как в других cell-editing в `items-table.tsx`).
6. ✅ vitest зелёные (+ ≥4 новых теста).
7. ✅ tsc + lint clean.
8. ✅ Скриншоты до/после редактирования в отчёте.

---

## Ограничения

- **НЕ трогать** backend (всё готово — PATCH JSONB уже принимается).
- **НЕ делать** deep-merge на backend-стороне (merge делает клиент).
- **НЕ добавлять** редактирование `comments`/`system` в этой задаче — отдельная UI-14, не сейчас.
- **НЕ ломать** UI-04 (brand как подстрока под name — может остаться рядом с новой колонкой, пусть PO сам решит убрать если дублирование мешает).
- **НЕ менять** логику UI-06 (Merge Rows) / UI-09 (sections) / UI-12 (стикер).

---

## Формат отчёта

1. Ветка и hash.
2. Какие колонки добавил (Модель / Производитель / Бренд или только Модель).
3. Скриншоты до/после.
4. vitest + tsc + lint статусы.
5. Ограничения (если `manufacturer` колонка отложена — почему).

---

## Start-prompt для Феди

```
Добро пожаловать. Ты — IS-Федя, frontend AI-программист проекта
ISMeta. Работаешь автономно в своей Claude-сессии.

ПЕРВЫМ ДЕЛОМ (в таком порядке):

1. Прочитай онбординг полностью:
   ismeta/docs/agent-tasks/ONBOARDING.md

2. Прочитай своё ТЗ:
   ismeta/docs/agent-tasks/UI-13-inline-edit-tech-specs-fedya.md

Рабочая директория (уже в ней):
  /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_fedya_ui13

Твоя ветка: ismeta/ui-13-inline-edit-tech-specs
(создана от origin/main с текущими фиксами).

Текущий контекст: QA-цикл 10 заходов PO. Заходы 1/10 и 2/10
закрыты без замечаний. Сейчас PO тестирует 3/10, параллельно
чистим UX-gap'ы из backlog.

Суть UI-13: inline-edit для tech_specs.model_name в таблице
сметы. Сейчас model_name только display (UI-04), редактирование
требует админки / SQL / Excel round-trip. Нужна колонка «Модель»
с EditableCell, PATCH merged tech_specs (не перезатирая brand
и comments).

Backend готов — PATCH items принимает tech_specs JSONB.
Focus — чистый UI + тесты.

Работай строго по ТЗ. После — коммит в свою ветку
(git push origin ismeta/ui-13-inline-edit-tech-specs),
пиши отчёт по формату из ТЗ.

Вопросы — пиши Андрею (PO). Напрямую с тех-лидом не общаешься.
```
