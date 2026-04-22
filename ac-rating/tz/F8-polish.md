# ТЗ Фазы Ф8 — Финальная полировка UX/layout публичного портала

**Фаза:** Ф8 (frontend, polish после prod-deploy)
**Ветка:** `ac-rating/f8-polish` (от `main`)
**Зависит от:** текущий main (прод живой на hvac-info.com)
**Оценка:** 2-3 дня

## Контекст

Прод на `hvac-info.com` работает с полным контентом (AC Rating 27 моделей, 120
опубликованных новостей, cross-links). Андрей прошёлся по UI и накидал пачку UX-замечаний.
Часть уже сделана мелкими фиксами (footer cleanup, back-link, force-dynamic, теме toggle
в header, убраны region/capacity фильтры, теал accent, full-width content на 1280px).

Осталась **большая полировка**, которая упирается в layout и интерактив — объединил в
Ф8 чтобы делать согласованно одной веткой.

## Задачи

### T1. Full-bleed Hero + Footer pattern (0.5 дня)

**Проблема:** цветные секции (`Hero` с `rt-alt`, `SectionFooter` с `rt-alt`) сейчас
обёрнуты в `<main className="hvac-content">` (max-width 1280). На широких экранах фон
обрезается по бокам — выглядит как полоса в середине на paper-background. **Андрей
хочет:** цветной фон **на всю ширину viewport**, а content внутри остаётся centered
max-1280.

**Реализация:**

Вынести `HeroBlock` и `SectionFooter` **за пределы** `<main className="hvac-content">`.
То есть структура page.tsx становится:

```tsx
<>
  <HvacInfoHeader />          {/* full-width уже */}
  <HeroBlock />               {/* full-width rt-alt bg, content centered inside */}
  <main className="hvac-content">
    {/* tabs + filters + таблица — centered в 1280 */}
  </main>
  <SeoBlock />                 {/* уже внутри main, остаётся */}
  <SectionFooter />            {/* full-width rt-alt bg, content centered inside */}
</>
```

Каждый full-bleed-компонент сам имеет внутреннюю обёртку:

```tsx
<section style={{ background: 'hsl(var(--rt-alt))', ... }}>
  <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 40px 36px' }}>
    {/* content */}
  </div>
</section>
```

**Важно:** часть контента Hero (editorial h1, авторы, стат-числа) уже имеет padding —
перенеси этот padding во внутреннюю wrapper, убери из внешнего.

**Применить к:**
- `HeroBlock.tsx` (home) — уже имеет `rt-alt` bg; нужна только inner-wrapper с `max-width: 1280`.
- `SectionFooter.tsx` (home) — уже `rt-alt`; inner-wrapper + выйти из `hvac-content`.
- `MethodologyHero.tsx` — **добавить** `background: hsl(var(--rt-alt))` (сейчас transparent) + inner-wrapper.
- `ArchiveHero.tsx` — аналогично: добавить `rt-alt` + inner-wrapper.
- Submit-hero (внутри `SubmitForm.tsx` — eyebrow + H1 + «как это работает» блок) — выделить в отдельный компонент `SubmitHero`, применить тот же pattern.

### T2. Footer + «Вход»-кнопка на всех 4 страницах рейтинга (0.15 дня)

**Проблема:** SectionFooter сейчас только на home `/ratings/`. На detail/methodology/archive/submit — нет.

**Реализация:**
- Добавить `<SectionFooter />` в `page.tsx`:
  - `/ratings/[slug]/page.tsx` — после `<DetailRelated />`
  - `/ratings/methodology/page.tsx` — после `<MethodologyTable />`
  - `/ratings/archive/page.tsx` — после `<ArchiveTable />`
  - `/ratings/submit/page.tsx` — после `<SubmitForm />`
- Разместить **вне** `<main className="hvac-content">` (по T1 full-bleed).

**Добавить «Вход» в SectionFooter.** Андрей решил: auth для отзывов + комментариев +
ERP-входа, кнопка в footer (не в header).

В `SectionFooter.tsx`:
- Оставить 3 existing-ссылки (Как мы считаем / Архив / Добавить модель)
- Добавить **второй ряд** с кнопкой «Вход →»:
  ```tsx
  <div style={{ marginTop: 20 }}>
    <Link href="/login/" style={{ ... аналогично btn-primary но меньше ... }}>
      Вход →
    </Link>
  </div>
  ```
- Или расположить «Вход» справа inline с 3 ссылками (flex, justify-between).
- Href — `/login/` (существующий route ERP). Если Next откроет ERP admin — ок, это и
  нужно. Проверь через `ls frontend/app/login/` — путь есть.

### T3. Sticky collapse-header при скролле (вариант B) (0.8-1.2 дня)

**Поведение (согласовано с Андреем):**

Изначально (top of page):
```
[HvacInfoHeader]           ← nav-полоска
[Hero — editorial + авторы]
[Tabs + FilterBar]         ← (только на /ratings/ home)
[Content]
```

При скролле **вниз**:
1. `HvacInfoHeader` **уезжает** вверх (обычный non-sticky scroll).
2. `Hero` collapsers в узкую полосу (~90-110px):
   - Оставить: eyebrow + 3 числа (inline, не вертикальный стек)
   - Оставить: авторы (компактный inline, 2 аватара + имена одной строкой)
   - **Скрыть**: editorial H1 (большой серифный заголовок), chip-row «О рейтинге»
   - Bg остаётся `rt-alt`
3. `Tabs + FilterBar` прилипают **под** collapsed-hero.
4. Контент скроллится под sticky-блоком.

При скролле **вверх** (до top):
- `HvacInfoHeader` **возвращается** сверху (появляется снова)
- Hero **expand'ится** обратно в full-size.

**Реализация (React):**

Компонент `<StickyCollapseHero>` (переиспользуемый):

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';

export function StickyCollapseHero({
  full,           // ReactNode: full-размер Hero
  collapsed,      // ReactNode: compact-версия
  children,       // под sticky — Tabs + FilterBar etc.
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => setIsCollapsed(!entry.isIntersecting),
      { rootMargin: '-1px 0px 0px 0px', threshold: 0 }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      {/* Sentinel — невидимый элемент в top of page.
          Когда он уходит из viewport (страница проскролена) — IntersectionObserver
          триггерит isCollapsed=true. */}
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />

      {/* Full Hero — рендерится когда not collapsed */}
      {!isCollapsed && full}

      {/* Sticky-блок: collapsed Hero + children (Tabs + FilterBar) */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'hsl(var(--rt-paper))',
          boxShadow: isCollapsed
            ? '0 1px 2px hsl(var(--rt-border-subtle))'
            : 'none',
        }}
      >
        {isCollapsed && collapsed}
        {children}
      </div>
    </>
  );
}
```

**Применить на 4 страницах рейтинга:**

- `/ratings/` home — `<StickyCollapseHero full={<HeroBlock />} collapsed={<HeroBlockCollapsed />}>` оборачивает `<RatingTabs /> + <FilterBar />`.
- `/ratings/[slug]/` — `<StickyCollapseHero full={<DetailHero />} collapsed={<DetailHeroCollapsed />}>` оборачивает `<DetailAnchorNav />`.
- `/ratings/methodology/` — `<StickyCollapseHero full={<MethodologyHero />} collapsed={<MethodologyHeroCollapsed />}>` (children пустые — таблица ниже просто скроллится).
- `/ratings/archive/` — аналогично.
- `/ratings/submit/` — **не применяется**, форма с полями лучше прокручивается целиком.

**Collapsed-компоненты:**

Для каждого Hero создай `XxxCollapsed` компонент (в том же файле), который рендерит
компактную версию:

- `HeroBlockCollapsed`: горизонтальный flex `[Eyebrow + 3 числа] [авторы compact]`, padding 12×40, bg `rt-alt`, border-bottom subtle.
- `DetailHeroCollapsed`: `[brand] [№1] [inner_unit]`, padding 10×40.
- `MethodologyHeroCollapsed`: `[eyebrow: методика v1.0] [30 критериев · 100%]`.
- `ArchiveHeroCollapsed`: `[eyebrow: архив] [N моделей]`.

Высота collapsed-блока не должна превышать **~100px**, чтобы под ней хватало места
для таблицы.

**Анимация (опционально):** CSS `transition: all 200ms ease` на `background` +
`box-shadow` для плавного перехода. Сам layout снапается (не анимируется), т.к. это
сложно с React conditional rendering.

### T4. Theme toggle — уже сделано в main commit `bc58e69`. Skip.

### T5. Client-side Search в header (0.4 дня)

Добавить кнопку-лупу в header (возвращаем `SearchIcon`, но теперь с функцией).

**UX:**
- Клик на лупу → открывается overlay-dialog (fullscreen на mobile, centered modal 500×auto на desktop)
- Input с autofocus, placeholder «Марка, модель кондиционера, новость…»
- Results live-обновляются по `onChange`:
  - Модели (бренды): фильтр по `brand + inner_unit + series`, показать до 10 результатов
  - Новости: фильтр по `title` первой страницы (20-30 свежих), показать до 5
- Клик на результат → navigate на `/ratings/<slug>` или `/news/<id>`, modal закрывается
- Esc / клик вне dialog → закрыть
- Empty state: «Начните набирать…»
- No-results: «Ничего не найдено по запросу {q}»

**Реализация:**

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { getRatingModels } from '@/lib/api/services/rating';
import { getNews } from '@/lib/hvac-api';

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    if (!open) return;
    Promise.all([getRatingModels(), getNews(1)]).then(([m, n]) => {
      setModels(m);
      setNews(n.results);
    });
  }, [open]);

  const filteredModels = q.length < 2 ? [] : models.filter(m =>
    m.brand.toLowerCase().includes(q.toLowerCase()) ||
    m.inner_unit.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 10);
  const filteredNews = q.length < 2 ? [] : news.filter(n =>
    n.title.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 5);

  // ... render overlay + input + results
}
```

**Открытие:**

В `HvacInfoHeader` рядом с ThemeToggle — `<SearchButton onClick={() => setSearchOpen(true)} />`
(иконка-лупа). State `searchOpen` хранится в `useState` header-компонента.

**Закрытие:** Esc, клик на backdrop, клик на результат.

**Поиск по новостям** — на момент Ф8 только по `title` полей первой страницы (20-30 штук).
Если Андрей захочет full-text — это отдельный эпик M7 (backend search endpoint
через `NewsPost.body` full-text).

### T6. ThemeToggle + ServerSafe SSR (уже сделано, но проверить в Ф8)

Theme toggle — был добавлен в main commit `bc58e69`. В Ф8 **только протестируй** что
при переключении **все cтраницы** (home, detail, methodology, archive, submit)
корректно перекрашиваются. Если где-то dark-color tokens не применены — докрути.

Логотип: в `HvacInfoHeader.tsx` есть два варианта (`rt-logo-light`/`rt-logo-dark`),
переключаются через `.dark .rt-logo-light { display:none }`. Проверь что работает.

### T7. Тесты (0.15 дня)

- `newsHelpers.test.ts` — если добавлена search-фильтрация, unit-тест на search-logic.
- `StickyCollapseHero.test.tsx` — render full/collapsed states, IntersectionObserver mock.
- `ThemeToggle.test.tsx` — localStorage persistence, class toggle.

~5-8 новых тестов.

## Приёмочные критерии

- [ ] `cd frontend && npx tsc --noEmit` — 0 ошибок
- [ ] `cd frontend && npm test -- --run` — passing
- [ ] `cd frontend && BACKEND_API_URL=http://localhost:8000 npm run build` — успешно
- [ ] `/ratings/`:
  - Hero rt-alt full-bleed (фон до краёв viewport)
  - При скролле — HvacInfoHeader уходит, Hero collapsers, Tabs+FilterBar sticky
  - При скролле обратно — Hero expand'ится, header возвращается
  - Footer full-bleed с 3 ссылками + «Вход»
- [ ] `/ratings/[slug]/` + `/ratings/methodology/` + `/ratings/archive/` — такой же sticky-collapse pattern + full-bleed footer
- [ ] `/ratings/submit/` — footer есть, sticky не применяется
- [ ] Theme toggle переключает dark/light на всех страницах без flash / white flicker
- [ ] Search — клик на лупу открывает modal, набор запроса → live-results моделей + новостей, клик navigate'ит, Esc закрывает
- [ ] Mobile 390px — все 5 страниц работают, sticky collapse plausible (возможно без collapse на mobile — просто не применяем sticky? Обсуди ограничения с узким viewport)

## Ограничения

- **НЕ менять** backend API, сериализаторы, миграции — всё фронт.
- **НЕ менять** auth-flow для «Вход» — кнопка просто ведёт на `/login/` route (уже существует в ERP).
- **НЕ реализовывать** серверный full-text search по news.body — client-side по title достаточен.
- **НЕ переделывать** iconos (все уже есть в коде), только рефакторить расположение.
- **НЕ трогать** `frontend/app/globals.css`, shadcn-tokens — всё через `.hvac-info-scope`.
- Conventional Commits, коммит на задачу. Trailer `Co-authored-by: AC-Федя <ac-fedya@erp-avgust>`.

## Формат отчёта

`ac-rating/reports/f8-polish.md`:
1. Коммиты + краткое описание каждой задачи
2. Screenshots:
   - `/ratings/` top (full hero + expanded)
   - `/ratings/` scrolled (collapsed hero + sticky tabs/filters)
   - `/ratings/methodology/` top + scrolled
   - Theme toggle: light vs dark state (side-by-side)
   - Search modal: empty, typing, results
   - Footer full-bleed
6. Сюрпризы / известные ограничения
5. Ключевые файлы

## Подсказки от техлида

- **IntersectionObserver rootMargin `-1px 0px 0px 0px`** — триггер прямо на границе viewport. Если срабатывает флакающе — попробуй `-50px 0px 0px 0px` (трансформация происходит когда scroll уже на 50px).
- **Theme flash** — есть риск «white flicker» при первом рендере (server рендерит в light, client обнаруживает preference dark). Решение: в `layout.tsx` добавить inline-script в `<head>`:
  ```html
  <script dangerouslySetInnerHTML={{__html: `
    try { const t = localStorage.getItem('hvac-theme');
    const d = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (d) document.documentElement.classList.add('dark');
    } catch(e){}
  `}} />
  ```
  Выполняется до first paint, класс `.dark` уже есть при render → нет flicker.
- **Sticky + z-index** — поставь `zIndex: 20` на sticky-блоке, `zIndex: 30` на search-modal. HvacInfoHeader не-sticky, zIndex не важен.
- **Search data — кеш.** При первом открытии modal — fetch 27 моделей + 20-30 новостей. Закрытие dialog → **не чистим state**, следующее открытие — мгновенно (данные в памяти). Через 5 минут — refetch (useMemo с timestamp).
- **Login route проверить:** `ls frontend/app/login/page.tsx`. Если нет — href = `/erp/` или обсудить с Андреем.
- **Mobile sticky** — viewport 390px, header 64px + hero collapsed 100px = 164px зарезервировано. Таблица имеет 226px для скролла. Тесно. Можно на mobile **не делать collapse**, а просто sticky-Tabs/FilterBar без Hero. Решай по UX.

## Запуск

```bash
cd /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust
git fetch origin
git worktree add -b ac-rating/f8-polish ../ERP_Avgust_ac_fedya_f8 origin/main
cd ../ERP_Avgust_ac_fedya_f8/frontend && npm install
# Перезапустись. Backend у Клода на localhost:8000.
```
