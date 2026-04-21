# ТЗ Фазы Ф6C — Статические страницы (methodology + archive + submit)

**Фаза:** Ф6C (frontend, `/ratings/methodology/`, `/ratings/archive/`, `/ratings/submit/`)
**Ветка:** `ac-rating/f6c-static-pages` (от `main`)
**Зависит от:** Ф6A, Ф6B1, Ф6B2, M4 (все в main)
**Оценка:** 1-1.5 дня

## Контекст

Ф6A/B1/B2 закрыли главную + детальную страницы публичного рейтинга. Остались 3 F0-скелета
с `<ComingSoon/>` в `methodology/`, `archive/`, `submit/` — заменяем полноценными
страницами. Дизайн: `ac-rating/design/wf-screens.jsx:1385-1516` (Methodology),
`:1518-1776` (Submit), `:1779-1839` (Archive).

**Backend для всех 3 страниц уже готов:**
- `GET /api/public/v1/rating/methodology/` — 30 активных критериев с `weight`, `group`, `group_display`, `name_ru`, `description_ru`, `unit`, `value_type`, `scoring_type`
- `GET /api/public/v1/rating/models/archive/` — plain array архивных моделей (после M3)
- `GET /api/public/v1/rating/brands/` — plain array активных брендов для dropdown в Submit
- `POST /api/public/v1/rating/submissions/` — multipart/form-data с 26 полями + photos (FILES) + honeypot website. Ratelimit 3/час per IP.

**Декор-gaps (принимаем как есть):**
- `ACModel` не имеет `archive_reason` и `archived_at` — в Archive **не** рендерим колонки «Выбыл» и «Причина». Фильтр-chips убираем. Таблица: бренд / модель / индекс.
- Боевой архив сейчас пуст (0 моделей, M3 smoke подтвердил). Визуально работает через empty state. Когда админ переведёт модель в `publish_status='archived'` — сама появится.

## Задачи

### T1. MethodologyPage (0.3 дня)

**`frontend/app/ratings/methodology/page.tsx`** (server component + client island):

Удалить `ComingSoon` import+usage. Получить данные:
```ts
export const revalidate = 3600;
export default async function MethodologyPage() {
  const methodology = await getRatingMethodology();
  return (
    <>
      <RatingHeader />
      <MethodologyHero stats={methodology.stats} criteriaCount={methodology.criteria.length} />
      <MethodologyTable criteria={methodology.criteria} />
    </>
  );
}
```

**`MethodologyHero.tsx`** (server):
- Grid 2col (`1fr 300px`), padding 40×56, alignItems end
- Слева: Eyebrow «Методика рейтинга · v1.0» + H1 serif 42px «Как мы считаем индекс Август-климат» + paragraph (editorial, serif, line-height 1.65)
- Справа: 3 мини-stats (Критериев/Сумма весов/Версия), каждый `flex justify-between baseline borderBottom subtle`, label mono 11px uppercase, value serif 22px
- Сумма весов = `methodology.criteria.reduce((s,c) => s+c.weight, 0)` (обычно 100%)

**`MethodologyTable.tsx`** (client 'use client'):

Легенда типов сверху — chip-row с 5 кнопками:
```ts
const TYPE_META = {
  num:      { label: 'Числовой',        dot: 'hsl(var(--rt-accent))', bg: 'hsl(var(--rt-accent-bg))' },
  bin:      { label: 'Бинарный',        dot: 'hsl(var(--rt-ink-60))', bg: 'hsl(var(--rt-chip))' },
  cat:      { label: 'Категориальный',  dot: '#c87510',               bg: 'rgba(200,117,16,0.10)' },
  fallback: { label: 'С fallback',      dot: '#2f8046',               bg: 'rgba(47,128,70,0.10)' },
  age:      { label: 'Возраст',         dot: '#8a3ea8',               bg: 'rgba(138,62,168,0.10)' },
};
```

**Определение типа:** backend отдаёт `scoring_type` и `value_type`. Маппинг:
- `scoring_type === 'binary'` → `bin`
- `scoring_type === 'categorical'` → `cat`
- `scoring_type === 'fallback'` → `fallback`
- `scoring_type === 'age'` → `age`
- default (`linear`, `exponential`, etc.) → `num`

Если backend отдаёт `scoring_type` в неизвестном формате — проверь через `curl .../methodology/ | jq '.criteria[0].scoring_type'` перед началом T1.

Counts под лейблом — `criteria.filter(c => typeOf(c) === k).length`.

**Accordion-таблица** с header row + 30 data rows:
- Grid `1fr 150px 100px 200px 24px` (desktop) / `1fr auto auto 24px` (mobile)
- Columns header: Критерий / Тип шкалы / Вес / Шкала / ''
- Data row: #{order.padStart(2,'0')} + `c.name_ru` + unit (mono 10), type-chip, weight% + meter-bar, scale description (pulled из `c.description_ru`), expand icon `+` → rotate 45deg on open
- State `open: Set<string>` (codes) — `toggle(code)` → add/remove.
- Дефолт: первые 3 критерия открыты (`open = new Set(criteria.slice(0,3).map(c => c.code))`)
- При open: padded section с 2col `1fr 240px`:
  - Left: `c.description_ru` serif 13px line-height 1.65
  - Right: «Как оценивается» card с `rt-alt` bg, showing scale + unit

Сортировка `criteria` — по `weight DESC`. Если weights равны — стабильный порядок.

**Footer:**
- `rt-alt` background, padding 24px, border-top subtle
- Left: «Методика утверждена 2022 · актуальная версия v1.0»
- Right: `[Скачать PDF (ghost)]` disabled + `[Предложить модель →]` primary → `/ratings/submit/`

### T2. ArchivePage (0.2 дня)

**`frontend/app/ratings/archive/page.tsx`** (server, ISR 3600s):

```ts
export default async function ArchivePage() {
  const archived = await getRatingArchiveModels();  // новый метод в services/rating.ts
  return (
    <>
      <RatingHeader />
      <ArchiveHero count={archived.length} />
      <ArchiveTable models={archived} />
    </>
  );
}
```

Добавить в `frontend/lib/api/services/rating.ts`:
```ts
export function getRatingArchiveModels(): Promise<RatingModelListItem[]> {
  return ratingFetch<RatingModelListItem[]>('/models/archive/');
}
```

**`ArchiveHero.tsx`** (server):
- Grid flex с baseline, borderBottom subtle, padding-bottom 18
- Eyebrow «Архив моделей» + H2 serif 26px «Модели, выбывшие из рейтинга»
- Description text (editorial serif, max 480px)
- Right: `{count}` serif 28px + «МОДЕЛЕЙ В АРХИВЕ» caption mono 11px

**`ArchiveTable.tsx`** (server):

**Empty state** (`models.length === 0`):
- Card padding 40px text-center
- Eyebrow «Архив пуст»
- Text «В архиве пока нет моделей. Когда модель перестаёт быть актуальной, она переносится сюда со всеми замерами и индексом.» (14px ink-60)

**Если есть данные:**
- Sort-chips row: `[По индексу ↓ (active)]` — один вариант, т.к. year/reason недоступны. Без filter-chips (у нас нет reason-поля).
- Таблица, grid `1.4fr 2fr 80px 30px`:
  - Header: «Бренд», «Модель», «Индекс», «»
  - Row: brand (mono 12 weight 600), inner_unit (12), `total_index.toFixed(1)` (mono 12 weight 600 ink-40), chevron-right 14px
  - Click → `<Link href={`/ratings/${m.slug}`}>` (карточка остаётся доступной даже в архиве)

Сортировка — по `total_index DESC`.

### T3. SubmitPage (0.6 дня)

**`frontend/app/ratings/submit/page.tsx`** (server shell + client form):

```tsx
export default async function SubmitPage() {
  const brands = await getRatingBrands();  // новый метод
  return (
    <>
      <RatingHeader />
      <SubmitForm brands={brands} />
    </>
  );
}
```

Добавить в `services/rating.ts`:
```ts
export interface RatingBrandOption { id: number; name: string; }
export function getRatingBrands(): Promise<RatingBrandOption[]> {
  return ratingFetch<RatingBrandOption[]>('/brands/');
}
```

**`SubmitForm.tsx`** (client, большой):

**Layout** (desktop):
- Padding `40px 40px 60px`, max-width 960
- Eyebrow «Заявка» + H1 serif 30px + descriptive paragraph
- «Как это работает» info-box (`rt-alt` bg, radius 4, padding 18×20) — нумерованный список 4 шагов
- «Самые тихие отдельно» info-box (`rt-accent` borderLeft 3px, `rt-accent-bg` bg) — абзац с email `7883903@gmail.com`
- Progress-chips (визуально 5 секций, все disabled — просто индикатор) — **не реализуем интерактив**, это дизайн-декор

**Форма** — 5 секций через helper `<Section num="01" title="...">`, каждая:
- Header row: mono `#NN` accent + H3 18px title
- Padding top 22, border-top subtle

**01 Модель:**
- Row 2col: `<Select name="brand">` (из `brands` prop) + `<Input name="custom_brand_name">` («—» если «Другой» выбран в bond dropdown). Hack: добавить `<option value="">Другой</option>` в dropdown, при выборе — показать custom_brand_name-input.
- Row 2col: `<Input name="series">` + ... (серия optional)
- Row 2col: `inner_unit` + `outer_unit` (оба required)
- Row 3col: `compressor_model` + `nominal_capacity_watt (unit=Вт)` + `price (unit=₽)` (первые 2 required, last optional)

**02 Характеристики:**

Рендерим через общий `<BinaryField name="..." label="..." tip="..." />` + `<IntField name="..." />` и т.д.

Поля (все required кроме помеченных):
- `drain_pan_heater` — **Radio** Нет/Есть
- `erv` — Radio Нет/Есть
- `fan_speed_outdoor` — Radio Нет/Есть
- `remote_backlight` — Radio Нет/Есть
- `fan_speeds_indoor` — **Input** number `шт.` (int ≥ 1)
- `fine_filters` — **Radio** 0/1/2 (строгий enum в serializer)
- `ionizer_type` — **Select** (Нет / «ПДС» / «Серебро» / «Биоклимат» / другие опции из choices на backend)
- `russian_remote` — Select аналогично
- `uv_lamp` — Select

**Важно:** choices для `ionizer_type`/`russian_remote`/`uv_lamp` **хардкодим** на фронте по дизайну + backend choices enum. Если бэк значения отличаются — агент делает quick check через `curl /admin/ac_submissions/...` или смотрит в `backend/ac_submissions/models.py` (поля `ionizer_type` имеют choices atom). См. подсказку техлида.

**03 Теплообменник внутр.:**
- Row 3col: `inner_he_length_mm` (unit=мм) + `inner_he_tube_count` (unit=шт.) + `inner_he_tube_diameter_mm` (unit=мм)

**04 Теплообменник наруж.:**
- Row 2col: `outer_he_length_mm` + `outer_he_tube_count`
- Row 2col: `outer_he_tube_diameter_mm` + `outer_he_thickness_mm`

**05 Подтверждение:**
- Photos upload — `<input type="file" name="photos" multiple accept="image/jpeg,image/png">`
  с кастомной кнопкой (скрытый input, видимый `<label>` с dashed border, padding 22×16, drop-zone look). 
  State: `const [photos, setPhotos] = useState<File[]>([])`.
  Валидация client-side: 1 ≤ N ≤ 20, каждый ≤ 10MB. Показ превью (небольшие imgs через URL.createObjectURL).
- `<Input name="video_url">` (optional)
- Ссылки: `buy_url` + `supplier_url` (2col, обе optional)
- Контакт: `submitter_email` (required, type="email")

**Согласие + submit:**
- Checkbox `consent: boolean` (required=true) — «Я даю согласие на обработку персональных данных...».
- `<input type="text" name="website" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />` — **honeypot**.
- Button primary «Отправить заявку →», disabled пока `consent && photos.length > 0 && required-text fields filled`.
- Button ghost «Сохранить черновик» — **disabled placeholder** (нет backend-поддержки).

**Submit logic:**
```ts
async function handleSubmit(e: FormEvent) {
  e.preventDefault();
  const fd = new FormData();
  // append all string/bool fields from local state
  fd.append('brand', brandId);
  // ... или если brandId==='', не append brand, только custom_brand_name
  photos.forEach(f => fd.append('photos', f));
  fd.append('website', '');  // honeypot empty
  fd.append('consent', 'true');

  const url = `${NEXT_PUBLIC_BACKEND_URL}/api/public/v1/rating/submissions/`;
  const res = await fetch(url, { method: 'POST', body: fd });
  if (res.ok) {
    setStatus('success');
    resetForm();
  } else if (res.status === 429) {
    setStatus({ type: 'error', message: 'Слишком много заявок, попробуйте через час.' });
  } else if (res.status === 400) {
    const err = await res.json();
    setStatus({ type: 'error', message: 'Проверьте форму', errors: err });
  } else {
    setStatus({ type: 'error', message: 'Что-то пошло не так. Повторите позже.' });
  }
}
```

**Success banner** — тот же урок что в Ф6B2 DetailReviews: вынести **над** `<form>`, чтобы
при reset формы banner не размонтировался. Показать «Заявка отправлена на модерацию.
Проверьте почту {submitter_email} — результаты рассмотрения придут туда». Автоматически
исчезает через 10 секунд (setTimeout), либо при навигации.

**Error banner** — inline рядом с submit-кнопкой, показывает field-errors если backend
вернул 400 (`err.field` → показывать у соответствующего input красное сообщение).

### T4. Удалить ComingSoon.tsx (0.05 дня)

После мержа T1-T3 — `frontend/app/ratings/_components/ComingSoon.tsx` больше **нигде не
импортируется** (он жил в methodology/submit/archive/[slug]; [slug] уже очищен в Ф6B1).

Удалить:
```bash
rm frontend/app/ratings/_components/ComingSoon.tsx
```

Сделать поиском что нигде не используется: `grep -r "ComingSoon" frontend/` должен вернуть пусто.

### T5. Тесты (0.15 дня)

**`methodology.test.tsx`** (vitest-react):
- Рендер пустого methodology (0 criteria) → пустой state
- TypeOf для `scoring_type: 'binary'` → returns 'bin'
- Expand/collapse at test — click на row меняет state

**`submit.test.tsx`**:
- Валидация: photos.length < 1 → submit disabled
- Валидация: photos > 20 → error message client-side
- Honeypot: если `website` заполнен в form-state — submit **не отправляется** (client-side guard) либо backend отклонит
- 429 response → correct error banner

**`archive.test.tsx`**:
- Empty state при archived.length === 0
- Sort по `total_index DESC`

**Ожидаемые тесты:** ~10 новых, 266 + 10 = ~276.

### T6. Mobile-адаптации (0.15 дня)

- **Methodology** — таблица: stack columns (name + chip+weight в одну row, scale под ними); footer: stack
- **Archive** — таблица → cards (brand+model+index)
- **Submit** — формы: 2/3-column rows → single column; textarea/select full-width; photos drop-zone full-width; sticky submit-button bottom-bar? (опционально, если помещается)

Во всех — CSS media через `@media (max-width: 899px)` внутри `<style>` или Tailwind `lg:grid-cols-X`.

## Приёмочные критерии

- [ ] `npx tsc --noEmit` — 0 ошибок
- [ ] `npm test -- --run` — все passing
- [ ] `BACKEND_API_URL=http://localhost:8000 npm run build` — успешно, `/methodology/`/`/archive/`/`/submit/` все `○ Static` в output
- [ ] `npm run dev`:
  - [ ] `http://localhost:3000/ratings/methodology/` — 30 критериев в аккордеоне, клики работают
  - [ ] `http://localhost:3000/ratings/archive/` — empty state (0 архивных в боевых данных)
  - [ ] `http://localhost:3000/ratings/submit/` — форма рендерится, загрузка 1 фото открывает preview, submit валидация блокирует пустой consent, POST с заполненными данными → banner «на модерации»
- [ ] `ComingSoon.tsx` — удалён, `grep -r "ComingSoon"` — пусто в frontend/
- [ ] Mobile 390px: все 3 страницы адаптируются

## Ограничения

- **НЕ менять** компоненты Ф6A/B1/B2 — они в main закрыты. Исключение — services/rating.ts расширение (getRatingArchiveModels + getRatingBrands).
- **НЕ добавлять** backend-поля. Serializer для submission уже принимает всё необходимое.
- **НЕ реализовывать** «Сохранить черновик» — backend не поддерживает, это placeholder-кнопка.
- **НЕ реализовывать** фильтр-chips в Archive по reason — нет поля.
- **НЕ использовать** form-library (react-hook-form, formik) — нативный `<form>` + `useState` достаточен.
- **НЕ хардкодить** 30 критериев в Methodology — брать из API `/methodology/`.
- **НЕ трогать** `/ratings/page.tsx` (Ф6A home) или `/ratings/[slug]/page.tsx` (Ф6B).
- Conventional Commits, по коммиту на подзадачу. Trailer `Co-authored-by: AC-Федя <ac-fedya@erp-avgust>`.

## Формат отчёта

`ac-rating/reports/f6c-static-pages.md`:
1. Ветка + коммиты
2. Что сделано (T1-T6)
3. Проверки: tsc, tests, build (3 new SSG pages), dev smoke с screenshots methodology/archive/submit (+submit с заполненной формой)
4. Сюрпризы / риски (напр. backend choices для ionizer_type — если не совпали, как обошёл)
5. Ключевые файлы
6. Что остаётся для Ф7+ (визуальный QA всего публичного раздела, редизайн HVAC news)

## Подсказки от техлида

- **Choices для ionizer_type/russian_remote/uv_lamp** — проверь перед T3 через `docker exec erp_avgust-backend-1 python manage.py shell -c "from ac_submissions.models import ACSubmission; print(ACSubmission._meta.get_field('ionizer_type').choices)"`. Бэкенд знает точный enum; хардкодь на фронте его choices. Если поле не TextChoices — запроси у меня через Андрея, сформируем вместе.
- **SSR vs client:** Methodology — server-рендер hero/footer, `<MethodologyTable/>` — client с accordion state. Archive — server (nothing interactive до Ф7). Submit — full client 'use client' из-за FormData + fetch + state.
- **generateStaticParams не нужен** — эти 3 страницы не динамические. Будет ISR по `revalidate: 3600`.
- **Preview фото через URL.createObjectURL**: не забудь `URL.revokeObjectURL(url)` при unmount или при удалении фото из state, иначе memory leak (хотя для формы submit-one-off — не критично).
- **`consent` as form field:** backend ждёт boolean, но multipart FormData сериализует как string. `fd.append('consent', 'true')` — backend вернёт `true` через ParseError при `'true'/'false'/'1'/'0'`; DRF BooleanField принимает эти форматы.
- **Ratelimit 3/час** — если тестируешь form POST 4+ раз, 4й вернёт 429. Не пугайся.
- **Honeypot website** — input `type="text"`, имя `website`, **visually hidden** (display:none + tabIndex=-1 + autoComplete=off). На backend уже есть validation: если непустое → 400 «spam detected».
- **PDF скачать в методике** — disabled placeholder. Настоящий PDF генерится нигде (нет endpoint). Don't add PDF generation — это отдельный эпик.
- **«Самые тихие» блок** — хардкод-info из дизайна с email `7883903@gmail.com`. Email — реальный (Андрей подтвердит или сменит через text-редактирование позже).
- **Backend urls** — проверь пути у себя: `curl http://localhost:8000/api/public/v1/rating/brands/ | jq 'length'` должен вернуть 22+. Если 0 — backend БД не прогружена.
- **Archive пуст в боевых данных** — это **ожидаемо**. Скриншот empty state тоже важен для отчёта.
- **Submit form — тяжёлая.** Если время поджимает — T3 можно разбить на 2 коммита (T3a «01-03 секции + framework», T3b «04-05 + submit + success»).

## Запуск

```bash
cd /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust
git fetch origin
git worktree add -b ac-rating/f6c-static-pages ../ERP_Avgust_ac_fedya_f6c origin/main
cd ../ERP_Avgust_ac_fedya_f6c/frontend && npm install
# Перезапусти claude из нового CWD. Клод backend'а держит на :8000.
```
