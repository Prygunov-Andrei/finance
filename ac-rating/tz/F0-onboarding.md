# ТЗ Фазы F0 — Onboarding Феди + фундамент frontend рейтинга

**Фаза:** F0 (onboarding + подготовка, вне основного плана)
**Ветка:** `ac-rating/f0-frontend-setup` (от `main`)
**Зависит от:** M1 (в main) — M2 параллельно делает Петя, не блокер
**Оценка:** 0.5 дня

## Контекст проекта

Привет, Федя. Ты frontend-инженер в команде AC Rating — интеграции «Рейтинг кондиционеров» в ERP Avgust. Полный контекст:
- `ac-rating/plan.md` — план на 10 фаз, модель команды, журнал прогресса
- `ac-rating/design/` — утверждённые вайрфреймы от клод-дизайна (8 секций, JSX-макет). **Прочитай** `index.html` (токены) + `wf-primitives.jsx` (компоненты) + `wf-nav.jsx` + `wf-listing.jsx` + `wf-app.jsx` (композиция). `wf-screens.jsx` (2540 строк) — смотри по мере нужды.
- `ac-rating/reports/` — отчёты backend-команды (Петя сделал Ф1-5 + M1). Backend готов: 190 тестов на ERP БД, публичный API `/api/public/v1/rating/*` работает.
- `ac-rating/tz/` — архив всех ТЗ (твоего в том числе — это файл, который ты сейчас читаешь).

**Модель команды:**
- Claude (техлид) — ТЗ, ревью, мерж. Это я.
- Андрей (PO) — бизнес-решения, визуальные проверки, запуск агентов.
- Петя (backend) — Django/DRF, сейчас делает M2 (rank/median/stats в API для твоего Ф6A).
- **Ты — Федя (frontend)** — Next.js 16 App Router, React, shadcn/ui, Tailwind 4.

**Git flow:** ветка `ac-rating/NN-short-name` от `main`, Conventional Commits, PR → я ревьюю, я мержу. Отчёт в `ac-rating/reports/<phase>.md` по шаблону из `plan.md` секция 3.

## Технический стек ERP (куда ты пишешь)

- `frontend/` — Next.js 16 App Router, React 18.3.1, Tailwind 4, shadcn/ui (22 примитива в `frontend/components/ui/`), TypeScript
- **Path aliases:** `@/*` → `./frontend/*`. Например `@/components/ui/button` = `frontend/components/ui/button.tsx`
- **Глобальные стили:** `frontend/app/globals.css` — Tailwind v4 с `@theme inline`, hsl-based tokens через CSS variables (`--primary`, `--background`, etc.), `.dark` variant
- **Существующие routes:**
  - `frontend/app/news/` — HVAC-новости (редизайним в Ф7, пока не трогать)
  - `frontend/app/erp/` — админка ERP (**НЕ ТРОГАТЬ**, это для других команд)
  - `frontend/app/ratings/page.tsx` — заглушка, ты её наполнишь
- **API клиент:** `frontend/lib/api/` — transport + services + types (есть паттерны в `@/lib/api/services/`)
- **Кастомные hooks:** `frontend/hooks/` — `useAsyncAction`, `useDialogState`, `useListFilters`

**Критично:** НЕ менять глобальные CSS-переменные shadcn (`--primary`, `--background`, `--foreground` и т.д.) — сломает админку ERP и HVAC-новости. Дизайн рейтинга использует **scoped tokens** внутри `/ratings/` layout (см. ниже).

## Публичный API рейтинга (готов, работает)

Петя сделал в Ф4A:

| Endpoint | Что отдаёт |
|---|---|
| `GET /api/public/v1/rating/models/` | Список published моделей + фильтры (brand, region, capacity, price) |
| `GET /api/public/v1/rating/models/<pk>/` | Деталь модели (параметры, фото, поставщики, отзывы) |
| `GET /api/public/v1/rating/models/by-slug/<slug>/` | То же по slug |
| `GET /api/public/v1/rating/models/archive/` | Архивные модели |
| `GET /api/public/v1/rating/methodology/` | Структура активной методики (критерии + веса) |
| `GET /api/public/v1/rating/brands/` | Список брендов |
| `GET /api/public/v1/rating/models/<id>/reviews/` | Отзывы модели (только approved) |
| `POST /api/public/v1/rating/reviews/` | Создать отзыв (ratelimit 5/час) |
| `POST /api/public/v1/rating/submissions/` | Подать заявку на добавление модели (FormData с фото) |
| `GET /api/public/v1/rating/export/csv/` | Экспорт рейтинга в CSV |

**Петя сейчас делает M2** — добавит в ответы:
- `rank` в list + detail (позиция по total_index в published-каталоге, без фильтров)
- `stats` в methodology: `{total_models, active_criteria_count, median_total_index}`
- `median_total_index` в detail context

Когда M2 смержен — я дам тебе ТЗ Ф6A с полной спецификацией. Сейчас — задача F0: фундамент.

## Задача F0 — 4 подзадачи

### 1. Scoped дизайн-токены рейтинга

Создай `frontend/app/ratings/_styles/tokens.css` (новый файл). Перенеси CSS-variables из дизайна (`ac-rating/design/index.html:12-72` + `wf-primitives.jsx:1-28`) в scoped layer:

```css
.rating-scope {
  --rt-ink: 0 0% 8%;               /* hsl эквивалент #141414 */
  --rt-ink-80: 0 0% 8% / 0.82;
  --rt-ink-60: 0 0% 8% / 0.60;
  --rt-ink-40: 0 0% 8% / 0.40;
  --rt-ink-25: 0 0% 8% / 0.25;
  --rt-ink-15: 0 0% 8% / 0.14;
  --rt-border: 0 0% 8% / 0.25;
  --rt-border-subtle: 0 0% 8% / 0.14;
  --rt-chip: 0 0% 8% / 0.07;
  --rt-line: 0 0% 8% / 0.12;
  --rt-paper: 42 30% 98%;          /* hsl эквивалент #fcfbf9 */
  --rt-alt: 42 20% 94%;            /* #f3f1ed */
  --rt-accent: 223 67% 48%;        /* #2856cc */
  --rt-accent-bg: 223 80% 95%;     /* #e8edfb */
  --rt-warn: 31 85% 42%;           /* #c87510 */
  --rt-ok: 136 47% 35%;            /* #2f8046 */
  --rt-bad: 8 62% 44%;             /* #b6372a */
  --rt-font-sans: 'Inter', system-ui, sans-serif;
  --rt-font-serif: 'Source Serif 4', Georgia, serif;
  --rt-font-mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
}

.dark .rating-scope {
  --rt-ink: 40 10% 92%;
  --rt-ink-80: 40 10% 92% / 0.82;
  /* ... и т.д. по дизайну (dark vars из index.html:30-44) */
  --rt-paper: 0 0% 9%;             /* #171717 */
  --rt-alt: 60 3% 12%;
  --rt-accent: 225 100% 71%;       /* #6b8bff */
  --rt-accent-bg: 225 100% 71% / 0.20;
}
```

- Префикс `--rt-*` вместо `--wf-*` (wireframe → rating) — чтобы понятно что scoped
- Использовать hsl с alpha (Tailwind 4 friendly). Но хекс можно оставить — не критично
- В `globals.css` НИЧЕГО не менять

### 2. Layout рейтинга + шрифты

Создай `frontend/app/ratings/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Inter, Source_Serif_4, JetBrains_Mono } from 'next/font/google';
import './_styles/tokens.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--rt-font-sans-loaded' });
const serif = Source_Serif_4({ subsets: ['latin', 'cyrillic'], variable: '--rt-font-serif-loaded' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--rt-font-mono-loaded' });

export const metadata: Metadata = {
  title: 'Рейтинг кондиционеров — hvac-info.com',
  description: 'Независимый рейтинг бытовых кондиционеров...',
};

export default function RatingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`rating-scope ${inter.variable} ${serif.variable} ${mono.variable} min-h-screen`}
         style={{
           background: 'hsl(var(--rt-paper))',
           color: 'hsl(var(--rt-ink))',
           fontFamily: 'var(--rt-font-sans), Inter, system-ui, sans-serif',
         }}>
      {children}
    </div>
  );
}
```

### 3. Route skeleton — 5 страниц + плоский header

Создай skeleton страницы (каждая с заглушкой «coming in Ф6») + **общий `<RatingHeader/>`** с плоской навигацией.

**`frontend/app/ratings/_components/RatingHeader.tsx`** — плоский header по `wf-nav.jsx`:

```tsx
const NAV_ITEMS = [
  { label: 'Новости', href: '/news', active: false },
  { label: 'Рейтинг', href: '/ratings', active: true },
  { label: 'ISmeta', href: '/smeta', active: false },
  { label: 'Мешок Монтажников', muted: true },          // неактивный
  { label: 'Анализ проектов', muted: true },
  { label: 'Франшиза', muted: true },
  { label: 'Ассоциация', muted: true },
  { label: 'Стандарт монтажа', muted: true },
];
```

- Активные пункты (Новости / Рейтинг / ISmeta) — обычные `<Link>`, подчёркивание у активного
- Белесые (muted) — `<span>` без `href`, цвет `hsl(var(--rt-ink-25))`, `cursor: 'default'`, `pointer-events: none`
- Справа: search icon (placeholder — без функционала), RU, theme toggle (placeholder), «Вход» (placeholder)
- Mobile — burger icon + drawer (пока можно только burger без функционала, полный drawer — Ф6A)

**Страницы (все SSR, каждая — просто заглушка):**
- `frontend/app/ratings/page.tsx` — главная (LIST-A будет в Ф6A)
- `frontend/app/ratings/[slug]/page.tsx` — деталь (DetailA в Ф6B)
- `frontend/app/ratings/methodology/page.tsx` — методика (Ф6C)
- `frontend/app/ratings/submit/page.tsx` — форма заявки (Ф6C)
- `frontend/app/ratings/archive/page.tsx` — архив (Ф6C)

Каждая страница:
```tsx
import RatingHeader from '../_components/RatingHeader';

export default function Page() {
  return (
    <>
      <RatingHeader />
      <main style={{ padding: '48px 40px', maxWidth: 1280, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--rt-font-serif)', fontSize: 40, fontWeight: 600 }}>
          Рейтинг кондиционеров
        </h1>
        <p style={{ color: 'hsl(var(--rt-ink-60))', marginTop: 12 }}>
          Страница в разработке (Ф6A). Дизайн: ac-rating/design/wf-listing.jsx RatingListA.
        </p>
      </main>
    </>
  );
}
```

### 4. TypeScript типы для rating API

Создай `frontend/lib/api/types/rating.ts`:

```ts
export interface RatingBrand {
  id: number;
  name: string;
  logo: string; // absolute URL или ''
}

export interface RatingRegion {
  region_code: string;
  region_display: string;
}

export interface RatingParameterScore {
  criterion_code: string;
  criterion_name: string;
  unit: string;
  raw_value: string;
  normalized_score: number;
  weighted_score: number;
  above_reference: boolean;
}

export interface RatingModelListItem {
  id: number;
  slug: string;
  brand: RatingBrand;
  series: string;
  inner_unit: string;
  outer_unit: string;
  nominal_capacity: number | null;
  price: string | null;   // Decimal → string
  total_index: number;
  rank: number;            // <-- добавляет Петя в M2
  regions: RatingRegion[];
  // ... уточнить после merge M2
}

export interface RatingModelDetail extends RatingModelListItem {
  pros_text: string;
  cons_text: string;
  youtube_url: string;
  rutube_url: string;
  vk_url: string;
  photos: Array<{ id: number; image: string; alt: string }>;
  suppliers: Array<{ id: number; name: string; url: string }>;
  parameter_scores: RatingParameterScore[];
  median_total_index: number;  // <-- добавляет Петя в M2
  // ...
}

export interface RatingMethodologyCriterion {
  code: string;
  name_ru: string;
  weight: number;
  unit: string;
  value_type: string;
  scoring_type: string;
}

export interface RatingMethodology {
  version: string;
  name: string;
  criteria: RatingMethodologyCriterion[];
  stats: {                // <-- добавляет Петя в M2
    total_models: number;
    active_criteria_count: number;
    median_total_index: number;
  };
}
```

**После merge M2** — я попрошу тебя свериться с реальным JSON-shape от Петиного smoke-curl. Сейчас типы — скелет на основе дизайна + Ф4A кода.

Минимальный API client `frontend/lib/api/services/rating.ts`:
```ts
import type { RatingModelListItem, RatingModelDetail, RatingMethodology } from '../types/rating';

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

export async function getRatingModels(): Promise<RatingModelListItem[]> {
  const r = await fetch(`${BASE}/api/public/v1/rating/models/`, { next: { revalidate: 3600 } });
  if (!r.ok) throw new Error('Failed to load models');
  return r.json();
}

export async function getRatingModelBySlug(slug: string): Promise<RatingModelDetail> {
  const r = await fetch(`${BASE}/api/public/v1/rating/models/by-slug/${slug}/`, { next: { revalidate: 3600 } });
  if (!r.ok) throw new Error('Model not found');
  return r.json();
}

export async function getRatingMethodology(): Promise<RatingMethodology> {
  const r = await fetch(`${BASE}/api/public/v1/rating/methodology/`, { next: { revalidate: 3600 } });
  if (!r.ok) throw new Error('Methodology not available');
  return r.json();
}
```

## Приёмочные критерии

- [ ] `npx tsc --noEmit` в `frontend/` — без ошибок
- [ ] `npm run build` в `frontend/` — успешно (skeleton-страницы рендерятся)
- [ ] `npm run dev` → `http://localhost:3000/ratings/` → **плоский header с 3 активными + 5 белесыми пунктами**, заглушка под ним
- [ ] `/ratings/[любой-slug]/`, `/ratings/methodology/`, `/ratings/submit/`, `/ratings/archive/` — тоже рендерятся, тот же header
- [ ] Никаких изменений в `frontend/app/globals.css`, `frontend/app/erp/*`, `frontend/app/news/*`
- [ ] `@/lib/api/types/rating.ts` — типы существуют, `tsc` не ругается
- [ ] `@/lib/api/services/rating.ts` — 3 функции, возвращают `Promise<Ratingxxx>`
- [ ] Токены `.rating-scope` скоупированы — на `/` или `/news/` визуальных изменений нет

## Ограничения

- **НЕ менять** shadcn компоненты в `frontend/components/ui/`
- **НЕ менять** существующие routes (news, erp, login, smeta, brands, manufacturers, resources, feedback)
- **НЕ менять** глобальный `frontend/app/globals.css`, `layout.tsx`, `page.tsx` (корень)
- **НЕ использовать** компоненты Максима из `ac-rating/review/` — это spec-only, читаем но не копируем код 1-в-1 (пишем свой TS)
- **НЕ использовать** `inline styles` в тонне мест — постепенно переводим на Tailwind. Для F0 inline OK в skeleton-страницах
- **НЕ подключать** framer-motion / анимации — это Ф6A
- **Don't** добавлять Donut / Meter / BrandLogo примитивы — будут в Ф6A, где с реальными данными
- Conventional Commits. По коммиту на задачу.

## Формат отчёта

Положи `ac-rating/reports/f0-frontend-setup.md` по шаблону (`plan.md` секция 3):
1. Ветка + коммиты
2. Что сделано — 4 подзадачи
3. Результаты проверок: `tsc --noEmit`, `npm run build`, `npm run dev` skeleton рендерится
4. Screenshots / терминальный вывод что `/ratings/` открывается с плоским header
5. Известные риски / сюрпризы
6. Ключевые файлы для ревью

## Подсказки от техлида

- **Tailwind v4 `@theme`:** не нужен для наших scoped tokens — просто CSS. Tailwind 4 не будет их обрабатывать в `@apply`, но это ОК — мы используем `hsl(var(--rt-*))` напрямую. Если хочется utility (`bg-rt-accent`) — придётся добавить в `@theme inline`, но для F0 не нужно.
- **Next.js 16 font-loader** (`next/font/google`) — правильный путь для Inter/Serif/Mono. Fonts из CDN через `<link>` тоже работают, но font-loader оптимальнее (self-hosted).
- **SSR vs RSC:** skeleton-страницы — server components по умолчанию. Interactivity (theme toggle, drawer) появится в Ф6A — тогда client islands с `'use client'`.
- **Когда читаешь wireframes (`ac-rating/design/*.jsx`)** — это JSX-макет, не production код. Многое написано inline-стилями для wireframe-пользы. Переноси смысл, не реализацию 1-в-1. У нас будут Tailwind classes и shadcn компоненты.
- **Почему не использовать существующий shadcn dark mode?** shadcn в ERP использует `.dark` variant на body → все переменные включаются. Рейтинг должен **наследовать** этот же `.dark` на уровне `<html>`, но иметь свою палитру через `.dark .rating-scope`. Это «тема внутри темы». Правильно.
- **«Tweaks» (панель в правом нижнем углу макета)** — dev-only удобство дизайнера (переключение theme/accent/density/section). В production НЕ включать. Можно добавить позже как `?debug=tweaks` dev feature, но не в F0.
- **Авторы методики в дизайне** — захардкоди в `RatingListA` когда дойдёшь до Ф6A (`['Андрей Петров','главный редактор'], ['Ирина Соколова','лаборатория акустики']`). Петя их НЕ добавляет в API.
