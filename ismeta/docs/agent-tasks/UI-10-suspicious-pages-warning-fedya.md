# ТЗ: UI-10 — suspicious pages warning в pdf-import-dialog (IS-Федя)

**Команда:** IS-Федя.
**Ветка:** `ismeta/ui-10-suspicious-pages`.
**Worktree:** `ERP_Avgust_is_fedya_ui10`.
**Приоритет:** 🟡 minor UX follow-up.
**Срок:** 2-3 часа.

---

## Контекст

E15-06 it2 добавил в recognition `pages_summary: PageSummary[]` в response парсинга. Поле `suspicious=true` означает что vision-counter LLM посчитал на странице больше позиций чем парсер выдал, retry не закрыл gap — **высокий риск пропущенных позиций**.

Сейчас фронт это поле получает в ответе `/import/pdf/` (после Петиного TD-02 пункт 3 — см. ниже), но **не показывает пользователю**. PO будет сравнивать 153 vs 150 распознанных и не поймёт **на какой странице искать пропуск**.

**Зависимость:** backend должен сначала прокинуть `pages_summary` через `/import/pdf/` response. Петя делает это в **TD-02 задача 3**. Проверь что коммит Пети уже в main **до старта** (либо мок данные через network interceptor — см. `feedback_playwright_mcp.md`).

---

## Задача

**Файл:** `ismeta/frontend/components/estimate/pdf-import-dialog.tsx`.

### 1. Расширить тип ImportResult

**Файл:** `ismeta/frontend/lib/api/types.ts` — найти `ImportResult` (или как он называется).

```typescript
export interface PageSummary {
  page: number;
  expected_count: number;
  expected_count_vision: number;
  parsed_count: number;
  retried: boolean;
  suspicious: boolean;
}

export interface ImportResult {
  // ... existing
  pages_summary?: PageSummary[];
}
```

Optional — старый backend без TD-02 не вернёт поле, всё ещё работает.

### 2. Warning-банер в stage=result

Текущий `stage=result` блок (~строка 248) показывает «✓ Создано: N позиций». Добавить **сразу после** warning-банер если есть suspicious pages:

```tsx
{result.pages_summary && result.pages_summary.some(p => p.suspicious) && (
  <div
    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
    data-testid="pdf-import-suspicious-warning"
  >
    <div className="flex items-center gap-2 font-medium text-amber-900">
      <AlertTriangle className="h-4 w-4" />
      Возможны пропущенные позиции
    </div>
    <div className="mt-1 text-xs text-amber-800">
      На страницах{" "}
      <span className="font-mono">
        {result.pages_summary
          .filter(p => p.suspicious)
          .map(p => p.page)
          .join(", ")}
      </span>{" "}
      система распознала меньше позиций чем насчитала проверка по
      изображению. Сверьте вручную с оригиналом PDF.
    </div>
    <ul className="mt-2 space-y-0.5 text-xs text-amber-700">
      {result.pages_summary
        .filter(p => p.suspicious)
        .map(p => (
          <li key={p.page}>
            стр. {p.page}: распознано {p.parsed_count}, проверка «видит» {p.expected_count_vision}
            {p.retried ? " (retry не помог)" : ""}
          </li>
        ))}
    </ul>
  </div>
)}
```

Импорт `AlertTriangle` из `lucide-react`.

### 3. Тесты

**Файл:** `ismeta/frontend/__tests__/pdf-import-suspicious.test.tsx` (новый).

- `test_no_warning_when_no_suspicious` — все pages_summary с `suspicious=false` → банер не рендерится.
- `test_warning_when_suspicious` — 2 страницы suspicious → банер есть, список страниц правильный.
- `test_missing_pages_summary_safe` — result без `pages_summary` (legacy backend) → банер не рендерится, не падает.
- `test_retry_not_helped_text` — suspicious с `retried=true` → строка содержит «retry не помог».

Mock ImportResult через обычный render prop.

### 4. Визуальная проверка

Dev-server + spec-ov2:
1. Загрузить PDF через UI.
2. Если на какой-то странице suspicious triggered — увидишь амbre-банер с перечислением страниц.
3. Скриншот в PR.

---

## Приёмочные критерии

1. ✅ ImportResult тип расширен опциональным `pages_summary`.
2. ✅ Warning-банер показывается при **хотя бы одной** suspicious page.
3. ✅ При отсутствии suspicious — банер не мешает (не занимает место).
4. ✅ Legacy backend (без поля) — не ломает UI.
5. ✅ vitest зелёные (+ новый файл, ≥4 теста).
6. ✅ `npx tsc --noEmit` + `npm run lint` clean.
7. ✅ Скриншоты в PR — до/после.

---

## Ограничения

- **НЕ трогать** backend (ждём коммит Пети TD-02).
- **НЕ менять** логику прогресса/hints (stage="uploading"), это отдельная задача UI-11.
- Цветовая схема — **amber** (жёлтая предупреждающая, не красная ошибочная). Это warning, не error.
- **Иконка только lucide-react** — не тащить shadcn `alert` компонент, диалог и так длинный.

---

## Формат отчёта

1. Ветка и hash.
2. Скриншот результата (без suspicious / с suspicious).
3. vitest + tsc + lint статусы.

---

## Start-prompt для Феди (копировать)

```
Добро пожаловать. Ты — IS-Федя, frontend AI-программист проекта
ISMeta. Работаешь автономно в своей Claude-сессии.

ПЕРВЫМ ДЕЛОМ (в таком порядке):

1. Прочитай онбординг полностью:
   ismeta/docs/agent-tasks/ONBOARDING.md

   Там: кто мы, что за проект, процесс работы, конвенции
   кода, shared-файлы, правила. Не пропускай — там написано
   всё что нужно знать до старта задачи.

2. Прочитай своё ТЗ:
   ismeta/docs/agent-tasks/UI-10-suspicious-pages-warning-fedya.md

Рабочая директория (уже в ней):
  /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_fedya_ui10

Твоя ветка: ismeta/ui-10-suspicious-pages
(создана от origin/main @ f1fa6a3).

Текущий контекст: QA-цикл 10 заходов PO. Заход 1/10 закрыт
вчера (spec-ov2 = 153/153 items). Сейчас PO тестирует 2/10,
пока идёт тестирование — мы чистим накопленный backlog.

Суть UI-10: небольшая UX-задача. Recognition уже возвращает
pages_summary[] с полем suspicious=true когда vision-counter
видит позиций больше чем парсер выдал (высокий риск пропущенных
строк). Это надо визуально показать в pdf-import-dialog как
желтый warning-банер с перечислением номеров страниц.

Зависимость: backend TD-02 Пети (пункт 3) прокидывает
pages_summary в response /import/pdf/. Если коммит Пети уже
в main — curl на spec-ov2 через ismeta-backend покажет
актуальную схему. Если ещё нет — делай unit-тесты с mock
ImportResult, финальная визуальная проверка после мержа TD-02.

Работай строго по ТЗ, не расширяй scope. В конце коммити в
свою ветку (git push origin ismeta/ui-10-suspicious-pages),
пиши отчёт по формату из ТЗ — Андрей принесёт его тех-лиду
Claude на ревью.

Вопросы — пиши Андрею (PO). Напрямую с тех-лидом не общаешься.
```
