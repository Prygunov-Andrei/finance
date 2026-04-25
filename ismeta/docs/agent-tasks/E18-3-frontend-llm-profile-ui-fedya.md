# ТЗ: E18-3 — Frontend: LLM-профили в Settings + dropdown в PdfImportDialog + cost display (IS-Федя)

**Команда:** IS-Федя.
**Ветка:** `ismeta/e18-3-llm-profile-ui`.
**Worktree:** `ERP_Avgust_is_fedya_e18_3`.
**Приоритет:** 🟢 feature E18 (продолжение E18-1+E18-2).
**Срок:** ~2 дня.
**Зависимость:** E18-1 (recognition) + E18-2 (Django LLMProfile + CRUD) **должны быть замержены в main**.

---

## Контекст

Master spec: [`ismeta/specs/16-llm-profiles.md`](../../specs/16-llm-profiles.md).
Предыдущие части:
- E18-1: recognition принимает `X-LLM-*` headers, возвращает `llm_costs`.
- E18-2: Django LLMProfile модель + CRUD `/api/v1/llm-profiles/` + ImportLog с cost_usd. Backend проксирует профиль в recognition.

Текущий frontend (`ismeta/frontend/`):
- Next.js 15+ App Router.
- `app/settings/page.tsx` — settings с табами.
- `components/estimate/pdf-import-dialog.tsx` — dialog import.
- `components/ui/` — shadcn primitives.

---

## Задача

### 1. Types

**Файл:** `ismeta/frontend/lib/api/types.ts`.

Добавить:

```typescript
export interface LLMProfile {
  id: number;
  name: string;
  base_url: string;
  api_key_preview: string;  // "***abcd"
  extract_model: string;
  multimodal_model: string;
  classify_model: string;
  vision_supported: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface LLMProfileCreate {
  name: string;
  base_url: string;
  api_key: string;  // only on create/update
  extract_model: string;
  multimodal_model?: string;
  classify_model?: string;
  vision_supported: boolean;
  is_default?: boolean;
}

export interface LLMCallCost {
  model: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  cost_usd: number | null;
}

export interface LLMCosts {
  extract: LLMCallCost | null;
  multimodal: LLMCallCost | null;
  classify: LLMCallCost | null;
  total_usd: number;
}
```

Расширить `PdfImportResult` (UI-14 уже сделал split):
```typescript
export interface PdfImportResult {
  ...existing...
  llm_costs?: LLMCosts;
}
```

### 2. API client

**Файл:** `ismeta/frontend/lib/api/services/llm-profile.ts` (новый).

```typescript
export const llmProfileApi = {
  list: (): Promise<LLMProfile[]> => api.get("/llm-profiles/"),
  retrieve: (id: number): Promise<LLMProfile> => api.get(`/llm-profiles/${id}/`),
  create: (data: LLMProfileCreate): Promise<LLMProfile> => api.post("/llm-profiles/", data),
  update: (id: number, data: Partial<LLMProfileCreate>): Promise<LLMProfile> =>
    api.patch(`/llm-profiles/${id}/`, data),
  delete: (id: number): Promise<void> => api.delete(`/llm-profiles/${id}/`),
  setDefault: (id: number): Promise<{ id: number; is_default: boolean }> =>
    api.post(`/llm-profiles/${id}/set-default/`),
  default: (): Promise<LLMProfile> => api.get("/llm-profiles/default/"),
  testConnection: (data: { base_url: string; api_key: string }): Promise<{ ok: boolean; status_code?: number; error?: string }> =>
    api.post("/llm-profiles/test-connection/", data),
};
```

Интегрировать в `lib/api/client.ts` экспорт.

### 3. Settings → tab «Модели LLM»

**Файл:** `app/settings/llm/page.tsx` (новый).

Содержимое:
- **Заголовок:** «Модели распознавания LLM».
- **Описание:** «Настройка профилей LLM для распознавания PDF/Excel-спецификаций. Профиль по умолчанию используется автоматически при загрузке файлов.»
- **Таблица профилей:**
  - Столбцы: `Название`, `Endpoint`, `Модель extract`, `Vision`, `Default`, `Действия` (Edit / Delete / Set as default).
  - Default-профиль помечен `<Badge>Default</Badge>`.
  - Если профилей нет — empty state с кнопкой «Создать первый профиль».
- **Кнопка справа сверху:** «+ Добавить профиль» → открывает modal.

**Modal Create/Edit (`components/settings/llm-profile-form.tsx`):**

Поля:
- `name` (input, required, unique check)
- `base_url` (combobox: предустановленные «OpenAI» = https://api.openai.com, «DeepSeek» = https://api.deepseek.com, «Custom» — text input)
- `api_key` (password input + toggle reveal/hide). На edit — placeholder `***last4`, пустое = оставить как есть.
- `extract_model` (text input, required)
- `multimodal_model` (text input, optional, hint «Если пусто — использовать extract_model»)
- `classify_model` (text input, optional)
- `vision_supported` (switch)
- `is_default` (switch — только в edit-режиме, на create скрытый)
- Кнопка «Тест соединения» — вызывает `testConnection(base_url, api_key)`, показывает ✓/✗ inline.
- Submit → create/update.

При создании первого профиля — сразу `is_default: true`.

### 4. PdfImportDialog — dropdown «Модель распознавания»

**Файл:** `ismeta/frontend/components/estimate/pdf-import-dialog.tsx`.

Сверху над секцией file upload:
```tsx
<Label>Модель распознавания</Label>
<Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
  <SelectTrigger>
    <SelectValue placeholder="Выберите профиль" />
  </SelectTrigger>
  <SelectContent>
    {profiles.map(p => (
      <SelectItem key={p.id} value={String(p.id)}>
        {p.name} {p.is_default && "(default)"}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

`useQuery` тянет `llmProfileApi.list()`, preselected default по `is_default`.

При submit — добавить `llm_profile_id` в FormData:
```typescript
formData.append("llm_profile_id", selectedProfileId);
```

### 5. Cost display после import

**Файл:** тот же `pdf-import-dialog.tsx`.

После успешного import response — отрисовать блок результата:

```tsx
{result && (
  <Alert>
    <CheckCircle2 className="h-4 w-4" />
    <AlertTitle>{result.created} позиций распознано</AlertTitle>
    <AlertDescription>
      <div className="text-sm space-y-1">
        <div>Страниц: {result.pages_processed} / {result.pages_total}</div>
        {result.llm_costs && (
          <>
            <div className="font-medium pt-1">
              Стоимость: ${result.llm_costs.total_usd.toFixed(4)}
            </div>
            {result.llm_costs.extract && (
              <div className="text-xs text-muted-foreground">
                {result.llm_costs.extract.model}:{" "}
                {result.llm_costs.extract.prompt_tokens.toLocaleString()} input +{" "}
                {result.llm_costs.extract.completion_tokens.toLocaleString()} output
                {result.llm_costs.extract.cached_tokens > 0 && (
                  <> ({result.llm_costs.extract.cached_tokens.toLocaleString()} cached)</>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AlertDescription>
  </Alert>
)}
```

Если `llm_costs.total_usd` is null → «Стоимость: —» с tooltip «Цена для модели не настроена».

### 6. Колонка «Цена распознавания» в списке смет (опционально, по согласию PO)

**Файл:** `app/estimates/page.tsx` (или соответствующий list).

Добавить опциональную колонку `Стоимость импорта` — last `ImportLog.cost_usd` для сметы. Toggle через column-visibility settings (UI-08 механизм).

Если есть — показать как `$0.04` с popover-tooltip разбивкой по моделям.

**Если по time-budget не успеваешь** — этот пункт отложить в follow-up. Не блокер приёмки.

### 7. Type-check, lint, тесты

- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- Тесты:
  - `__tests__/llm-profile-form.test.tsx` — submit/validate/test-connection mock.
  - `__tests__/pdf-import-with-profile.test.tsx` — dropdown selection + form submit с llm_profile_id + рендер cost block.

---

## Приёмочные критерии

1. ✅ `app/settings/llm/page.tsx` показывает список профилей и позволяет CRUD.
2. ✅ Modal create/edit валидирует поля, кнопка «Тест соединения» вызывает backend, показывает ✓/✗ inline.
3. ✅ Default-профиль явно помечен, можно сменить через UI (`set-default`).
4. ✅ Удаление default-профиля даёт ошибку 409 — UI показывает понятное сообщение «Сначала установите другой default».
5. ✅ `PdfImportDialog` имеет dropdown «Модель распознавания», preselected = default profile.
6. ✅ После import — блок «Стоимость: $X.XX» с разбивкой по tokens отображается.
7. ✅ tsc/lint/test clean.
8. ✅ Settings page доступна через `/settings/llm`, ссылка добавлена в общий nav settings (если такой существует).

---

## Ограничения

- **НЕ показывать** plain api_key никогда (backend всегда возвращает `***last4` preview).
- **НЕ дублировать** UI primitives — использовать `components/ui/` shadcn (Select, Dialog, Input, Switch, Alert).
- **НЕ хардкодить** список base_url — берём из server response, frontend только подсказывает 2 предустановленных в combobox.
- **НЕ требовать** workspace-scoping в MVP.
- **НЕ ставить** колонку `Стоимость импорта` в estimates list по умолчанию visible — opt-in через column-visibility.

---

## Формат отчёта

1. Ветка + hash.
2. Список изменённых/новых файлов.
3. Скрины:
   - Settings → tab Модели LLM с парой профилей
   - Modal create profile
   - PdfImportDialog с dropdown
   - Результат import с блоком стоимости
4. tsc + test + lint статусы.
5. Open questions если что-то в ТЗ непонятно.

---

## Start-prompt для Феди (копировать)

```
Добро пожаловать. Ты — IS-Федя, frontend AI-программист проекта
ISMeta. Работаешь автономно в своей Claude-сессии.

ПЕРВЫМ ДЕЛОМ:

1. Прочитай онбординг:
   ismeta/docs/agent-tasks/ONBOARDING.md

2. Прочитай master спеку:
   ismeta/specs/16-llm-profiles.md

3. Прочитай своё ТЗ:
   ismeta/docs/agent-tasks/E18-3-frontend-llm-profile-ui-fedya.md

Рабочая директория:
  /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_fedya_e18_3

Ветка: ismeta/e18-3-llm-profile-ui (от origin/main, убедись
что E18-1 + E18-2 замержены).

Контекст: фича E18 — LLM-профили (несколько настроек моделей)
+ цена каждого распознавания в UI. E18-1 (recognition headers)
и E18-2 (Django LLMProfile + CRUD + proxy) уже сделаны другими.
Твоя часть — settings page для CRUD + dropdown в PdfImportDialog
+ блок стоимости в результате import.

Работай строго по ТЗ. После — push в свою ветку, отчёт по формату.

ВАЖНО: для frontend-worktree node_modules часто нет — сделай
symlink или ln -s ../ERP_Avgust/frontend/node_modules. См. memory
feedback_worktree_node_modules.
```
