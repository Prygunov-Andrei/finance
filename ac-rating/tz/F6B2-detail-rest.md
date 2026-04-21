# ТЗ Фазы Ф6B2 — Детальная страница (часть 2: specs + buy + reviews + related)

**Фаза:** Ф6B2 (frontend, `/ratings/[slug]/`, часть 2)
**Ветка:** `ac-rating/f6b2-detail-rest` (от `main`)
**Зависит от:** Ф6B1 (в main `d5f84f8`), Followups (`07b1e45`), M4 (в main `0e25af7`)
**Оценка:** 1.5-2 дня

## Контекст

Ф6B1 закрыл каркас детальной страницы — hero / media / sticky-nav / overview / criteria / index-viz
(блоки 1-6 по DetailA). В `DetailAnchorNav.tsx` три якоря **задизейблены** (`specs`, `buy`, `reviews`)
— пользователь видит структуру, но клики не работают. Ф6B2 — это оставшиеся блоки 7-10:

- **Specs table** — 42 параметра в 5 группах (дизайн `wf-screens.jsx:510-604`)
- **Where to buy** — до 12 магазинов, city-chips, price-statbar, scatter histogram
  (`wf-screens.jsx:606-715`)
- **Reviews** — сводка со звёздами + гистограмма 5/4/3/2/1, read/write tabs, карточки
  (`wf-screens.jsx:717-860`)
- **Related** — top-4 соседних моделей по rank (`wf-screens.jsx:862-888`)
- **Mobile-версии** для каждой из 4 секций (stacked + bottom-sheet фильтров где нужно)

Плюс — активация якорей `specs/buy/reviews` в `DetailAnchorNav` (сейчас `active: false`).

## Ключевые решения заранее

1. **Specs = `raw_values` + hero-dimensions.** API в detail отдаёт `raw_values` (массив
   34 объектов с `criterion` и `raw_value`). Фронт группирует их по `methodology.criteria[code].group`
   + `group_display`. Плюс 4 поля ACModel (`inner/outer_unit_dimensions + weight_kg`)
   добавляются в группу `dimensions` как отдельные spec-строки. Новых backend-полей не нужно.
2. **Supplier availability rendering.** `availability_display` — готовый русский лейбл (из M4).
   `availability` enum используется только для dot-цвета (green/amber/red/grey).
3. **Price statistics.** Min/median/avg/max считаются **клиентски** на основе
   `suppliers.filter(s => s.price).map(s => Number(s.price))`. Если < 2 цен — блок
   скрывается, показывается warning «недостаточно данных для статистики».
4. **Reviews gaps.** В API нет `verified_purchase`, `helpful_count`, `photos`. В Ф6B2 эти
   элементы дизайна **скрываем** (без хардкод-заглушек). Если Андрей попросит — это M5.
5. **Related = соседи по rank.** Берём `getRatingModels()` (уже загружаются в page.tsx для
   IndexViz), фильтруем `rank != null`, сортируем по `|rank - currentRank|`, берём первые
   4 кроме текущей модели.
6. **Honeypot spam-protection.** POST reviews содержит поле `website` — должно быть
   пустым. Фронт добавляет `<input type="text" name="website" style="display:none"
   tabIndex={-1} autoComplete="off" />` — боты заполняют.

## Задачи

### T1. Specs table (0.35 дня)

**`frontend/app/ratings/_components/DetailSpecs.tsx`** (server).

Секция `<section data-anchor="specs">`.

**Layout** (desktop ≥lg):
- Eyebrow «Технические характеристики» + H2 «Паспорт модели · {N} параметров в 5 группах»
  (N = uniq groups count * avg-per-group, или просто `raw_values.length`).
- Controls справа: eyebrow «Источник: рейтинг · {year}» + 3 кнопки-ссылки (PDF/CSV/Copy)
  — пока disabled placeholder.
- Grid `1fr 1fr` — 2 колонки с группами.

**Группы** (в порядке):
1. `climate` → «Климат» (chips «Мощность охлаждения», «Энергокласс», «SEER», ...)
2. `compressor` → «Компрессор и контур»
3. `acoustics` → «Акустика»
4. `control` → «Управление и датчики»
5. `dimensions` → «Габариты и комплектация»

Каждая карточка-группа:
- Header: group_display (mono 12px uppercase 1.2-letter-spacing) + «{N} парам.» справа.
- Body: rows с `padding 11px 16px`, `grid 1fr auto`:
  - Слева: `criterion.name_ru` (12px ink-60)
  - Справа: `raw_value + ' ' + unit` (12px weight 600). Если `above_reference=true` в
    соответствующем parameter_score — добавить `▲` зелёный перед value. Если
    parameter_score.normalized_score < 40 — `▼` красный (эмпирический порог из Ф6B1).

**Легенда** под таблицей:
> ▲ — параметр лучше эталона класса, ▼ — хуже. Эталон рассчитан по медиане N моделей рейтинга MM.YYYY.

**Группа `dimensions` дополнительно** содержит 4 row из ACModel (не из raw_values):
- «Внутренний блок (размер)»: `inner_unit_dimensions`
- «Внутренний блок (вес)»: `inner_unit_weight_kg + ' кг'`
- «Наружный блок (размер)»: `outer_unit_dimensions`
- «Наружный блок (вес)»: `outer_unit_weight_kg + ' кг'`

Если строка пустая (`""` / null) — **не рендерим** (graceful skip, не «—»).

**Data gathering:**

Нужна функция-джоин `specs.ts` (отдельный util):
```ts
export function buildSpecGroups(
  detail: RatingModelDetail,
  methodology: RatingMethodology
): Array<{
  group: RatingCriterionGroup;
  group_display: string;
  rows: Array<{
    key: string;
    name: string;
    value: string;
    ticker: 'above' | 'below' | null;
  }>;
}>
```

Логика:
- Для каждого `raw_values[i]`: найти criterion в methodology по code (или rv.criterion_code
  если backend добавил); извлечь group и display. Для tick er — найти parameter_score
  с тем же code.
- Группу dimensions расширить хардкод-строками из ACModel-полей.
- Пустые группы (нет rows) — не рендерим.
- Группа `other` — собрать отдельно; если 0 rows — скрыть; иначе показывать последней
  с group_display «Прочее».

**Mobile (<lg):** одна колонка, каждая группа — полная ширина. Остальное без изменений.

### T2. Where to buy (0.35 дня)

**`frontend/app/ratings/_components/DetailBuy.tsx`** (client — city filter state).

Секция `<section data-anchor="buy">`, background `rt-alt`.

**Layout** (desktop):
- Eyebrow + H2 «{N} магазинов в {citiesCount} городах · цены актуальны на {date}»
- Price statbar — 4 колонки (Min/Median/Avg/Max), каждая: eyebrow + serif 24px + meta
  «{shop_name}, {city}» (для min/max) или «{suppliers_count} предложений» (для median).
  Если `priceStats.count < 2` — блок целиком скрываем, warning «Цены уточняйте у магазинов».
- Scatter histogram — визуализация разброса `150×40`:
  - Горизонтальная ось
  - Для каждой цены — точка `w=10, h=10`, `background: accent`, position по linear-scale
    от min до max. Border 2px paper (эффект outline).
  - Lower-left: min price mono 9px
  - Center: «{median} ◆ медиана»
  - Lower-right: max price
- City-chip row: `[Москва (6), Санкт-Петербург (3), Екатеринбург (1), Новосибирск (1),
  Казань (1)]`, первый active (чёрный фон, белый текст). Счётчики по реальным данным.
  **Bonus:** добавить первый chip «Все города (N)» — без city-фильтра.
- Сортировка справа: `[Цена | Рейтинг магазина | Доставка]` — для Ф6B2 активна только
  «Цена» (остальные — disabled placeholder).
- Таблица магазинов (`grid 3fr 1.3fr 1.6fr 1fr 100px 50px`, header row + data rows):
  - Header: MAGAZIN / ЦЕНА / ДОСТАВКА / НАЛИЧИЕ / РЕЙТИНГ / ''
  - Row: `{shop}` (32×32 first-letter-square logo + name + city), price (serif 16px),
    note (ink-60), dot + availability_display, rating (serif 13px accent + mono «/5»),
    chevron-right.
  - availability dot colors: `in_stock`→`#1f8f4c`, `low_stock`→`#c9821c`, `out_of_stock`→`#b24a3b`,
    `unknown`→ink-40.
  - Click row → `window.open(supplier.url, '_blank')`.
- Footer: «Показать ещё N предложений в других городах →» (expandable если применён city-filter).

**Сортировка по цене ASC**, `null`-цены в конец.

**Mobile (<lg):**
- Хедер stacked
- Price statbar — 2×2 grid вместо 1×4
- Histogram — тот же
- City-chips — horizontal scroll
- Таблица — превращается в cards stacked (shop name + price + city + dot)

**Utils:**
- `useSupplierFilters(suppliers)` — city state + filtered derivation
- `computePriceStats(suppliers)` — {min, median, avg, max, count}

### T3. Reviews (0.5 дня)

**`frontend/app/ratings/_components/DetailReviews.tsx`** (client — fetch + form state).

Секция `<section data-anchor="reviews">`.

**Fetch on mount:**
```ts
const [reviews, setReviews] = useState<RatingReview[]>([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetch(`${NEXT_PUBLIC_BACKEND_URL}/api/public/v1/rating/models/${modelId}/reviews/`)
    .then(r => r.json()).then(setReviews).finally(() => setLoading(false));
}, [modelId]);
```

Во время load — skeleton (3 карточки серых).

**Layout** (desktop):

Grid `1.1fr 1fr` top block, затем полноширинные карточки.

**Слева (summary):**
- Eyebrow «Отзывы покупателей» + H2 «{N} отзывов · средняя оценка»
- Два блока inline:
  1. Большое число: `{avg.toFixed(1)}` 72px serif accent + 5 звёзд (заливка по floor,
     последняя — полусветлая если .5+) + «из N отзывов» mono
  2. Гистограмма 5-строчная:
     - `grid 24px 1fr 60px` row: «{N}★» mono → bar (width = `counts[N]/max*100%`,
       accent для 4-5, ink-40 для 3, red для 1-2) → «{count} · {pct}%»

- **Фильтры** (для Ф6B2 MVP — minimum): `[Все] [5 ★] [4+] [3 и ниже]` — 4 chip'а, клиент-сайд filter.

**Справа:** Tab-switcher `[Читать отзывы | Оставить свой]` + контент tab'а.

`read`-tab:
- Сортировка `[Полезные* (disabled) | Новые | По оценке ↓ | По оценке ↑]` — «Полезные»
  disabled (нет helpful_count), по умолчанию «Новые» = `created_at DESC`.
- Info-text про источник сортировки и верификацию (**удалить** text про «верификация через
  ОФД» — у нас этой фичи нет).

`write`-tab:
- Инструкция «Оценка поможет другим выбрать модель. Обязательно: имя, оценка, комментарий.»
- Обязательно:
  - `author_name` — text input
  - `rating` — 5-звёздная radio (hover-подсветка + click to set)
  - `pros`, `cons` — textarea каждая, h=64, optional
  - `comment` — textarea h=80, обязательный, minLength=10
  - `website` — **honeypot** hidden input (position absolute left -9999 или display: none)
- Кнопка «Опубликовать отзыв» primary accent, disabled пока required не заполнены.
- Submit → `POST /api/public/v1/rating/reviews/` с `{model: modelId, author_name, rating,
  pros, cons, comment, website: ''}`. В заголовке `Content-Type: application/json`.
- Error states:
  - 429 (ratelimit): «Слишком много отзывов, попробуйте позже»
  - 400 (validation): показать field-errors из response
  - 201: toast «Отзыв отправлен на модерацию» + сброс формы + tab → `read`

**Карточки отзывов** (full width grid `1fr 1fr` на desktop, 1-col mobile):
- Padding 22px 24px, border subtle, radius 6, paper bg
- Header: left block `{author_name}` weight 600 + `{created_at formatted "DD.MM.YYYY"}`
  mono / right: 5 звёзд compact (13×13)
- **НЕ** рендерим «Проверенная покупка · магазин» — у нас нет.
- Pros/cons grid `1fr 1fr` gap 12 — зелёный/красный bullet + «Плюсы/Минусы» caption +
  `pros.split('\n')` и `cons.split('\n')` как bulleted list.
- Body text: `{comment}` 12px line-height 1.6.
- Footer: disabled «Полезно · ···» (без helpful_count нет функции) **скрыть** + кнопка
  «Пожаловаться» — пока `<a>` без function.

**Mobile**: top block stacked (summary sверху, tabs снизу), карточки 1-col.

**Empty state:** если `reviews.length === 0`:
- Показываем write-form развёрнутой (вместо tabs)
- Message «Будьте первым, кто оставит отзыв о {brand} {inner_unit}»

### T4. Related top-4 (0.15 дня)

**`frontend/app/ratings/_components/DetailRelated.tsx`** (server, принимает `models` list
+ currentRank).

Секция без `data-anchor` (не якорная), border-top + background `rt-alt`.

**Layout:**
- Eyebrow «Сравнить с конкурентами» + H2 «Что ещё смотрят рядом с {inner_unit}»
- Grid 4 колонки (desktop), 2×2 на планшете, 1-col на mobile.
- Для каждой модели в top-4:
  - Header: mono «№ {rank}» left + serif 18px index accent right
  - BrandLogo (height 24)
  - Model name 12px ink-60
  - Photo placeholder stripe (h=92)
  - Footer: price 13px weight 500 + «Сравнить →» accent (будет placeholder, без функции)

**Выбор top-4:**
```ts
function pickRelated(
  all: RatingModelListItem[],
  currentId: number,
  currentRank: number | null
): RatingModelListItem[] {
  if (currentRank == null) return [];
  return all
    .filter(m => m.id !== currentId && m.rank != null && m.publish_status === 'published')
    .sort((a, b) => Math.abs(a.rank! - currentRank) - Math.abs(b.rank! - currentRank))
    .slice(0, 4);
}
```

Ссылка `<Link href={`/ratings/${model.slug}`}>` на всю карточку.

### T5. Полный mobile (0.1 дня, частично включён в T1-T4)

Реальные мobile-правки проверяются через smoke-тест (`<lg` breakpoint, viewport 390px):
- DetailSpecs: 1-col grid
- DetailBuy: statbar 2×2, cards вместо таблицы, city-chips overflow-x
- DetailReviews: summary + tabs stacked, 1-col карточки
- DetailRelated: 1-col grid

### T6. Enable anchors in AnchorNav (0.05 дня)

В `DetailAnchorNav.tsx`:

```ts
const ANCHORS = [
  { id: 'overview', label: 'Обзор', active: true },
  { id: 'criteria', label: 'Оценки по критериям', active: true },
  { id: 'specs', label: 'Характеристики', active: true },      // было false
  { id: 'buy', label: 'Где купить', active: true },            // было false
  { id: 'reviews', label: 'Отзывы', active: true },            // было false
];
```

В `IntersectionObserver` — 5 секций вместо 2, rootMargin и threshold без изменений.

Дизайн-бонус: label `buy` можно переопределить на «Где купить ({suppliers.length})» —
counter в скобках. Для `reviews` аналогично «Отзывы ({reviews.length})» — но reviews
грузятся client-side в DetailReviews, так что counter в nav сложен. Для Ф6B2 оставь без
счётчиков; добавим в Ф7 если попросят.

### T7. Тесты (0.15 дня)

**`frontend/app/ratings/_components/specs.test.ts`:**
- `buildSpecGroups({ raw_values: [...], inner_unit_dimensions: '850×295×189' }, methodology)`
  → массив из 5 групп, dimensions содержит хардкод-строки + raw_values
- «Ниже эталона» порог: parameter_score normalized<40 → ticker 'below'
- above_reference=true → ticker 'above'
- Пустые значения не попадают в rows

**`frontend/app/ratings/_components/buy.test.ts`:**
- `computePriceStats([{price:'100'}, {price:'200'}, {price:null}])` → {min:100, median:150, avg:150, max:200, count:2}
- `useSupplierFilters` (если написан как hook — протестировать с React Testing Library)
  или как pure function `filterSuppliers(s, {city: 'Москва'})` → только моск.

**`frontend/app/ratings/_components/related.test.ts`:**
- `pickRelated(models, currentId, currentRank)` — возвращает top-4 по |Δrank|
- Исключает currentId
- Только published с rank!=null
- При currentRank=null → `[]`

**`frontend/app/ratings/_components/DetailReviews.test.tsx`** (vitest-react):
- Рендер skeleton при loading
- Рендер summary со звёздами для `avg=4.4`
- Write-tab: submit заполняет POST с правильным payload, 429 показывает error
- Honeypot: если `website` заполнен — submit блокирован на фронте (извлечение спам-защиты +
  на backend)

**Ожидаемые тесты:** 234 + ~12 новых = ~246.

## Приёмочные критерии

- [ ] `npx tsc --noEmit` — 0 ошибок
- [ ] `npm test -- --run` — все passing, новые тесты из T7
- [ ] `BACKEND_API_URL=http://localhost:8000 npm run build` — успешно, `/ratings/[slug]` SSG
- [ ] `npm run dev` → `http://localhost:3000/ratings/<slug>/`:
  - [ ] Sticky nav: 5 активных якорей (specs, buy, reviews теперь кликабельны)
  - [ ] Specs: 5 групп с правильными rows, dimensions с габаритами из ACModel
  - [ ] Buy: price statbar (или warning если <2 цен), histogram, city-filter работает, sort по цене ASC
  - [ ] Reviews: loading skeleton → summary histogram → empty state (если отзывов нет)
  - [ ] Write-tab: форма валидная, POST c 201 возвращает toast
  - [ ] Related: 4 карточки, click → переход на `/ratings/<other-slug>/`
- [ ] Mobile 390px: все 4 новые секции адаптированы (stacked, overflow-x где надо)
- [ ] Dark mode: цвета не ломаются

## Ограничения

- **НЕ менять** компоненты Ф6B1: DetailHero, DetailMedia, DetailOverview, DetailCriteria,
  DetailIndexViz, DetailBreadcrumb — они закрыты. Исключение: DetailAnchorNav (enable
  специфические якоря).
- **НЕ добавлять** backend-поля — всё нужное есть после M4.
- **НЕ хардкодить** `verified_purchase`, `helpful_count`, review-photos — **скрываем**.
- **НЕ создавать** `useMediaQuery` — через Tailwind `hidden lg:block` / `lg:hidden`.
- **НЕ трогать** `frontend/app/ratings/page.tsx` (главная Ф6A) — только `[slug]/page.tsx`
  (детальная).
- **НЕ добавлять** фреймворк для форм (react-hook-form, formik) — нативный `<form>` +
  `useState` достаточен для одной формы в Reviews.
- **НЕ использовать** toast-либу — inline message в form-блоке через state.
- Conventional Commits, по коммиту на задачу (T1-T7). Git-trailer `Co-authored-by: AC-Федя <ac-fedya@erp-avgust>`.

## Формат отчёта

`ac-rating/reports/f6b2-detail-rest.md`:
1. Ветка + коммиты
2. Что сделано (T1-T7)
3. Проверки: tsc, tests, build, dev smoke с screenshots (specs desktop, buy desktop с
   filled-data, reviews empty + write, related 4-col, mobile 390px)
4. Сюрпризы/риски
5. Ключевые файлы для ревью
6. Что остаётся для будущих эпиков (M5? Ф7?)

## Подсказки от техлида

- **Reviews API** — GET `/api/public/v1/rating/models/<id>/reviews/` (plain array после M3),
  POST `/api/public/v1/rating/reviews/` (ratelimit 5/час, 201 = moderation, **не** опубликован
  сразу — отзывы публикуются админом в Django admin → `is_approved=True`). Fields GET:
  `id, author_name, rating, pros, cons, comment, created_at`. Fields POST: тот же + `website`
  (honeypot) + `model` (FK id).
- **`rating` field 1-5**, integer. UI 5-звёзд, клик устанавливает.
- **Honeypot** — невидимое поле `website`. Если бот заполнит — backend отклонит. Фронт
  рендерит hidden input и **никогда** не устанавливает value из UI — только через JS если
  пусто.
- **`parameter_scores` vs `raw_values`.** Оба массива на detail. `parameter_scores` — для
  criteria-секции (oценки 0-100 + веса). `raw_values` — для specs (сырые значения + unit
  без score). В Specs нам нужны **raw_values**; для `ticker` смотрим `parameter_scores` по
  тому же code.
- **`raw_values[i].criterion`** — nested object (проверяй API shape, возможно `code` прямо
  или через `.criterion.code`). Если shape неожиданный — сверься с serializer
  `backend/ac_catalog/serializers.py:RawValueSerializer`.
- **Avg rating**: `reviews.reduce((s,r) => s+r.rating, 0) / reviews.length`. Если 0 отзывов
  — `null`, показать «Пока нет оценок».
- **Гистограмма звёзд**: `counts = [1,2,3,4,5].map(s => reviews.filter(r => r.rating===s).length)`,
  `max = Math.max(...counts)`, для каждой строки — `counts[s-1] / max * 100`%.
- **Price statbar median**: `prices.sort((a,b)=>a-b); const m = prices.length; const mid =
  Math.floor(m/2); median = m%2 ? prices[mid] : (prices[mid-1]+prices[mid])/2;`. Avg —
  `prices.reduce((s,p)=>s+p, 0) / m`.
- **SSR/CSR**: DetailSpecs / DetailRelated — server. DetailBuy / DetailReviews — client
  (city filter state, fetch, form). DetailAnchorNav — уже client.
- **`generateStaticParams`** в `[slug]/page.tsx` — уже есть из Ф6B1, ничего менять не надо.
  DetailReviews fetch'ит клиентски → не затрагивает build.
- **Dark mode на specs ticker**: зелёный `#1f8f4c` и красный `#b24a3b` — те же что в Criteria.
  Они заметны в обеих темах, оставляем hex (не через tokens).
- **«Цены уточняйте»** — warning-блок вместо statbar когда `price_count < 2`. Не пугает
  пользователя, просто указывает на ограничение данных.
- **Тупой тик `setInterval` для reload reviews** — НЕ делай. Page обновляется через ISR 1h
  (revalidate=3600 в page.tsx). Если пользователь отправил отзыв — показываем toast «на
  модерации» без reload списка.
- **Error boundary вокруг DetailReviews** — если fetch упал, показать «Отзывы временно
  недоступны» без крэша всей страницы. Используй try/catch в hook или
  `<ErrorBoundary fallback={...}>` (если уже есть в проекте).

## Запуск

```bash
cd /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust
git fetch origin
git worktree add -b ac-rating/f6b2-detail-rest ../ERP_Avgust_ac_fedya_f6b2 origin/main
cd ../ERP_Avgust_ac_fedya_f6b2/frontend && npm install
# Перезапустись из этого CWD — claude. Бэкенд у Клода на localhost:8000.
# Один коммит на задачу (T1-T7). Перед push — rebase.
```
