# ТЗ Фазы Ф6B1 — Детальная страница (часть 1: hero + criteria)

**Фаза:** Ф6B1 (frontend, `/ratings/[slug]/`, часть 1)
**Ветка:** `ac-rating/f6b1-detail-main` (от `main`)
**Зависит от:** Ф6A (в main)
**Параллельно:** M4 (Петя добавляет editorial/dimensions/supplier/group). Если M4
смержится раньше — подтягивай и используй реальные данные; если нет — используй graceful
fallback на `|| ""` и `|| null`.
**Оценка:** 2-3 дня

## Контекст

Ф6A закрыта — публичная главная `/ratings/` с LIST-A + «Свой рейтинг» в main. Следующий
шаг — детальная страница модели. Дизайн в `ac-rating/design/wf-screens.jsx:5-889` (DetailA)
+ `:1894-2028+` (MobileDetailA). Из-за объёма разбил на **Ф6B1** (hero/media/criteria/overview/index-viz)
и **Ф6B2** (specs/buy/reviews/related + полный mobile).

В F0 `/ratings/[slug]/page.tsx` — заглушка через `<ComingSoon/>`. Удаляешь и заменяешь
полноценной страницей.

**Что в скоупе Ф6B1:**
- Блоки 1-6 из DetailA: Breadcrumb, Hero (2-col), Media (photos + video), Sticky anchor nav,
  Overview (editorial + pros/cons), Criteria breakdown (list/radar/grid), Index viz strip.
- Mobile версия Hero + Criteria (стекированный layout + horizontal scrollable tabs).

**Что НЕ в скоупе (Ф6B2):**
- Specs table (42 параметра в 5 группах)
- Where to buy (12 магазинов, city filter, histogram)
- Reviews (read + write tabs, cards)
- Related top-4
- Полный mobile для specs/buy/reviews

## Задачи

### T1. Типы + data fetching (0.3 дня)

**Обнови `frontend/lib/api/types/rating.ts`:**

Поправь `RatingModelDetail` под реальный shape с M2 + M4:

```ts
export interface RatingModelDetail {
  id: number;
  slug: string;
  brand: RatingBrand;                    // объект в detail (не string, как в list)
  series: string;
  inner_unit: string;
  outer_unit: string;
  nominal_capacity: number | null;
  total_index: number;
  index_max: number;
  publish_status: string;
  region_availability: RatingRegion[];
  price: string | null;
  pros_text: string;
  cons_text: string;
  youtube_url: string;
  rutube_url: string;
  vk_url: string;
  photos: RatingModelPhoto[];
  suppliers: RatingModelSupplier[];
  parameter_scores: RatingParameterScore[];
  raw_values: unknown[];                 // пока unknown — используем parameter_scores
  methodology_version: string;
  rank: number | null;
  median_total_index: number | null;

  // M4 (могут быть "" или null если M4 ещё не в main):
  editorial_lede: string;
  editorial_body: string;
  editorial_quote: string;
  editorial_quote_author: string;
  inner_unit_dimensions: string;
  inner_unit_weight_kg: string | null;   // Decimal → string через DRF
  outer_unit_dimensions: string;
  outer_unit_weight_kg: string | null;
}
```

**Обнови `RatingModelSupplier`** (в types) — добавь `price: string | null`, `city: string`,
`rating: string | null`, `availability: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown'`,
`note: string`. Для Ф6B1 это не используется, но тип сразу правильный.

**Обнови `RatingMethodologyCriterion`** — добавь `group: 'climate' | 'compressor' |
'acoustics' | 'control' | 'dimensions' | 'other'`. Пригодится Ф6B2.

**Сервис:**

`frontend/lib/api/services/rating.ts` — уже есть `getRatingModelBySlug(slug)`. Проверь, что
работает; если тип изменился — никаких правок не требуется.

Для **related top-4** нужен список всех моделей (чтобы выбрать 4 ближайших по
`total_index`). Используй уже существующий `getRatingModels()` — он ISR 3600s, кеш SSG.

Для **index viz strip** нужны все `total_index` из каталога + median — оба из того же
`getRatingModels()` + `getRatingMethodology()`.

### T2. Hero 2-column (0.4 дня)

**`frontend/app/ratings/_components/DetailHero.tsx`** (server component, без 'use client'):

Grid 2 колонки `1.45fr 1fr`, gap 56, на <lg — стек.

**Слева:**
- Ряд: `<BrandLogo src={detail.brand.logo} name={detail.brand.name} size={32}/>` + сепаратор
  + «Серия · Cube Pro 2025» (хардкод заглушка, у нас `series`) + сепаратор
  + «Мощность охлаждения · 2 800 Вт» (из `nominal_capacity` × 1000, если null → «—»)
- Grid 2×1 — две карточки:
  - «Внутренний блок» — `detail.inner_unit` (24px mono) + `inner_unit_dimensions` + « · » +
    `inner_unit_weight_kg ? inner_unit_weight_kg + ' кг' : ''` (если всё пустое, просто
    не рендерим sub-line).
  - «Наружный блок» — аналогично.
- Lead-paragraph — `detail.editorial_lede || fallbackLede(detail)`.

`fallbackLede(detail)` — заглушка-функция:
```ts
function fallbackLede(d: RatingModelDetail): string {
  const rankPart = d.rank ? `№${d.rank} в рейтинге` : 'в рейтинге';
  return `${d.brand.name} ${d.inner_unit} — ${rankPart} с индексом ${d.total_index.toFixed(1)}. Редакторский обзор готовится.`;
}
```

**Справа:** вертикальный стек с разделителями, paddingLeft 28, borderLeft 1px subtle.
- **Rank block:** eyebrow «Позиция в рейтинге» + `№ {rank}` 72px serif accent + «из {stats.total_models} моделей». Width accent-underline 64px 3px.
- **Index block:** eyebrow «Индекс» + `{total_index.toFixed(1)}` 36px serif + `/ 100 · медиана {median.toFixed(1)}`.
- **Price block:** eyebrow «Рекомендованная цена» + `{formatPrice(price)} ₽` 30px serif + «розница от {minSupplierPrice} ₽ · {suppliersCount} магазинов» (если suppliers пустые → «магазины скоро появятся»).

### T3. Media (photos + video) (0.4 дня)

**`frontend/app/ratings/_components/DetailMedia.tsx`** (client 'use client' — carousel state).

Grid 2 колонки `1.05fr 1fr` на desktop, stacked mobile.

**Photo block:**
- Основное фото (aspect-ratio 3/2) — `detail.photos[currentIdx]`. Pre-buttons «←» / «→»
  (absolute, 36×36 circles).
- Overlay: «Фото · галерея» (верх-слева), «{currentIdx+1} / {photos.length}» (низ-справа).
- Thumbnails grid 2×6 (6×6 = 12 превью, обрезаем лишние) — click меняет `currentIdx`.
- Если `photos.length === 0` — показать placeholder «Фото скоро появятся» (stripe-pattern).

**Video block:**

3 ссылки (если непустые): `youtube_url`, `rutube_url`, `vk_url`. Показать первую
существующую как главное видео в `<iframe>` (YouTube/Rutube — embed прямой).

Для остальных платформ — маленькие карточки-кнопки ниже (icon + name + link out).

Если все 3 video_url пустые — показать placeholder «Видеообзор скоро».

**Внимание:** YouTube embed — iframe `https://www.youtube.com/embed/{VIDEO_ID}`, нужно
распарсить ID из `youtube_url` (`v=<id>` query или `youtu.be/<id>` path). VK — `https://vk.com/video_ext.php?oid=...&id=...` — требует VK oid/id из `vk.com/video-123_456` URL. Rutube — `https://rutube.ru/play/embed/<video-id>`.

**Утилиты:**
```ts
function parseYoutubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
function parseVkVideo(url: string): { oid: string; id: string } | null {
  const m = url.match(/video(-?\d+)_(\d+)/);
  return m ? { oid: m[1], id: m[2] } : null;
}
function parseRutubeId(url: string): string | null {
  const m = url.match(/video\/([a-z0-9]+)/);
  return m ? m[1] : null;
}
```

### T4. Sticky anchor navigation (0.3 дня)

**`frontend/app/ratings/_components/DetailAnchorNav.tsx`** (client):

Sticky top 0, z-index 5, border-bottom, background `hsl(var(--rt-paper))`.

5 пунктов (для Ф6B1 только 3 активны, specs/buy/reviews — disabled stub):
```ts
const ANCHORS = [
  { id: 'overview', label: 'Обзор', active: true },
  { id: 'criteria', label: 'Оценки по критериям', active: true },
  { id: 'specs', label: 'Характеристики', active: false },      // Ф6B2
  { id: 'buy', label: 'Где купить', active: false },            // Ф6B2
  { id: 'reviews', label: 'Отзывы', active: false },            // Ф6B2
];
```

Для неактивных — блеклый цвет `hsl(var(--rt-ink-25))`, `cursor: default`, без click. Или
просто не рендерим до Ф6B2? **Делаем рендерить но dim** — пользователь видит будущую структуру.

**Логика активного раздела:** `IntersectionObserver` на секциях с `data-anchor="<id>"`.
При пересечении — `setActive(id)`. Click по nav → `scrollIntoView({ behavior: 'smooth' })`.

```tsx
const [active, setActive] = useState('overview');
useEffect(() => {
  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) setActive(e.target.getAttribute('data-anchor')!);
      }
    },
    { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
  );
  for (const id of ANCHORS.filter(a => a.active).map(a => a.id)) {
    const el = document.querySelector(`[data-anchor="${id}"]`);
    if (el) obs.observe(el);
  }
  return () => obs.disconnect();
}, []);
```

### T5. Overview section (0.3 дня)

**`frontend/app/ratings/_components/DetailOverview.tsx`** (server):

Секция `<section data-anchor="overview">`.

**Контент:**
- Eyebrow «Обзор редакции»
- H2 serif 30px — **заглушка**: «Мнение редакции о модели {brand.name} {inner_unit}» (нет в API, хардкод).
- Lede — уже в Hero, тут не дублируем. Или если хочется — рендерим `editorial_lede` отдельно
  крупнее остального текста.
- Body — `editorial_body.split('\n\n').map(p => <p>{p}</p>)`. Если пусто → placeholder
  блок «Редакторский обзор готовится. Следите за обновлениями рейтинга.».
- Pull quote — если `editorial_quote` не пустой, рендерим блок с border-left 3px accent +
  italic serif + `editorial_quote_author`.

**Pros/Cons:**
Парсим `pros_text` и `cons_text` в списки:
```ts
function parsePoints(text: string): { title: string; body?: string }[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const [title, ...rest] = line.split(/[—–-]\s+/);
      return { title: title.trim(), body: rest.join(' ').trim() || undefined };
    });
}
```

Формат в API (договорённость): `pros_text` — каждый пункт на новой строке, формат
«Заголовок — описание» (с эм-даш или дефис + пробел). Если дефиса нет — весь line
считается title.

**Блок pros/cons:** grid 2 колонки с вертикальным divider `1fr 1px 1fr`.
- Плюсы: зелёный bullet `#1f8f4c`, список {title bold + body 60%}.
- Минусы: красный bullet `#b24a3b`, аналогично.

Если `parsePoints(pros_text).length === 0` — блок не рендерим.

### T6. Criteria breakdown (0.6 дня)

**`frontend/app/ratings/_components/DetailCriteria.tsx`** (client).

Секция `<section data-anchor="criteria">`.

Header: eyebrow «Оценки по критериям» + H2 «{parameter_scores.length} параметров рейтинга» + view-switcher справа (list/radar/grid).

**Данные:** `parameter_scores: RatingParameterScore[]` — каждый:
```ts
{
  criterion_code: string;
  criterion_name: string;         // уже на русском
  unit: string;
  raw_value: string;
  normalized_score: number;       // 0..100
  weighted_score: number;         // wgt * score / 100
  above_reference: boolean;
}
```

**View `list`** (дефолт):
- Для каждого score: padding 16px 0, border-bottom subtle.
- Row 1: `<T>{criterion_name}:</T>` + chip-value `{raw_value + ' ' + unit}` (в accent-bg bubble)
  + `?` tooltip (описание методики — пока без contents, на hover показать title).
  + если `above_reference` — ticker «выше эталона» (зелёный) справа. Иначе — если
    `normalized_score < 50` И известна обратная флаг — «ниже эталона» красный.
- Row 2: `<Meter value={normalized_score} h={4} />`.
- Row 3: flex between — «Вклад в индекс: {weighted_score.toFixed(2)}» (слева, mono) /
  «{normalized_score.toFixed(1)} / 100» (справа, bold).

**View `radar`**:
SVG 560×620. N осей от центра `(cx=280, cy=280)`. Для каждого axis:
- Линия от центра на радиус `R=210`.
- Текст-label на `R+16`, выровнен по квадранту (`textAnchor = cos(a) > 0.15 ? 'start' : ...`).
- Кольца сетки 20/40/60/80/100.
- Полигон значений — заливка accent @ 18% opacity, stroke accent.
- Точки accent r=2.8 на каждой вершине.

Полная функция:
```tsx
const N = scores.length;
const cx = 280, cy = 280, R = 210;
const pt = (i: number, r: number): [number, number] => {
  const a = -Math.PI/2 + (i/N)*Math.PI*2;
  return [cx + r*Math.cos(a), cy + r*Math.sin(a)];
};
const polygon = scores.map((s, i) => pt(i, (s.normalized_score/100)*R).join(',')).join(' ');
// ... см wf-screens.jsx:344-376
```

**View `grid`**:
3-колоночная сетка мини-карточек (padding 12px 14px, border subtle, radius 6, paper bg).
Каждая: name 11px weight 600, chip value accent, Meter h=3, вклад + score.

**View-switcher:** inline-flex с 3 buttons, active — ink bg / paper text, inactive —
transparent. Иконки list/radar/grid — SVG inline (copy from wf-screens.jsx:286-292).

Сортировка scores — по `weighted_score DESC` (самые весомые вверху).

### T7. Index distribution strip (0.2 дня)

**`frontend/app/ratings/_components/DetailIndexViz.tsx`** (server, принимает `allScores: number[]`).

Фон `hsl(var(--rt-alt))`, padding 32px 40px 40px, border-top subtle.

Header: eyebrow + H3 «{total_index.toFixed(1)} — {rankLabel(rank)} среди {total} моделей {year}».

`rankLabel(rank)`: `rank === 1 ? 'лидер' : rank <= 5 ? 'в топ-5' : rank <= 10 ? 'в топ-10' : 'среди'`.

SVG 1200×64:
- 87 точек рассчитанных по `allScores` — позиция по x = 40 + (score/100)*1120, y = 46,
  r = 2.5, fill currentColor с opacity 0.12-0.20.
- Горизонтальная ось y=58.
- Тики 0/25/50/75/100 — маленькие вертикальные штрихи.
- Медиана — пунктирная вертикаль по `median_total_index`.
- This-model marker — большой кружок r=8 accent на позиции `total_index`, над ним serif 12px label.

### T8. Breadcrumb + page integration (0.2 дня)

**`frontend/app/ratings/_components/DetailBreadcrumb.tsx`** (server):

Padding `14px 40px`, border-bottom subtle, 12px flex:
```
← Вернуться в рейтинг · {rating_title}
```

Click → `<Link href="/ratings/">`. `rating_title` — хардкод «Кондиционеры 2026».

**`frontend/app/ratings/[slug]/page.tsx`** (server):

```tsx
import { notFound } from 'next/navigation';
import {
  getRatingModelBySlug,
  getRatingModels,
  getRatingMethodology,
} from '@/lib/api/services/rating';
import RatingHeader from '../_components/RatingHeader';
import DetailBreadcrumb from '../_components/DetailBreadcrumb';
import DetailHero from '../_components/DetailHero';
import DetailMedia from '../_components/DetailMedia';
import DetailAnchorNav from '../_components/DetailAnchorNav';
import DetailOverview from '../_components/DetailOverview';
import DetailCriteria from '../_components/DetailCriteria';
import DetailIndexViz from '../_components/DetailIndexViz';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export default async function RatingDetailPage({ params }: Props) {
  const { slug } = await params;
  let detail, list, methodology;
  try {
    [detail, list, methodology] = await Promise.all([
      getRatingModelBySlug(slug),
      getRatingModels(),
      getRatingMethodology(),
    ]);
  } catch {
    notFound();
  }

  const allScores = list.map(m => m.total_index);
  const stats = methodology.stats;
  const median = detail.median_total_index ?? stats.median_total_index;

  return (
    <>
      <RatingHeader />
      <DetailBreadcrumb />
      <DetailHero detail={detail} stats={stats} median={median} />
      <DetailMedia detail={detail} />
      <DetailAnchorNav />
      <DetailOverview detail={detail} />
      <DetailCriteria detail={detail} />
      <DetailIndexViz total={detail.total_index} median={median} allScores={allScores} rank={detail.rank} stats={stats} />
    </>
  );
}
```

**Удали** `ComingSoon.tsx` из импорта `[slug]/page.tsx`. Компонент-файл **оставь** (он
ещё нужен в methodology/submit/archive — удаление их заглушек это Ф6C).

### T9. Mobile-версия Hero + Criteria (0.3 дня)

В каждом DetailXxx-компоненте — responsive через Tailwind-обёртки (`hidden md:block` /
`md:hidden`) или через CSS media queries в inline-style.

**Mobile Hero** (`DetailHero.tsx`) — stacked:
- Breadcrumb + back arrow
- Brand row + `#{rank}` chip справа (accent-bg)
- Meta row: Серия / Мощность (flex 1fr 1.2fr)
- Inner + outer unit cards stacked (padding 12px 14px)
- Photo carousel (aspect 3/2, swipe)
- Video block (aspect 16/9)
- Lede text
- Summary grid `1.2fr 1fr`: Index card (accent-bg border, 36px serif) + From-price card

Если compontent server — придётся разделить на `DetailHeroDesktop` + `DetailHeroMobile` и
рендерить обоих через `md:hidden`/`hidden md:block`. Или сделать один client-component с
`useMediaQuery` — но мы договорились не использовать `useMediaQuery` (Ф6A паттерн).

**Mobile Criteria** (`DetailCriteria.tsx`): список — 4 колонки grid `1fr 72px 52px 40px`
(name / value / %эт / вес), Meter на всю ширину внизу, компактный. View-switcher — icon-only.

Остальные Ф6B1 блоки (media/anchor-nav/overview/index-viz) — пока одна версия с responsive
Tailwind классами (`padding` scale, `font-size` scale). Полный mobile для них — в Ф6B2.

### T10. Тесты (0.2 дня)

`frontend/app/ratings/_components/DetailCriteria.test.ts` (vitest):
- `parsePoints('Тихий — не мешает спать\nБольшой теплообменник\n')` → `[{title: 'Тихий', body: 'не мешает спать'}, {title: 'Большой теплообменник'}]`
- Media-url parsers: `parseYoutubeId('https://youtu.be/dQw4w9WgXcQ')` → `'dQw4w9WgXcQ'`, аналогично для VK и RuTube.

Один test-файл `DetailHelpers.test.ts` — 5-6 тестов-case'ов. Без snapshot-тестов (UI
сильно меняется до финала).

## Приёмочные критерии

- [ ] `cd frontend && npx tsc --noEmit` — 0 ошибок
- [ ] `cd frontend && npm test` — все тесты (Ф6A + новые) проходят
- [ ] `cd frontend && BACKEND_API_URL=http://localhost:8000 npm run build` — успешно (до 107/107 pages), `/ratings/[slug]` в dynamic route
- [ ] `npm run dev` → `http://localhost:3000/ratings/CASARTE-Velato-CAS25CC1R3-S-1U25CC1R3/`:
  - [ ] Breadcrumb отображается, click возвращает на /ratings/
  - [ ] Hero: rank 72px «№1» accent, index 36px, цена 30px, brand/series/unit cards
  - [ ] Если M4 ещё не смержен — `editorial_lede` пустое, показывается `fallbackLede`
  - [ ] Media: галерея фото с pre-buttons, thumbnails 2×6, video embed YouTube
  - [ ] Sticky nav: overview/criteria active; при скролле подсветка меняется
  - [ ] Overview: lede + body (или placeholder если пусто), pros/cons парсится в 2 колонки
  - [ ] Criteria: 30 параметров в list-режиме отсортированы по вкладу; переключение на radar — 30 осей SVG; grid — 30 карточек
  - [ ] Index viz: распределение точек, marker на модели, пунктир медианы
- [ ] `/ratings/non-existing-slug/` → 404 (not-found.tsx или дефолтная Next page)
- [ ] Mobile viewport 390px: Hero stacked, Criteria компактный
- [ ] Dark mode (html.dark): цвета переключаются без поломок
- [ ] Никаких изменений в: `globals.css`, корневой `layout.tsx`, `page.tsx`, `components/ui/`, `/news/`, `/erp/`

## Ограничения

- **НЕ удалять** `frontend/app/ratings/_components/ComingSoon.tsx` — используется в 4 других F0-скелетах
- **НЕ менять** `frontend/app/ratings/page.tsx` (Ф6A home) — только `[slug]/page.tsx`
- **НЕ менять** shared-файлы (settings, urls, compose, .env.example, globals.css, корневой layout)
- **НЕ импортировать** из `ac-rating/design/` — это JSX-spec, читаем, но пишем свой TS
- **НЕ использовать** `useMediaQuery` — только Tailwind breakpoints
- **НЕ использовать** framer-motion или другие анимации — если нужны transitions, через CSS
- **НЕ писать** markdown-рендер для editorial_body — plain text + `\n\n` → `<p>`
- Conventional Commits, один коммит на задачу (T1…T10). Trailer `Co-authored-by: AC-Федя <ac-fedya@erp-avgust>`

## Формат отчёта

`ac-rating/reports/f6b1-detail-main.md`:
1. Ветка + коммиты (10)
2. Что сделано (T1-T10)
3. Проверки: tsc, test, build, dev smoke с screenshots (desktop /ratings/<slug>/, mobile)
4. Что НЕ включено (Ф6B2 scope: specs/buy/reviews/related — напомнить)
5. Сюрпризы / риски / TODO
6. Ключевые файлы для ревью

## Подсказки от техлида

- **Server vs client components:** Hero / Breadcrumb / Overview / IndexViz — server. Media
  (carousel state) / AnchorNav (IntersectionObserver) / Criteria (view-switcher state) —
  client 'use client'.
- **M4 fallback:** до merge M4 все editorial/dimensions поля — `""` или `null`. Ни одна
  секция **не должна падать** — все fallback на `|| ''` + условный рендер.
- **YouTube embed:** если `youtube_url` парсится в id, показываем `<iframe src={`https://www.youtube.com/embed/${id}`} allow="..." allowFullScreen/>`. Если парс провалился — fallback на link-card.
- **Rank color:** `rank=1` — accent красный (по дизайну `var(--wf-accent)`). Для остальных
  — accent такой же (дизайн не различает). Не усложняй.
- **`total_index.toFixed(1)`** — в API Float, но всегда форматируем до 1 знака.
- **Series строка:** `detail.series` может быть пустым. Если пусто — не рендерим блок «Серия»,
  или хардкодим «—».
- **Brand logo в DetailHero:** `detail.brand.logo` — абсолютный URL. Если пустой — fallback
  на букву-инициал (как в Ф6A `BrandLogo`). `<BrandLogo src={detail.brand.logo} name={detail.brand.name} size={32}/>`.
- **SVG radar-chart** — самый коварный блок. В `wf-custom.jsx:344-376` есть все расчёты
  координат. Copy + адаптируй под наши scores. Текст осей — `name_ru` обрезай до 22 chars
  с `'…'` если длинно.
- **IntersectionObserver root** — не передавай `root: window`, оставь `null` (дефолт =
  viewport). rootMargin `-80px 0px -60% 0px` отстрелит section когда она на 60% вверх
  вышла за пределы — это даёт плавную смену активного tab.
- **Supplier цена в Hero:** `suppliers` в detail уже есть массив. Для Ф6B1 Hero показываем
  только «розница от {min_price} ₽ · {N} магазинов». Если у supplier `price` null
  (M4 не смержен) — показываем «8 магазинов, цены уточняйте» без «от».
- **`notFound()`** при exception в fetch — не идеально, т.к. backend может быть 500
  (инфра), не 404. Но для публичной страницы это ОК: если модели нет — 404, если
  backend недоступен — тоже 404 (лучше чем белый экран).
- **SEO metadata:** `export async function generateMetadata({ params })`. `title: '{brand.name} {inner_unit} — рейтинг и обзор · hvac-info.com'`. `description: editorial_lede.slice(0, 160) || fallbackLede(detail).slice(0, 160)`. OG tags (`openGraph.images` — первое фото) — желательно, но minor; если нет фото — скип.
- **generateStaticParams** — необязательно. ISR с `revalidate=3600` достаточно. Если
  хочется SSG при build для всех 27 published моделей:
  ```ts
  export async function generateStaticParams() {
    const models = await getRatingModels();
    return models.filter(m => m.publish_status === 'published').map(m => ({ slug: m.slug }));
  }
  ```
  Делай в T8, если остаётся время.

## Запуск

```bash
cd /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust
git fetch origin
git worktree add -b ac-rating/f6b1-detail-main ../ERP_Avgust_ac_fedya_f6b1 origin/main
cd ../ERP_Avgust_ac_fedya_f6b1/frontend && npm install
# Затем перезапустись из этого CWD — claude. Пиши код, делай по коммиту на задачу.
# Перед push: git fetch origin && git rebase origin/main (M4 может быть смержен)
# Перед merge: git log main..HEAD — только твои коммиты
# Финальный merge я делаю сам через --no-ff.
```
