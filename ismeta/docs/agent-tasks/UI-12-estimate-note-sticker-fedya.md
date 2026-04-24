# ТЗ: UI-12 — стикер-заметка к смете (IS-Федя)

**Команда:** IS-Федя.
**Ветка:** `ismeta/ui-12-estimate-note-sticker`.
**Worktree:** `ERP_Avgust_is_fedya_ui12`.
**Приоритет:** 🟡 nice-to-have.
**Срок:** 2-3 часа.
**Зависимость:** TD-02 Пети (поле `Estimate.note` в API) **должен быть замержен первым**.

---

## Контекст

DEV-BACKLOG #29, запрос PO:
> «При смете нужны какие-то минимальные заметки, буквально одно текстовое поле, которое сохраняется и свободно редактируется — никакой истории — просто заметка (можно для красоты сделать жёлтым листочком, типа стикера).»

Backend-часть сделана в TD-02 (Петя): `Estimate.note: TextField`, PATCH `/api/v1/estimates/:id/` принимает поле.

---

## Задача

### 1. Компонент `<EstimateNote>`

**Файл:** `ismeta/frontend/components/estimate/estimate-note.tsx` (новый).

```tsx
"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { estimateApi, ApiError } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { UUID, Estimate } from "@/lib/api/types";

const AUTOSAVE_DEBOUNCE_MS = 800;
const MAX_NOTE_LEN = 5000;

interface Props {
  estimate: Estimate;
}

export function EstimateNote({ estimate }: Props) {
  const qc = useQueryClient();
  const workspaceId = getWorkspaceId();
  const [value, setValue] = React.useState(estimate.note ?? "");
  const [collapsed, setCollapsed] = React.useState(!estimate.note);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Синхронизация если estimate обновился извне.
  React.useEffect(() => {
    setValue(estimate.note ?? "");
  }, [estimate.note]);

  const save = useMutation({
    mutationFn: (note: string) =>
      estimateApi.update(estimate.id, { note }, workspaceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimate", estimate.id] });
    },
    onError: (e: unknown) => {
      const detail =
        e instanceof ApiError
          ? (e.problem?.detail ?? "Ошибка сохранения")
          : "Ошибка сохранения заметки";
      toast.error(detail);
    },
  });

  const onChange = (next: string) => {
    if (next.length > MAX_NOTE_LEN) next = next.slice(0, MAX_NOTE_LEN);
    setValue(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save.mutate(next), AUTOSAVE_DEBOUNCE_MS);
  };

  React.useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 transition-colors hover:bg-amber-100"
        data-testid="estimate-note-expand"
      >
        <StickyNote className="h-3.5 w-3.5" />
        <span>{value ? "Заметка" : "+ Заметка"}</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "relative w-72 rounded-md border border-amber-300 bg-amber-50 p-2 shadow-sm",
      )}
      data-testid="estimate-note"
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
          <StickyNote className="h-3.5 w-3.5" />
          Заметка
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-xs text-amber-700 hover:text-amber-900"
          data-testid="estimate-note-collapse"
        >
          свернуть
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Напишите что-нибудь (Ctrl+Enter — свернуть)…"
        className="w-full resize-y rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        rows={4}
        maxLength={MAX_NOTE_LEN}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            setCollapsed(true);
          }
        }}
        data-testid="estimate-note-textarea"
      />
      <div className="mt-1 flex items-center justify-between text-[10px] text-amber-700">
        <span>
          {save.isPending ? "Сохраняется…" : save.isSuccess ? "Сохранено" : ""}
        </span>
        <span>
          {value.length} / {MAX_NOTE_LEN}
        </span>
      </div>
    </div>
  );
}
```

**Стилистика:** жёлтый (amber-50/100/300, amber-900 для текста). Shadow-sm. Иконка `StickyNote` из lucide-react.

### 2. Разместить в EstimateHeader

**Файл:** `ismeta/frontend/components/estimate/estimate-header.tsx`.

Добавить `<EstimateNote estimate={estimate} />` справа от заголовка, **сначала в свёрнутом виде** (кнопка «+ Заметка»). При клике разворачивается.

Конкретное место — согласовать с существующим layout'ом header'а (там слева обычно название, справа кнопки «Сохранить»/«Экспорт»/«Импорт»). Разместить заметку **до** правых кнопок чтобы не ломать flex-группы.

### 3. Типы

**Файл:** `ismeta/frontend/lib/api/types.ts`.

В интерфейс `Estimate` добавить:
```typescript
note: string;
```

Обязательное поле (не optional), backend возвращает "" если не задано.

### 4. Тесты

**Файл:** `ismeta/frontend/__tests__/estimate-note.test.tsx` (новый).

- `test_collapsed_shows_add_note_when_empty` — estimate.note="" → кнопка «+ Заметка».
- `test_collapsed_shows_zametka_when_has_value` — estimate.note="text" → кнопка «Заметка».
- `test_expand_on_click` — клик на свёрнутую → показывается textarea.
- `test_typing_triggers_autosave_debounced` — ввод текста → через 800ms `estimateApi.update` вызван с `{note: text}`.
- `test_autosave_debounce_batches` — быстрый ввод нескольких символов → только 1 API-call после последнего ввода.
- `test_max_length_cap` — ввод > 5000 символов → обрезается до 5000.
- `test_ctrl_enter_collapses` — textarea focused → Ctrl+Enter → свёрнуто.
- `test_save_error_toast` — API возвращает ошибку → `toast.error` вызван.

Mock `estimateApi.update` через `vi.spyOn` + react-query `QueryClientProvider`.

### 5. Визуальная проверка

Dev-server + любая смета:
1. Открыть смету — в header справа видна кнопка «+ Заметка».
2. Клик → разворачивается textarea на жёлтом фоне.
3. Ввести текст → через секунду статус «Сохранено» + счётчик символов.
4. Перезагрузить страницу — текст на месте.
5. Свернуть → кнопка показывает «Заметка» (была с текстом).

Скриншоты свёрнутого и развёрнутого — в PR.

---

## Приёмочные критерии

1. ✅ Компонент `<EstimateNote>` создан, с желтой стилизацией (amber-*).
2. ✅ Свёрнутое состояние по умолчанию если note пустая, развёрнутое если есть содержимое → по клику toggle.
3. ✅ Autosave через 800ms debounce, PATCH `/estimates/:id/` `{note}`.
4. ✅ Индикатор «Сохраняется…» / «Сохранено» + счётчик символов.
5. ✅ Cap 5000 символов.
6. ✅ Ctrl/Cmd+Enter в textarea — свернуть.
7. ✅ Placement в EstimateHeader справа до кнопок.
8. ✅ vitest зелёные (≥8 тестов).
9. ✅ tsc + lint clean.
10. ✅ Скриншоты свёрнутого и развёрнутого.

---

## Ограничения

- **НЕ трогать** backend (всё готово в TD-02).
- **НЕ добавлять** историю изменений, draft, undo — это пункт явно исключён PO.
- **НЕ делать** markdown rendering — текстовая заметка, plain text.
- Stickер — **только в шапке сметы**, не на списочной странице estimates.

---

## Формат отчёта

1. Ветка и hash.
2. 2 скриншота (свёрнутое / развёрнутое).
3. vitest + tsc + lint статусы.

---

## Start-prompt для Феди (копировать, только когда TD-02 Пети замержен)

```
Ты IS-Федя, frontend AI-программист проекта ISMeta.

Рабочая директория:
  /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_fedya_ui12

Ветка: ismeta/ui-12-estimate-note-sticker (создана от origin/main
после мержа TD-02 Пети).

ТЗ:
  ismeta/docs/agent-tasks/UI-12-estimate-note-sticker-fedya.md

Требует поле `Estimate.note` в API (делает Петя в TD-02).
Если TD-02 не в main — жди, не начинай.

Работай по ТЗ, не расширяй scope.
```
