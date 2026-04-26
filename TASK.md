# TASK — Ф8A frontend — UI каталога моделей и брендов AC Rating

## Цель

Создать раздел `HVAC-Рейтинг` в боковом меню ERP с двумя главными страницами:
- `/hvac-rating/models/` — каталог моделей кондиционеров (CRUD)
- `/hvac-rating/brands/` — справочник брендов (CRUD + actions)

Backend уже готов (Ф8A backend смержен): admin API под `/api/hvac/rating/...`.
Ты пишешь UI на готовые endpoints. Стиль — консистентно с существующим
ERP-админ-разделом HVAC (см. BRIEF.md).

---

## ⚠️ Важно: проверяй фактический код

Уроком прошлой фазы (Ф8A backend): не угадывай схему API/моделей по памяти.
Перед написанием каждого сериализатора — открой `backend/ac_catalog/admin_serializers.py`
и `backend/ac_brands/admin_serializers.py` и сверь поля.

Точные endpoints — в `backend/ac_catalog/admin_urls.py`. Поведение — в
`backend/ac_catalog/admin_views.py` и `backend/ac_brands/admin_views.py`
(особенно nested sync для photos/suppliers/raw_values/regions).

Если найдёшь расхождение TASK ↔ код — пинг в чат, не угадывай.

---

## 1. Sidebar — добавить блок «HVAC-Рейтинг»

Файл: `frontend/components/erp/components/Layout.tsx`.

После текущего блока `{ id: 'hvac', label: 'HVAC-новости', ... }` (строка ~225)
добавить новый блок:

```tsx
// 11. HVAC-РЕЙТИНГ (рейтинг кондиционеров для портала hvac-info.com)
{
  id: 'hvac-rating',
  label: 'HVAC-Рейтинг',
  icon: <BarChart3 className="w-5 h-5" />,
  path: '/hvac-rating',
  section: 'dashboard',
  children: [
    { id: 'hvac-rating-models',       label: 'Модели',          icon: <Package className="w-4 h-4" />,    path: '/hvac-rating/models',       section: 'dashboard' },
    { id: 'hvac-rating-brands',       label: 'Бренды',          icon: <Building2 className="w-4 h-4" />,  path: '/hvac-rating/brands',       section: 'dashboard' },
  ],
},
```

Также добавь в pathToParent breadcrumbs (~строка 401):
```ts
pathToParent['hvac-rating/models'] = { label: 'HVAC-Рейтинг', path: '/hvac-rating/models' };
pathToParent['hvac-rating/models/create'] = { label: 'Модели', path: '/hvac-rating/models' };
pathToParent['hvac-rating/models/edit'] = { label: 'Модели', path: '/hvac-rating/models' };
pathToParent['hvac-rating/brands'] = { label: 'HVAC-Рейтинг', path: '/hvac-rating/brands' };
pathToParent['hvac-rating/brands/create'] = { label: 'Бренды', path: '/hvac-rating/brands' };
pathToParent['hvac-rating/brands/edit'] = { label: 'Бренды', path: '/hvac-rating/brands' };
```

В Ф8B/C добавятся `criteria`, `methodology`, `presets`, `reviews`, `submissions`
— но в этой фазе только `models` и `brands`.

`Layout.tsx` — **shared file** с командой ISMeta. Перед commit: пинг
«добавляю block hvac-rating в sidebar».

---

## 2. Routes (Next.js App Router)

Создай thin-wrapper файлы в `frontend/app/erp/hvac-rating/...` (паттерн как
`frontend/app/erp/hvac/news/...` — `'use client'` + импорт компонента-страницы):

```
frontend/app/erp/hvac-rating/
  models/
    page.tsx                    → ACModelsPage
    create/page.tsx             → ACModelEditor (mode="create")
    edit/[id]/page.tsx          → ACModelEditor (mode="edit", id из params)
  brands/
    page.tsx                    → ACBrandsPage
    create/page.tsx             → ACBrandEditor (mode="create")
    edit/[id]/page.tsx          → ACBrandEditor (mode="edit", id из params)
```

Каждый — буквально 6 строк:
```tsx
'use client';
import ACModelsPage from '@/components/hvac/pages/ACModelsPage';
export default function HvacRatingModelsPage() {
  return <ACModelsPage />;
}
```

---

## 3. Service-слой

Создай **новый** сервис: `frontend/components/hvac/services/acRatingService.ts`
(не путать с `ratingService.ts` — тот для рейтинга **новостей** через AI).

Используй `apiClient` из `./apiClient.ts` — он автоматически прокидывает JWT.

```ts
import apiClient from './apiClient';
import type {
  ACModelListItem, ACModelDetail, ACModelCreate, ACModelUpdate,
  ACBrand, ACBrandCreate, ACBrandUpdate,
  EquipmentType, RegionChoice,
  ACModelPhoto,
} from './acRatingTypes';

const acRatingService = {
  // models
  getModels: (params?: ModelsListParams) => apiClient.get('/hvac/rating/models/', { params }),
  getModel: (id: number) => apiClient.get(`/hvac/rating/models/${id}/`),
  createModel: (payload: ACModelCreate) => apiClient.post('/hvac/rating/models/', payload),
  updateModel: (id: number, payload: ACModelUpdate) => apiClient.patch(`/hvac/rating/models/${id}/`, payload),
  deleteModel: (id: number) => apiClient.delete(`/hvac/rating/models/${id}/`),
  recalculateModel: (id: number) => apiClient.post(`/hvac/rating/models/${id}/recalculate/`),

  // photos
  getModelPhotos: (modelId: number) => apiClient.get(`/hvac/rating/models/${modelId}/photos/`),
  uploadModelPhoto: (modelId: number, image: File, alt?: string, order?: number) => {
    const fd = new FormData();
    fd.append('image', image);
    if (alt !== undefined) fd.append('alt', alt);
    if (order !== undefined) fd.append('order', String(order));
    return apiClient.post(`/hvac/rating/models/${modelId}/photos/`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  updateModelPhoto: (modelId: number, photoId: number, payload: { alt?: string; order?: number }) =>
    apiClient.patch(`/hvac/rating/models/${modelId}/photos/${photoId}/`, payload),
  deleteModelPhoto: (modelId: number, photoId: number) =>
    apiClient.delete(`/hvac/rating/models/${modelId}/photos/${photoId}/`),
  reorderModelPhotos: (modelId: number, ids: number[]) =>
    apiClient.post(`/hvac/rating/models/${modelId}/photos/reorder/`, { ids }),

  // brands
  getBrands: (params?: BrandsListParams) => apiClient.get('/hvac/rating/brands/', { params }),
  getBrand: (id: number) => apiClient.get(`/hvac/rating/brands/${id}/`),
  createBrand: (payload: FormData) => apiClient.post('/hvac/rating/brands/', payload, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  updateBrand: (id: number, payload: FormData) => apiClient.patch(`/hvac/rating/brands/${id}/`, payload, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  deleteBrand: (id: number) => apiClient.delete(`/hvac/rating/brands/${id}/`),
  normalizeBrandLogos: (brand_ids?: number[]) =>
    apiClient.post('/hvac/rating/brands/normalize-logos/', brand_ids ? { brand_ids } : {}),
  generateDarkLogos: (brand_ids?: number[]) =>
    apiClient.post('/hvac/rating/brands/generate-dark-logos/', brand_ids ? { brand_ids } : {}),

  // справочники
  getEquipmentTypes: () => apiClient.get('/hvac/rating/equipment-types/'),
  getRegions: () => apiClient.get('/hvac/rating/regions/'),
};

export default acRatingService;
```

(Сигнатуры — направление, не строгий шаблон. Адаптируй под фактические ответы
из backend.)

---

## 4. Типы

Создай `frontend/components/hvac/services/acRatingTypes.ts` — TypeScript
интерфейсы под фактические сериализаторы.

**ACModel — list-сериализатор** (`AdminACModelListSerializer`, поля строго
из `backend/ac_catalog/admin_serializers.py:128`):

```ts
export interface ACModelListItem {
  id: number;
  brand_id: number;
  brand_name: string;
  series: string;
  inner_unit: string;
  outer_unit: string;
  nominal_capacity: number | null;
  total_index: number;
  publish_status: 'draft' | 'review' | 'published' | 'archived';
  is_ad: boolean;
  ad_position: number | null;
  primary_photo_url: string;
  photos_count: number;
  region_codes: string[];
  price: string | null;       // DRF DecimalField → string
  created_at: string;
  updated_at: string;
}
```

**ACModel — detail-сериализатор** (`AdminACModelDetailSerializer`):

```ts
export interface ACModelDetail {
  id: number;
  slug: string;
  brand: number;                     // FK id (writable)
  brand_detail: ACBrand;             // nested read-only
  series: string;
  inner_unit: string;
  outer_unit: string;
  nominal_capacity: number | null;
  equipment_type: number | null;
  publish_status: 'draft' | 'review' | 'published' | 'archived';
  total_index: number;
  youtube_url: string;
  rutube_url: string;
  vk_url: string;
  price: string | null;
  pros_text: string;
  cons_text: string;
  is_ad: boolean;
  ad_position: number | null;
  editorial_lede: string;
  editorial_body: string;
  editorial_quote: string;
  editorial_quote_author: string;
  inner_unit_dimensions: string;
  inner_unit_weight_kg: string | null;
  outer_unit_dimensions: string;
  outer_unit_weight_kg: string | null;
  photos: ACModelPhotoNested[];
  suppliers: ACModelSupplier[];
  raw_values: ACModelRawValue[];
  region_codes: string[];            // в GET — массив; в PATCH — write-only массив
  created_at: string;
  updated_at: string;
}

export interface ACModelPhotoNested {
  id: number;
  image_url: string;
  alt: string;
  order: number;
}

export interface ACModelSupplier {
  id?: number;                       // writable; отсутствует = новый
  name: string;
  url: string;
  order: number;
  price: string | null;
  city: string;
  rating: string | null;             // 0.0–5.0
  availability: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';
  availability_display: string;      // read-only
  note: string;
}

export interface ACModelRawValue {
  id?: number;
  criterion_code: string;
  criterion_name: string;            // read-only
  raw_value: string;
  numeric_value: number | null;
  compressor_model: string;
  source: string;
  source_url: string;
  comment: string;
  verification_status: string;
  lab_status: string;
}
```

**Brand:**
```ts
export interface ACBrand {
  id: number;
  name: string;
  logo: string;                      // upload-path
  logo_dark: string | null;
  logo_url: string;                  // полный URL
  logo_dark_url: string;
  is_active: boolean;
  origin_class: number | null;
  origin_class_name: string | null;
  sales_start_year_ru: number | null;
  models_count: number;
  created_at: string;
  updated_at: string;
}
```

**EquipmentType, Region:**
```ts
export interface EquipmentType {
  id: number;
  name: string;
}

export interface RegionChoice {
  code: string;     // 'ru' | 'eu'
  label: string;
}
```

---

## 5. ACModelsPage (`frontend/components/hvac/pages/ACModelsPage.tsx`)

**Шапка:**
- Title «Каталог моделей» (h1)
- Кнопка «Добавить модель» → `next/link` на `/hvac-rating/models/create/`
- Счётчик «<n> моделей» (после загрузки)

**Фильтры (строка над таблицей):**
- `Select brand` — multi-select по списку брендов (`acRatingService.getBrands()`)
- `Select publish_status` — Все / Черновик / На проверке / Опубликован / В архиве
- `Input search` — debounce 300ms, поиск по `inner_unit/outer_unit/series/brand__name`
- `Select region` — Все / Россия (ru) / Европа (eu) — из `getRegions()`
- Кнопка «Сбросить фильтры»

**Таблица** (компонент `Table` из shadcn):
- Колонки: чекбокс / фото (40×40 thumb) / Бренд / Inner Unit / Серия / Status (Badge) / Total Index / Реклама (badge если is_ad) / Действия (Edit, Recalc, Delete)
- Click по строке → `/hvac-rating/models/edit/{id}/`
- Кнопка «Recalc» (RefreshCw icon) → `acRatingService.recalculateModel(id)` → toast.success c новым total_index
- Кнопка «Delete» → AlertDialog confirm → `deleteModel`

**Bulk-actions** (отображаются когда selectedIds.length > 0):
- «Опубликовать выбранные» — для каждого `updateModel(id, { publish_status: 'published' })` (Promise.all)
- «В черновики» — same with 'draft'
- «В архив» — 'archived'
- «Удалить выбранные» — AlertDialog confirm + Promise.all delete

**Пагинация:** Если backend возвращает paginated response (DRF default) — page-by-page кнопкой «Загрузить ещё» (как в NewsList.tsx). Если возвращается plain list — без paginate.

**Empty / loading / error states:**
- Loading: skeleton через placeholder Card
- Empty: Card с текстом «Моделей пока нет» + кнопка «Добавить первую»
- Error: ApiErrorBanner (`frontend/components/hvac/components/ApiErrorBanner.tsx`)

---

## 6. ACModelEditor (`frontend/components/hvac/pages/ACModelEditor.tsx`)

Большая форма с табами (`Tabs` из shadcn). Mode = 'create' | 'edit'.

**Табы:**

1. **Основное:**
   - Brand (`Select` через `getBrands()` для опций, value = brand_id)
   - Series (`Input`)
   - Inner Unit (`Input`, required)
   - Outer Unit (`Input`)
   - Nominal Capacity (Watts) (`Input` type=number)
   - Equipment Type (`Select` через `getEquipmentTypes()`)
   - Publish Status (`Select`: draft / review / published / archived)
   - Price (`Input` type=number, decimals)
   - Region Codes (`MultiSelect` или checkboxes из `getRegions()`)
   - Slug (read-only display, генерируется backend'ом)
   - Total Index (read-only display)

2. **Видео:**
   - YouTube URL, Rutube URL, VK URL (`Input` type=url)

3. **Габариты:**
   - Inner unit dimensions (`Input`, свободный текст «850 × 295 × 189 мм»)
   - Inner unit weight kg (`Input` type=number)
   - Outer unit dimensions, Outer unit weight kg

4. **Обзор (editorial):**
   - Editorial lede (`Textarea`)
   - Editorial body (`Textarea` rows=10, maxLength=5000, со счётчиком)
   - Editorial quote (`Textarea` rows=2)
   - Editorial quote author (`Input`)

5. **Плюсы/Минусы:**
   - Pros text (`Textarea` rows=8)
   - Cons text (`Textarea` rows=8)
   - Кнопка «Сгенерировать через ИИ» — **в Ф8B**, в Ф8A только placeholder

6. **Реклама:**
   - is_ad (`Switch`)
   - ad_position (`Input` type=number, disabled если !is_ad)

7. **Фото** (UI отдельный блок — управление после первого save):
   - В create-режиме: «Сначала сохрани модель — потом добавишь фото» (кнопка disabled).
   - В edit-режиме: список фото thumbs с drag-handle (можно использовать react-dnd или просто кнопки ↑↓), кнопка delete каждой.
   - Кнопка «+ Добавить фото» открывает file-picker (accept image/*). После выбора → `acRatingService.uploadModelPhoto(modelId, file)`.
   - Поле alt-текста для каждого (inline edit или modal).
   - Лимит MAX_PHOTOS=6 — кнопка disabled когда photos.length >= 6.
   - Reorder: при изменении порядка → `reorderModelPhotos(modelId, [ids в новом порядке])`.

8. **Поставщики (Где купить):**
   - Динамический массив `ACModelSupplier` строк.
   - Inline-редактирование: name, url, order, price, city, rating (0–5), availability (Select), note.
   - Кнопка «+ Добавить поставщика», иконка trash для удаления строки.
   - Сабмит формы шлёт массив целиком — backend синхронизирует (см. `_sync_suppliers`).

9. **Параметры (raw_values):**
   - Для каждого критерия методики (получаешь list через `getRawValuesForModel` или по сохранённому массиву) — ряд: criterion_name (read-only) / raw_value (Input) / numeric_value (Input) / source (Input).
   - Это длинный список (~30 критериев). UI: Card-секция с inputs в стиле как `MethodologyForm` или `NewsEditor` для editorial-полей.
   - В Ф8A — только редактирование existing raw_values; добавление новых — в Ф8B вместе с критериями.

**Кнопки внизу:**
- «Сохранить» — submit; в edit-режиме PATCH, в create POST → редирект на `/hvac-rating/models/edit/{id}/`.
- «Удалить» (только в edit) — AlertDialog confirm.
- «Отмена» → router.back().

**Валидация:**
- Inner unit обязательно, brand обязательно.
- Editorial body — maxLength 5000.
- Numeric поля — позволять пустое (`null`).

---

## 7. ACBrandsPage (`frontend/components/hvac/pages/ACBrandsPage.tsx`)

Простая таблица CRUD с двумя action-кнопками наверху.

**Шапка:**
- Title «Бренды (рейтинг кондиционеров)»
- Кнопка «Добавить бренд» → `/hvac-rating/brands/create/`
- Кнопка «Нормализовать логотипы» → confirm → `acRatingService.normalizeBrandLogos()` → toast «Обработано: <n>»
- Кнопка «Сгенерировать тёмные логотипы» → confirm → `acRatingService.generateDarkLogos()` → toast «Сгенерировано: <n>, пропущено цветных: <m>»

**Фильтры:**
- `Select` is_active (Все / Активные / Архивные)
- `Input` search (по name)

**Таблица:**
- Колонки: чекбокс / Логотип (light + dark thumb) / Название / Origin Class / Год начала продаж в РФ / Кол-во моделей / Активен (Switch read-only Badge) / Действия
- Click по строке → edit
- Inline-action buttons: Edit, Delete (с AlertDialog)

**Empty/loading/error** — как в ACModelsPage.

---

## 8. ACBrandEditor (`frontend/components/hvac/pages/ACBrandEditor.tsx`)

Простая форма (без табов — мало полей):

- Name (`Input` required, unique)
- Logo (`Input` type=file, accept image/*) — preview перед save
- Logo dark (`Input` type=file, accept image/*) — preview
- is_active (`Switch`)
- origin_class (`Select` — но опции нужны от backend; пока поле disabled с пометкой «настройка через Django-admin» и read-only-показом текущего значения)
- sales_start_year_ru (`Input` type=number)

Кнопки «Сохранить» / «Удалить» (только в edit) / «Отмена» — как в ACModelEditor.

**Загрузка файлов:** `multipart/form-data`. Если в edit-режиме оба файла не выбраны — отправляй PATCH без полей `logo`/`logo_dark` (backend оставит существующие).

---

## 9. Тесты

Минимум:
- `ACModelsPage.test.tsx` — рендерится, фильтры работают (mock service), bulk-actions запускают батч-запросы.
- `ACBrandsPage.test.tsx` — рендерится, normalize/generate-dark кнопки работают.
- `ACModelEditor.test.tsx` — рендерится create-mode и edit-mode, валидация inner_unit обязателен.

Используй паттерн из `frontend/components/hvac/pages/NewsCategoriesPage.test.tsx`
(@testing-library/react + vitest mocks для service).

---

## 10. Прогон и приёмка

**Прогон (обязательный):**
```bash
cd frontend
npx tsc --noEmit                     # без ошибок
npm test -- ACModels ACBrands ACModel  # все зелёные
npm run lint                          # чисто
```

**Smoke в браузере:**
- `npm run dev` — перейти на `/hvac-rating/models/`
- Залогиниться как staff (если auth нужен) — `mein.ki.assistant@gmail.com` или `admin`
- Проверить:
  - Список моделей загружается
  - Можно открыть редактирование, сохранить
  - Можно создать новую модель
  - Можно загрузить фото (после save новой модели)
  - Filters работают
  - Bulk-actions работают
- `/hvac-rating/brands/`:
  - Список брендов
  - Edit / Create / Delete
  - Кнопки normalize-logos / generate-dark-logos

**Скриншоты** (через Playwright MCP) — для отчёта Андрею:
- Models list
- Models edit (главный таб)
- Brands list
- Brands edit

---

## Что НЕ делаем в этой фазе

- ❌ `/hvac-rating/criteria/`, `/methodology/`, `/presets/`, `/reviews/`, `/submissions/` — Ф8B/C.
- ❌ AI-кнопка «Сгенерировать pros/cons» — placeholder в Ф8A, реализация в Ф8B.
- ❌ Не трогать `frontend/lib/api/services/rating.ts` (это публичный клиент для портала, не админка).
- ❌ Не трогать публичные страницы рейтинга `/rating-split-system/...` — они для покупателей, не админов.
- ❌ Не трогать `/hvac/rating-criteria/`, `/hvac/rating-settings/` — это рейтинг **новостей** через AI (другая система).
- ❌ Не трогать i18n / multilang — пока только русский (CLAUDE.md решение #9).

---

## Известные нюансы

1. **Sidebar `Layout.tsx` — shared file.** Перед коммит-пушем — пинг в чат, чтобы ISMeta не катали merge-конфликт.
2. **`apiClient.ts`** обращается к `API_CONFIG.BASE_URL`. Проверь что префикс `/api/` уже включён, и пути формы `/hvac/rating/models/` (без удвоенного `api/`).
3. **`ImageWithFallback`** для логотипов брендов — переиспользуй из `@/components/common/ImageWithFallback`.
4. **`useHvacAuth`** — checkь что `user?.is_staff === true` для admin-действий. Если нет — disabled кнопки или redirect.
5. **Permissions backend** — staff/superuser проходят, regular user без `marketing` permission получит 403. На UI считай что админ всегда staff (Андрей и Максим).
6. **Photo upload** через FormData — заголовки `Content-Type: multipart/form-data` apiClient не выставит автоматически (он по умолчанию JSON). Передавай явно (см. service-снippet выше).
7. **Auth-токен.** apiClient читает access_token из localStorage. На dev-стенде Андрей залогинен — токен есть.
8. **TypeScript strict** — все nullable поля помечай явно (`number | null`).

---

## Формат отчёта

```
Отчёт — Ф8A frontend (AC-Федя)

Ветка: ac-rating/f8a-frontend (rebased на origin/main)
Коммиты:
  <git log --oneline main..HEAD>

Что сделано:
- ✅ Sidebar entry HVAC-Рейтинг + breadcrumbs (Layout.tsx)
- ✅ Routes /hvac-rating/{models,brands}/{,create,edit/[id]}/
- ✅ acRatingService + acRatingTypes
- ✅ ACModelsPage с фильтрами и bulk-actions
- ✅ ACModelEditor с табами (Основное/Видео/Габариты/Обзор/Плюсы-Минусы/Реклама/Фото/Поставщики/Параметры)
- ✅ ACBrandsPage с normalize/generate-dark actions
- ✅ ACBrandEditor с logo upload
- ✅ <N> тестов

Что НЕ сделано:
- (если есть)

Прогон:
- npx tsc --noEmit: ok
- npm test (новые тесты): X passed
- npm run lint: ok

Скриншоты: [models-list.png, models-edit.png, brands-list.png]

Известные риски:
- ...

Ключевые файлы для ревью:
- frontend/components/hvac/services/acRatingService.ts
- frontend/components/hvac/services/acRatingTypes.ts
- frontend/components/hvac/pages/ACModelsPage.tsx
- frontend/components/hvac/pages/ACModelEditor.tsx
- frontend/components/hvac/pages/ACBrandsPage.tsx
- frontend/components/hvac/pages/ACBrandEditor.tsx
- frontend/components/erp/components/Layout.tsx (правка sidebar)
- frontend/app/erp/hvac-rating/... (6 page.tsx wrapper'ов)
```
