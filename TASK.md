# TASK — Ф8B-1 frontend — UI критериев + методики + AI-кнопка

## Цель

Расширить раздел `HVAC-Рейтинг` в ERP-админке:
1. `/hvac-rating/criteria/` — CRUD критериев (с photo upload).
2. `/hvac-rating/methodology/` — список версий методики + кнопка «Активировать».
3. AI-кнопка «Сгенерировать через ИИ» во вкладке «Плюсы/Минусы» редактора модели.

Backend уже готов (Ф8B-1 backend в main): endpoints под `/api/hvac/rating/criteria/`, `/methodologies/`, `/models/{id}/generate-pros-cons/`.

---

## ⚠️ Урок Ф8A

Перед написанием типов и форм — открой **фактические сериализаторы**:
- `backend/ac_methodology/admin_serializers.py` — Criterion, MethodologyVersion, MethodologyCriterion.
- `backend/ac_methodology/admin_views.py` — фильтры/endpoints.
- `backend/ac_catalog/admin_views.py:GenerateProsConsView` — формат response для AI.

---

## 1. Sidebar — расширить блок «HVAC-Рейтинг»

Файл: `frontend/components/erp/components/Layout.tsx`.

Добавить 2 новых children в существующий блок `id: 'hvac-rating'` (твой же из Ф8A, после `models` и `brands`):

```tsx
{ id: 'hvac-rating-criteria', label: 'Критерии', icon: <Sliders className="w-4 h-4" />, path: '/hvac-rating/criteria', section: 'dashboard' },
{ id: 'hvac-rating-methodology', label: 'Методика', icon: <Scale className="w-4 h-4" />, path: '/hvac-rating/methodology', section: 'dashboard' },
```

(Иконки из `lucide-react` — выбирай разумные, можно другие.)

В `pageTitles` добавить:
```ts
'hvac-rating/criteria': 'Критерии (рейтинг)',
'hvac-rating/criteria/create': 'Новый критерий',
'hvac-rating/methodology': 'Методика (рейтинг)',
```

В `pathToParent` (breadcrumbs):
```ts
pathToParent['hvac-rating/criteria'] = { label: 'HVAC-Рейтинг', path: '/hvac-rating/criteria' };
pathToParent['hvac-rating/criteria/create'] = { label: 'Критерии', path: '/hvac-rating/criteria' };
pathToParent['hvac-rating/criteria/edit'] = { label: 'Критерии', path: '/hvac-rating/criteria' };
pathToParent['hvac-rating/methodology'] = { label: 'HVAC-Рейтинг', path: '/hvac-rating/methodology' };
```

`Layout.tsx` — shared с ISMeta. Перед commit-push: пинг «дополняю block hvac-rating новыми children».

---

## 2. Routes (Next.js App Router)

Создай thin-wrappers (как в Ф8A):

```
frontend/app/erp/hvac-rating/
  criteria/
    page.tsx                  → ACCriteriaPage
    create/page.tsx           → ACCriterionEditor (mode="create")
    edit/[id]/page.tsx        → ACCriterionEditor (mode="edit")
  methodology/
    page.tsx                  → ACMethodologyPage   (нет create/edit — read-only + activate)
```

Каждый — буквально 6 строк (как в Ф8A).

---

## 3. Service-слой — расширить `acRatingService.ts`

Добавь методы в существующий `frontend/components/hvac/services/acRatingService.ts`:

```ts
// criteria
getCriteria: (params?: CriteriaListParams) => /* GET /criteria/ */,
getCriterion: (id: number) => /* GET /criteria/{id}/ */,
createCriterion: (payload: FormData | CriterionWritable) => /* POST /criteria/ */,
updateCriterion: (id: number, payload: FormData | CriterionWritable) => /* PATCH /criteria/{id}/ */,
deleteCriterion: (id: number) => /* DELETE /criteria/{id}/ */,

// methodology
getMethodologies: () => /* GET /methodologies/ */,
getMethodology: (id: number) => /* GET /methodologies/{id}/ */,
activateMethodology: (id: number) => /* POST /methodologies/{id}/activate/ */,

// AI
generateModelProsCons: (modelId: number) => /* POST /models/{id}/generate-pros-cons/ */,
```

**FormData vs JSON для photo:** Criterion имеет ImageField `photo` — для multipart upload используй FormData, для остальных update — JSON. Паттерн из ACBrandEditor подойдёт 1-в-1.

**generate-pros-cons response shape** (см. backend):
```ts
{
  model: ACModelDetail,           // полная обновлённая модель
  generated: {
    pros: string[],               // 3 строки
    cons: string[],
  },
  provider: string                // "OpenAIProvider: gpt-4o-mini" (info-only)
}
```

---

## 4. Типы — расширить `acRatingTypes.ts`

Добавь:

```ts
// AdminCriterionListSerializer
export interface ACCriterionListItem {
  id: number;
  code: string;
  name_ru: string;
  photo_url: string;
  unit: string;
  value_type: string;
  group: string;
  is_active: boolean;
  is_key_measurement: boolean;
  methodologies_count: number;
}

// AdminCriterionSerializer (full)
export interface ACCriterion {
  id: number;
  code: string;
  name_ru: string;
  name_en: string;
  name_de: string;
  name_pt: string;
  description_ru: string;
  description_en: string;
  description_de: string;
  description_pt: string;
  unit: string;
  photo: string;
  photo_url: string;
  value_type: ACCriterionValueType;
  group: ACCriterionGroup;
  is_active: boolean;
  is_key_measurement: boolean;
  created_at: string;
  updated_at: string;
}

export type ACCriterionValueType =
  | 'numeric' | 'binary' | 'categorical' | 'custom_scale'
  | 'formula' | 'lab' | 'fallback' | 'brand_age';

export type ACCriterionGroup =
  | 'climate' | 'compressor' | 'acoustics'
  | 'control' | 'dimensions' | 'other';

// AdminMethodologyListSerializer
export interface ACMethodologyListItem {
  id: number;
  version: string;
  name: string;
  is_active: boolean;
  criteria_count: number;
  weight_sum: number | null;
  needs_recalculation: boolean;
  created_at: string;
  updated_at: string;
}

// AdminMethodologyDetailSerializer
export interface ACMethodology {
  id: number;
  version: string;
  name: string;
  description: string;
  tab_description_index: string;
  tab_description_quiet: string;
  tab_description_custom: string;
  is_active: boolean;
  needs_recalculation: boolean;
  methodology_criteria: ACMethodologyCriterion[];
  created_at: string;
  updated_at: string;
}

export interface ACMethodologyCriterion {
  id: number;
  criterion: ACCriterionListItem;     // nested
  scoring_type: string;
  weight: number;
  min_value: number | null;
  median_value: number | null;
  max_value: number | null;
  is_inverted: boolean;
  median_by_capacity: Record<string, number> | null;
  custom_scale_json: unknown;
  formula_json: unknown;
  is_required_lab: boolean;
  is_required_checklist: boolean;
  is_required_catalog: boolean;
  use_in_lab: boolean;
  use_in_checklist: boolean;
  use_in_catalog: boolean;
  region_scope: string;
  is_public: boolean;
  display_order: number;
  is_active: boolean;
}

// generate-pros-cons response
export interface GenerateProsConsResponse {
  model: ACModelDetail;
  generated: { pros: string[]; cons: string[] };
  provider: string;
}
```

Точные значения для `value_type` / `group` — сверяй с `Criterion.ValueType.choices` и `Group.choices` в `backend/ac_methodology/models.py`.

---

## 5. ACCriteriaPage (`frontend/components/hvac/pages/ACCriteriaPage.tsx`)

Простая CRUD-таблица (по образцу `ACBrandsPage.tsx`):

**Шапка:**
- Title «Критерии (рейтинг)»
- Кнопка «Добавить критерий» → `/hvac-rating/criteria/create/`
- **Информационный баннер:** _«Флаг "Ключевой замер" применяется только для критериев, включённых в активную методику. Сейчас активна v1.0 — критерии вне неё игнорируются на фронте.»_ (как `KEY_MEASUREMENT_NOTE` в Django-admin Максима — оставляем подсказку).

**Фильтры:**
- `Select group` — все группы из `ACCriterionGroup`.
- `Select value_type` — все типы.
- `Select` is_active (Все / Активные / Архивные).
- `Switch` is_key_measurement (Только ключевые).
- `Input` search — debounce 300ms по code/name_ru/name_en.

**Таблица:**
- Колонки: code (моноширин) / Photo thumb (40×40) / Название RU / Группа (Badge) / Тип значения / Ед. изм. / Activе (Switch read-only) / Ключевой замер (Star icon если true) / Кол-во методик (number) / Действия (Edit, Delete).

**Empty/loading/error/AlertDialog для delete** — тот же паттерн что в Ф8A.

---

## 6. ACCriterionEditor (`frontend/components/hvac/pages/ACCriterionEditor.tsx`)

Форма по образцу `ACBrandEditor.tsx` (без табов — полей мало).

**Поля:**
- code (Input, required, unique). В edit-режиме disabled — code не меняется (он уникальный идентификатор).
- name_ru (Input, required).
- name_en, name_de, name_pt (Input, optional, аккуратной мини-секцией «Перевод названия»).
- description_ru (Textarea), description_en/de/pt (Textarea, опциональные, в свёрнутой Card-секции «Перевод описания»).
- unit (Input, например «дБ», «кВт», «Вт»).
- value_type (Select из choices).
- group (Select из choices).
- is_active (Switch).
- is_key_measurement (Switch + tooltip с тем же KEY_MEASUREMENT_NOTE).
- photo (Input type=file, accept image/*) + preview (как у Brand). Подпись: _«Фото показывается на странице методики (/rating-split-system/methodology/) в карточке параметра. PNG/JPG до ~2 МБ. Рекомендуется 4:3 или 16:9.»_

**Сабмит:** при наличии photo (новый файл) — multipart FormData; иначе JSON PATCH/POST.

**Delete:** AlertDialog confirm. Backend бросит ProtectedError если критерий привязан к методике — отлови axios 4xx и покажи toast `«Нельзя удалить — параметр используется в методиках»`.

---

## 7. ACMethodologyPage (`frontend/components/hvac/pages/ACMethodologyPage.tsx`)

**Read-only** список версий методики + кнопка «Активировать».

**Шапка:**
- Title «Методика (рейтинг)»
- Информационный баннер: _«Создание новой версии и клонирование доступны через [Django-admin](/admin/ac_methodology/methodologyversion/) — это редкая операция (1-2 раза в год). Здесь — просмотр и активация существующих версий.»_

**Список (Card-список или Table):**
Каждая версия — отдельная Card:
- Заголовок: `name (vversion)` + Badge «АКТИВНА» если is_active.
- Body: criteria_count критериев, weight_sum % (если ≠ 100 — Badge warning «сумма весов ≠ 100%»).
- Если needs_recalculation=true — Badge warning «Требуется пересчёт».
- created_at / updated_at.
- Кнопка «Активировать» (если !is_active) → AlertDialog confirm → `acRatingService.activateMethodology(id)` → toast.success → reload list.

**Click по карточке** → expanded view с nested methodology_criteria (criterion.code, name_ru, weight%, scoring_type, region_scope). Read-only — никаких inputs.

В Ф8B-2/будущей фазе можно сделать редактирование methodology_criteria, но **в Ф8B-1 не делаем**.

---

## 8. AI-кнопка во вкладке Pros/Cons редактора модели

Файл: `frontend/components/hvac/pages/ACModelEditor.tsx` (твой из Ф8A).

В таб `value="proscons"` (строка ~907-934) — заменить placeholder `«Кнопка «Сгенерировать через ИИ» появится в Ф8B.»` на реальную кнопку.

**UX:**
- Кнопка `<Button variant="outline">` с иконкой `Sparkles` из lucide-react: «Сгенерировать через ИИ».
- Disabled если режим create (модель ещё не сохранена).
- Disabled если у модели нет raw_values (можно проверить по `form.raw_values.length === 0`) — показать tooltip «Сначала заполни параметры модели».
- При клике → AlertDialog confirm: «Сгенерировать плюсы/минусы через ИИ? Текущий текст будет перезаписан.» (если pros_text/cons_text непусты).
- При confirm → loading-state на кнопке (Loader2 spin), вызов `acRatingService.generateModelProsCons(modelId)`.
- На успех:
  - Обновить form.pros_text + form.cons_text из `response.generated`.
  - toast.success(`«Готово. Сгенерировано через ${response.provider}.»`).
- На 400 / 503 / network error:
  - toast.error с понятным сообщением:
    - 400 → «Не удалось вычислить scoring — проверьте активную методику и raw_values модели».
    - 503 → «AI временно недоступен. Попробуйте позже».
    - other → «Ошибка генерации (см. консоль)».
  - console.error(detail).

**После успеха** form.pros_text/cons_text заменены AI-генерацией; пользователь может **отредактировать** руками перед save модели. Save модели работает как обычно через PATCH.

---

## 9. Тесты

Минимум:
- `ACCriteriaPage.test.tsx` — рендерится, фильтр по группе шлёт `?group=`, delete вызывает API.
- `ACCriterionEditor.test.tsx` — create/edit-режимы, валидация code/name_ru обязательны, photo upload через FormData.
- `ACMethodologyPage.test.tsx` — рендерится, activate вызывает API.
- В `ACModelEditor.test.tsx` (расширь) — тест для AI-кнопки: mock service, клик → loading → response заменяет form fields.

Vitest + @testing-library/react. Mock `acRatingService` через `vi.mock(...)` или `vi.spyOn(...)`.

---

## 10. Прогон

```bash
cd frontend
npx tsc --noEmit                    # чисто
npm test -- AC                       # все AC* тесты зелёные (включая Ф8A)
```

`next lint` сейчас сломан pre-existing (уже отмечал в Ф8A) — пропускай.

**Smoke** (опционально, если можешь поднять `npm run dev` + backend):
- `/hvac-rating/criteria/` — список, edit, create.
- `/hvac-rating/methodology/` — list + activate (на dev — без вреда).
- `/hvac-rating/models/edit/<id>/` → таб «Плюсы/Минусы» → кнопка ИИ. Если LLMTaskConfig для `ac_pros_cons` не настроен — fallback на default; нужен установленный `OPENAI_API_KEY` в `.env`.

Если smoke невозможен — скажи в отчёте, пройдём вместе на dev-стенде Андрея.

**Скриншоты** через Playwright MCP — желательны для отчёта (3 картинки: criteria-list, methodology-list, model-edit-with-AI-button).

---

## Что НЕ делаем

- ❌ Presets, Reviews, Submissions — Ф8B-2 / Ф8C.
- ❌ Edit methodology_criteria весов через UI — clone остаётся в Django.
- ❌ Не трогать публичный портал /rating-split-system/.
- ❌ Не трогать `lib/api/services/rating.ts` (публичный клиент).

---

## Известные нюансы

1. **`acRatingApiClient`** уже работает с JWT через BFF proxy `/api/ac-rating-admin/...` — переиспользуй (твой же из Ф8A).
2. **Photo upload** — Criterion.photo поле такое же как Brand.logo (ImageField). Если файл новый — multipart FormData; если без файла — JSON PATCH (бэкенд оставит существующее).
3. **AlertDialog для confirm activate** — обязательно (action необратим в плане «нет undo»).
4. **`useHvacAuth`** — checkь `user?.is_staff === true` для admin actions.
5. **AI-кнопка** в create-режиме disabled — модели ещё нет в БД (нет id для endpoint).
6. **provider display** в toast — backend возвращает `"OpenAIProvider: gpt-4o-mini"` — пробрасывай как есть.

---

## Формат отчёта

```
Отчёт — Ф8B-1 frontend (AC-Федя)

Ветка: ac-rating/f8b1-frontend (rebased на origin/main)
Коммиты:
  <git log --oneline main..HEAD>

Что сделано:
- ✅ Sidebar entries: Критерии, Методика + breadcrumbs
- ✅ Routes /hvac-rating/{criteria,methodology}/...
- ✅ acRatingService + acRatingTypes расширены
- ✅ ACCriteriaPage + ACCriterionEditor (с photo upload)
- ✅ ACMethodologyPage (list + activate)
- ✅ AI-кнопка в ACModelEditor (Pros/Cons таб)
- ✅ <N> тестов

Что НЕ сделано:
- (если есть)

Прогон:
- npx tsc --noEmit: ok
- npm test: <X> passed
- (smoke в браузере: ok / не делал)

Скриншоты: [criteria-list.png, methodology-list.png, model-ai-button.png]

Известные риски:
- ...

Ключевые файлы для ревью:
- frontend/components/hvac/pages/ACCriteriaPage.tsx
- frontend/components/hvac/pages/ACCriterionEditor.tsx
- frontend/components/hvac/pages/ACMethodologyPage.tsx
- frontend/components/hvac/pages/ACModelEditor.tsx (+ AI кнопка в proscons-табе)
- frontend/components/hvac/services/acRatingService.ts (+ методы)
- frontend/components/hvac/services/acRatingTypes.ts (+ типы)
- frontend/components/erp/components/Layout.tsx (sidebar children)
- frontend/app/erp/hvac-rating/{criteria,methodology}/... — page.tsx wrapper'ы
```
