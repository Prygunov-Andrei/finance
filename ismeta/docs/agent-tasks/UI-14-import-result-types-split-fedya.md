# ТЗ: UI-14 — разделить `ImportResult` на `ExcelImportResult` + `PdfImportResult` (IS-Федя)

**Команда:** IS-Федя.
**Ветка:** `ismeta/ui-14-import-result-types`.
**Worktree:** `ERP_Avgust_is_fedya_ui14`.
**Приоритет:** 🟢 type-safety tech debt (DEV-BACKLOG #3).
**Срок:** ~1 час.

---

## Контекст

DEV-BACKLOG #3: сейчас `ImportResult` в `ismeta/frontend/lib/api/types.ts` — **общий** type для двух разных endpoint'ов:
- `POST /import/excel/` → `{created, updated?, errors, ...}`
- `POST /import/pdf/` → `{created, sections?, errors, pages_total, pages_processed, pages_summary?, ...}`

Общий type со всеми опциональными полями вносит путаницу — handler-ы проверяют поля условно и легко забыть. После UI-10 (pages_summary) и TD-02 стало актуально разделить.

---

## Задача

### 1. Разделить type

**Файл:** `ismeta/frontend/lib/api/types.ts`.

Текущий `ImportResult` → два specific:

```typescript
export interface ExcelImportResult {
  created: number;
  updated: number;
  errors: string[];
}

export interface PdfImportResult {
  created: number;
  sections: number;
  errors: string[];
  pages_total: number;
  pages_processed: number;
  pages_skipped?: number;
  pages_summary?: PageSummary[];
}
```

`PageSummary` остаётся как есть.

**Удалить** `ImportResult` (или deprecate, но чище удалить).

### 2. Обновить потребителей

**Файлы:**
- `ismeta/frontend/components/estimate/import-dialog.tsx` (Excel) — `useMutation<ExcelImportResult>`.
- `ismeta/frontend/components/estimate/pdf-import-dialog.tsx` (PDF) — `useMutation<PdfImportResult>`.
- `ismeta/frontend/lib/api/client.ts` — `importApi.uploadExcel`, `importApi.uploadPdf` возвращают специфичные типы.

Все места использования `.updated`, `.sections`, `.pages_total`, `.pages_summary` должны быть type-safe без `?.`.

### 3. Исправить тесты

Пройди по существующим тестам, может потребоваться обновить mock-объекты:
- `__tests__/pdf-import.test.tsx`
- `__tests__/pdf-import-suspicious.test.tsx`
- `__tests__/inline-edit-tech-specs.test.tsx` (если trogать import handler'ы)
- `__tests__/excel-import.test.tsx` (если есть)

В тестах для PDF-import должны возвращаться `PdfImportResult` fields, для Excel — `ExcelImportResult`.

### 4. Проверки

- `npx tsc --noEmit` — **обязательно clean**. Раздельные типы ловят места где handler путает Excel/PDF поля.
- `npm test` — все зелёные.
- `npm run lint` — clean.

---

## Приёмочные критерии

1. ✅ `ImportResult` заменён на `ExcelImportResult` + `PdfImportResult` в types.ts.
2. ✅ Consumers (import-dialog, pdf-import-dialog, api/client) используют specific типы.
3. ✅ tsc clean — type errors ловятся на компиляции.
4. ✅ vitest — все зелёные (возможно потребуется обновить mock-objects в старых тестах).
5. ✅ lint clean.

---

## Ограничения

- **НЕ трогать** backend (поля в response endpoint'ов не меняются, только клиентские типы).
- **НЕ добавлять** новые поля в `PdfImportResult` без backend-source (уже есть в TD-02 ответ).
- **НЕ менять** логику handler'ов — только типы.

---

## Формат отчёта

1. Ветка + hash.
2. Список изменённых файлов.
3. Список consumers которые пришлось обновить (по именам tsx/ts файлов).
4. Если нашёл type-mismatch в существующем коде (handler использовал поле от другого type) — явно упомяни.
5. tsc + vitest + lint статусы.

---

## Start-prompt для Феди (копировать)

```
Добро пожаловать. Ты — IS-Федя, frontend AI-программист проекта
ISMeta. Работаешь автономно в своей Claude-сессии.

ПЕРВЫМ ДЕЛОМ (в таком порядке):

1. Прочитай онбординг полностью:
   ismeta/docs/agent-tasks/ONBOARDING.md

2. Прочитай своё ТЗ:
   ismeta/docs/agent-tasks/UI-14-import-result-types-split-fedya.md

Рабочая директория (уже в ней):
  /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_fedya_ui14

Твоя ветка: ismeta/ui-14-import-result-types (создана от
origin/main с UI-10/UI-12/UI-13 + TD-02 уже в main).

Текущий контекст: QA-цикл 10 заходов PO. Заходы 1/10 и 2/10
закрыты, 3/10 в процессе. Параллельно чистим последний хвост
backlog'а.

Суть UI-14: type-safety tech debt (DEV-BACKLOG #3). Общий
ImportResult со всеми опциональными полями → два specific
type: ExcelImportResult и PdfImportResult. tsc должен ловить
путаницу Excel/PDF полей.

Работай строго по ТЗ. После — коммит в свою ветку
(git push origin ismeta/ui-14-import-result-types), пиши
отчёт по формату из ТЗ.

Вопросы — пиши Андрею (PO). Напрямую с тех-лидом не общаешься.
```
