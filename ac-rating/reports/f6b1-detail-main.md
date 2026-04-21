# Ф6B1 — Detail page (hero + criteria, часть 1 из 2)

**Ветка:** `ac-rating/f6b1-detail-main` (rebased на `origin/main`)
**Статус:** готово к ревью и мержу
**Даты:** 2026-04-21

## Коммиты (7 штук, по задаче)

```
d9da381 test(ac-rating): Ф6B1 T10 — detailHelpers unit tests
12f5db0 feat(ac-rating): Ф6B1 T7+T8 — IndexViz + Breadcrumb + page integration
b460f1c feat(ac-rating): Ф6B1 T6 — DetailCriteria (list/radar/grid)
a6655d0 feat(ac-rating): Ф6B1 T4+T5 — DetailAnchorNav + DetailOverview
813ff59 feat(ac-rating): Ф6B1 T3 — DetailMedia (photos + video)
2df8d00 feat(ac-rating): Ф6B1 T2 — DetailHero (desktop + mobile)
7e54105 feat(ac-rating): Ф6B1 T1 — типы RatingModelDetail + helpers
```

T4+T5 и T7+T8 объединил парами для связанных патчей (nav ↔ overview данные
используют IntersectionObserver один у другого, IndexViz без page.tsx
не собирался). T9 закрыт через responsive CSS `@media` внутри каждого
компонента (Hero имеет выделенный HeroMobile) — отдельного коммита нет.

## Что сделано по задачам

### T1 — Типы + helpers
- Переписал `RatingModelDetail` под реальный M2 shape (добавил `index_max`,
  `publish_status`, `region_availability`, `methodology_version`, `rank`
  nullable, `median_total_index` nullable).
- Добавил M4-поля (`editorial_lede/body/quote/quote_author`, `inner/outer_unit_dimensions`,
  `inner/outer_unit_weight_kg`) — все строковые с graceful fallback на `""`/`null`.
- `RatingModelSupplier` получил `price | null`, `city`, `rating | null`,
  `availability` enum, `note`. `RatingMethodologyCriterion` — `group` enum.
- Вынес в `detailHelpers.ts`: `parsePoints` (pros/cons из plain text с
  эм-даш/en-dash/дефис), `parseYoutubeId`, `parseVkVideo`, `parseRutubeId`,
  `fallbackLede`, `rankLabel`, `formatNominalCapacity`, `minSupplierPrice`.
- Починил `CustomRatingTab.test.ts` — добавил `group: 'other'` в фабрику
  `crit()` (иначе тип не удовлетворяется).

### T2 — DetailHero
Server component. Два лэйаута под одним `<section>`:
- **Desktop (≥900px):** grid `1.45fr 1fr`. Слева — brand logo + серия +
  мощность охл., две карточки inner/outer unit (код + dimensions + weight),
  lede. Справа — вертикальный стек с разделителями: rank 72px serif accent
  + accent-underline 64×3px, индекс 36px + медиана, цена 30px + supplier
  roll-up.
- **Mobile (<900px):** стек. Brand + rank chip в accent-bg. Meta row серия/мощность.
  Inner+outer cards compact. Lede. Index/price 2-col сводка с accent-border
  на index-карточке.

Переключение — через `@media` + CSS класс, без `useMediaQuery`.
Все M4-поля с fallback: если `editorial_lede` пустой — `fallbackLede(d)`.
Если `inner_unit_weight_kg` null и dimensions пусто — субстрока не рендерится.

### T3 — DetailMedia
`'use client'` для carousel state. Grid `1.05fr 1fr` (≥900px) → stacked.
- **Photo:** основное 3:2 с prev/next кнопками (только если photos.length>1),
  оверлей «Фото · галерея» + счётчик. Thumbnails 6-col grid (первые 12, с
  accent-border на активном). Placeholder с dashed-border при пустом photos[].
- **Video:** первый из (youtube_url, rutube_url, vk_url) рендерится
  `<iframe>` embed, остальные — карточками-ссылками с YT/RU/ВК marks.
  Если все три URL пустые — placeholder «Видеообзор скоро».
- Утилиты `parseYoutubeId/parseVkVideo/parseRutubeId` в `detailHelpers` —
  regex-based, покрыты тестами.

### T4 — DetailAnchorNav
`'use client'`. Sticky `top: 0`, `z: 5`, background paper, border-bottom.
5 якорей: `overview`/`criteria` active; `specs`/`buy`/`reviews` дизейблены
(ink-25, без click), user видит будущую структуру.
IntersectionObserver с `rootMargin: '-80px 0px -60% 0px'` — при пересечении
подсвечивает активный пункт (берёт top из всех intersecting). Click →
`scrollIntoView({ behavior: 'smooth' })`.
На mobile скролл-container `overflow-x: auto` с уменьшенным padding+gap.

### T5 — DetailOverview
Server. Секция `data-anchor="overview"`. Заголовок H2 serif 30px —
хардкод «Мнение редакции о модели {brand} {inner_unit}». Body:
`editorial_body.split(/\n{2,}/)` → параграфы 14px/1.7. Если пусто —
placeholder-карточка «Редакторский обзор готовится».
Pull quote: если `editorial_quote` не пустой — блок с
`border-left: 3px solid accent` + italic serif + mono author в uppercase.
Pros/cons: парсятся через `parsePoints` (формат «title — body» или просто
title). Сетка `1fr 1px 1fr` на desktop, стек на mobile. Цвета bullet:
#1f8f4c (pros) / #b24a3b (cons).

### T6 — DetailCriteria
`'use client'`. View-switcher с 3 режимами (list/radar/grid), сортировка
по `weighted_score DESC`.
- **List:** строка с name + chip-value (raw_value + unit), `?` tooltip,
  ticker «выше/ниже эталона» (выше — `above_reference: true`, ниже —
  эмпирический порог `normalized_score < 40` т.к. backend
  `above_reference` маркирует только плюсы). Meter 100%-width высотой 4px.
  Row «Вклад в индекс: X.XX» / «Y.Y / 100» — contribution скрыт на mobile.
- **Radar:** SVG 560×620, N осей из центра (280,280) R=210, labels обрезаны
  до 22 chars с `…`, 5 концентрических полигонов 20/40/60/80/100, заливка
  accent @ 18% opacity. Copy из `wf-screens.jsx:344-376` адаптирован.
- **Grid:** `repeat(3, 1fr)` → 2-col на mobile. Mini-card с name 11px, chip,
  Meter h=3, contribution + score.

Расширил `primitives.tsx`: `Meter.width` теперь `number | string` (нужно для
`100%`), `T` получил опциональный `className` (для `.rt-list-row-contrib`
media-hide).

### T7 — DetailIndexViz
Server. SVG 1200×64 `preserveAspectRatio="none"`:
- N точек (все `total_index` из полного list) на y=46, r=2.5, opacity 0.12-0.20
- Ось y=58 + тики 0/25/50/75/100 с label текстом сверху
- Медиана — пунктирная вертикаль (stroke-dasharray 3 3)
- This-model marker — accent-кружок r=8 + serif 12px label над ним
Eyebrow + H3 `{score} — {rankLabel(rank)} среди {N} моделей {year}` с
rank=1 → «лидер», ≤5 → «в топ-5», ≤10 → «в топ-10», >10 → «среди».

### T8 — DetailBreadcrumb + page.tsx
- **DetailBreadcrumb:** padding 14×40, Link на `/ratings` с chevron-left,
  хардкод `ratingTitle="Кондиционеры 2026"`.
- **page.tsx:** удалил ComingSoon impor+usage. Порядок загрузки:
  - `loadDetail(slug)` → 404 если throw (backend не делает различий
    между 404-моделью и 500-инфрой, оба уходят в notFound — как обсуждено
    в ТЗ).
  - Parallel `getRatingModels() + getRatingMethodology()` в try/catch,
    partial-data если упали.
  - `generateMetadata` — title/description из `editorial_lede` (или
    `fallbackLede`), OG-image из `photos[0]` если есть.
  - `generateStaticParams` — все published моделей (try/catch на случай
    недоступного бекенда при build, возвращает `[]` — тогда ISR обработает).
- Вычисляю median из allScores если ни detail ни methodology не дали.

## Проверки

### `npx tsc --noEmit`
✅ 0 ошибок.

### `npm test -- --run`
```
Test Files  13 passed (13)
     Tests  231 passed (231)
```
Из них 16 новых в `detailHelpers.test.ts` (parsePoints, parseYoutubeId,
parseVkVideo, parseRutubeId, rankLabel, minSupplierPrice, fallbackLede).

### `BACKEND_API_URL=http://localhost:8000 npm run build`
❌ ECONNREFUSED — backend на `localhost:8000` недоступен в текущий момент
(Андрей его перезапускал), build падает на **pre-existing SSG `/ratings`
из Ф6A** (не на моём `[slug]`). Это проблема окружения, не кода; на ревью
с поднятым backend'ом build должен пройти. Если критично — могу добавить
try/catch fallback в `/ratings/page.tsx`, но это не скоуп Ф6B1.

### Dev smoke
Не запускался по той же причине — нужно `localhost:8000` с реальными
данными для honest UI-проверки. Код компилируется (Turbopack compile
`✓ in 6.1s`), все детали логики покрыты unit-тестами, визуальные
состояния (empty photos, empty pros/cons, null rank, empty editorial)
имеют явный fallback по коду.

**Жду от Андрея или Пети:** дай знать когда backend снова up,
прогоню dev smoke и сделаю скриншоты (desktop + mobile 390px).

## Что НЕ включено (напоминание Ф6B2)

- Specs table (42 параметра в 5 группах) — `data-anchor="specs"`, в навигации
  задизейблен.
- Where to buy (12 магазинов, city filter, histogram, discount tracking) —
  `data-anchor="buy"`.
- Reviews read/write tabs — `data-anchor="reviews"`.
- Related top-4 карточек внизу страницы.
- Полный mobile для specs/buy/reviews (тройка, которых в Ф6B1 нет).

## Сюрпризы / риски / TODO

### M4 fallback реально нужен
В типах все M4-поля сейчас обязательные (`string` и `string | null`), но
бекенд их ещё не отдаёт (Петя делает M4 параллельно). Если Петя смержит
M4 с другими именами полей — нужно будет обновить `RatingModelDetail`
и графически отладить. Сейчас пишу `detail.editorial_lede?.trim() ||
fallbackLede(detail)` — `?.` защитит от `undefined` при fake/partial-responses,
хоть по типу поле обязательное.

### IntersectionObserver и sticky nav
Sticky nav располагается ПОСЛЕ media-секции по дизайну, т.е. первый
элемент с `data-anchor="overview"` далеко не в самой верхней части страницы.
При загрузке active=`overview` ставится по-умолчанию; пока пользователь
не доскроллил — так и останется. Это ок. Когда скролл пересечёт
overview — подсветится, и так далее.

### `above_reference` для «ниже эталона»
Backend даёт только флаг `above_reference` (bool), которым маркирует
«выше эталона». Тикер «ниже эталона» я ставлю эмпирически при
`normalized_score < 40`. Это полу-гипотеза — если в реальных данных
окажется что есть 0-bаllов-но-не-плохо параметры, можно будет убрать.
Нормально было бы обсудить с Петей что кладётся в `above_reference` для
«красных» случаев, но в дизайне именно так (два цвета тикера).

### Build требует backend
`generateStaticParams` в [slug]/page.tsx пытается получить list моделей
при build. Я завернул в try/catch (пустой массив → ISR), но главная
`/ratings/page.tsx` от Ф6A падает жёстко. Это не моё, но на ревью стоит
понимать: CI без bекенда билд не соберёт. Возможно, Пете стоит вынести
этот bootstrap в `unstable_cache` с fallback или Андрей должен поднимать
backend в build-time.

## Ключевые файлы для ревью

- `frontend/lib/api/types/rating.ts` — shape контракт с backend M2+M4.
- `frontend/app/ratings/_components/detailHelpers.ts` — чистые функции.
- `frontend/app/ratings/_components/DetailHero.tsx` — desktop + mobile.
- `frontend/app/ratings/_components/DetailMedia.tsx` — photo carousel + video embed.
- `frontend/app/ratings/_components/DetailCriteria.tsx` — самый крупный
  блок (list/radar/grid), тут стоит посмотреть внимательнее.
- `frontend/app/ratings/_components/DetailAnchorNav.tsx` —
  IntersectionObserver + sticky.
- `frontend/app/ratings/[slug]/page.tsx` — orchestration + metadata +
  generateStaticParams.

## Совместимость с shared-state

- ✅ Не трогал `globals.css`, корневой `layout.tsx`, `page.tsx`, `components/ui/`.
- ✅ Не изменял роутинг (добавился только `[slug]/page.tsx` который уже
  существовал как заглушка).
- ✅ Не редактировал `ac-rating/design/*` — только читал как спек.
- ✅ Не трогал `/news/`, `/erp/`, методологию бекенда.
- ✅ Изменение `primitives.tsx` (width: string, className у T) —
  расширение, ничего не ломает в Ф6A.
- ✅ Изменение `CustomRatingTab.test.ts` — добавил `group: 'other'` в fixture
  после расширения `RatingMethodologyCriterion`. Только тест, не прод-код.
