# Отчёт Ф6C — Статические страницы (methodology + archive + submit)

**Ветка:** `ac-rating/f6c-static-pages`
**От коммита:** `65999a6` (main на момент rebase 2026-04-21)
**Агент:** AC-Федя

## 1. Коммиты

```
ef3814e test(ac-rating): Ф6C T5 — тесты methodology/archive/submit (+19, итого 285)
11c5ce3 chore(ac-rating): Ф6C T4 — удалить ComingSoon после замены methodology/archive/submit
d91e757 feat(ac-rating): Ф6C T3 — SubmitPage с 26-полевой формой и photos upload
a4d8bd1 feat(ac-rating): Ф6C T2 — ArchivePage с таблицей и empty state
441cca1 feat(ac-rating): Ф6C T1 — MethodologyPage с accordion 30 критериев
```

## 2. Что сделано

### T1. MethodologyPage
- `frontend/app/ratings/methodology/page.tsx` — SSR с `revalidate: 3600`, читает `getRatingMethodology()`.
- `MethodologyHero.tsx` (server) — 2col grid (title + 3 mini-stats: критериев / сумма весов / версия).
- `MethodologyTable.tsx` (client) — accordion 30 критериев, легенда 5 типов шкал с подсчётом, сортировка по `weight DESC`, первые 3 открыты по умолчанию, `+` → rotate(45deg) на раскрытии, описание + «как оценивается» карточка.
- `typeOf()` классифицирует критерий по `value_type` (реальный enum бэка: `binary` / `categorical` / `fallback` / `brand_age` / `numeric`), с резервным branch на `scoring_type === 'binary'`. Покрытие 6 тестов.
- Scale-строка строится из `min_value / median_value / max_value` для num/age, хардкод «Есть / Нет» для bin, «Расчёт по формуле» для fallback, «Индивидуальная шкала» для cat.
- Footer: disabled «Скачать PDF» + primary «Предложить модель →» → `/ratings/submit/`.

### T2. ArchivePage
- `frontend/app/ratings/archive/page.tsx` — SSR, `revalidate: 3600`, читает `getRatingArchiveModels()`.
- `ArchiveHero.tsx` — flex-baseline layout с title + описание + счётчик `{count}`.
- `ArchiveTable.tsx` — при `models.length === 0` показывает empty-state карточку; иначе grid-таблица бренд/модель/индекс/→ с сортировкой `total_index DESC` и переходом на `/ratings/{slug}/`.
- Колонки «Выбыл» и «Причина» **не рендерим** (полей нет в ACModel).

### T3. SubmitPage
- `frontend/app/ratings/submit/page.tsx` — SSR, получает `brands` через `getRatingBrands()`.
- `SubmitForm.tsx` — client, нативный `<form>` + `useState` (без form-library). 5 секций:
  - **01 Модель** — бренд (select + custom_brand_name если «Другой»), серия, inner_unit, outer_unit, compressor_model, nominal_capacity_watt (Вт), price (₽).
  - **02 Характеристики** — drain_pan_heater (Radio «Нет»/«Есть»), erv/fan_speed_outdoor/remote_backlight (BoolRadio — три состояния null/false/true), fan_speeds_indoor (number), fine_filters (Radio 0/1/2), ionizer_type/russian_remote/uv_lamp (Select из хардкод-choices).
  - **03 Теплообменник внутр.** — длина/кол-во трубок/диаметр.
  - **04 Теплообменник наруж.** — длина/кол-во трубок/диаметр/толщина.
  - **05 Подтверждение** — photos (1..20, ≤10 МБ каждый, превью через `URL.createObjectURL` с `revokeObjectURL` на unmount через effect), video_url, buy_url, supplier_url, submitter_email.
- **Honeypot** `website` — `position: absolute; left: -9999px`, `tabIndex={-1}`, `autoComplete="off"`.
- **Consent** checkbox обязателен.
- Submit disabled пока `isFormReady(state, photos) === false`. Логика выделена в export-функцию, покрыта тестом.
- `FormData` → POST на `${NEXT_PUBLIC_BACKEND_URL}/api/public/v1/rating/submissions/`. Обработка:
  - **200** → resetForm + success banner «Заявка отправлена на модерацию. Проверьте почту {email}» (auto-hide 10s, вынесен **над** `<form>` чтобы не размонтировался).
  - **429** → «Слишком много заявок с этого IP».
  - **400** → field-errors → inline сообщения у input'ов (через `errors[name][0]`).
- Кнопка «Сохранить черновик» — disabled placeholder.

### T4. ComingSoon удалён
- `frontend/app/ratings/_components/ComingSoon.tsx` — удалён.
- `grep -r "ComingSoon" frontend/` — пусто.

### T5. Тесты (+19)
- `MethodologyTable.test.tsx` — 9 тестов: `typeOf` (6 маппингов), empty state, сортировка и первые 3 открыты по умолчанию, toggle expand/collapse.
- `ArchiveTable.test.tsx` — 2 теста: empty state, сортировка по `total_index DESC` (через порядок href Link'ов).
- `SubmitForm.test.tsx` — 8 тестов: `validatePhotos` (4 кейса), `isFormReady` (2), UI — submit disabled без consent, honeypot скрыт + name="website", клиентская валидация блокирует POST при пустой форме.
- Адаптированы существующие `CustomRatingTab.test.ts` и `specs.test.ts` под расширенный тип `RatingMethodologyCriterion` (добавил `description_ru`, `display_order`, `min/median/max_value`).

### T6. Mobile
- Во всех 3 страницах `@media (max-width: 899px)` внутри `<style>`:
  - Methodology hero → single column, `h1` 30px. Таблица → flex-wrap, скрываем header-строку, type-chip и weight переходят на вторую линию, scale — full-width.
  - Archive: grid → card-подобная 2-rows (бренд/индекс сверху, модель снизу).
  - Submit: все `grid-template-columns: 1fr 1fr [/3]` → `1fr`.

## 3. Проверки

- **`npx tsc --noEmit`** → 0 ошибок.
- **`npm test -- --run`** → **285 passed** (266 + 19 новых).
- **`BACKEND_API_URL=http://localhost:8000 npm run build`** → успех.
  - `/ratings/methodology` — `○ Static` (ISR 1h/1y).
  - `/ratings/archive` — `○ Static`.
  - `/ratings/submit` — `○ Static`.
- **`npm run dev`** (порт 3210) — smoke на все 3 страницы, HTTP 200:
  - Methodology: все 30 критериев в accordion, клик на строку toggle работает, легенда считает типы (5 · 11 · 12 · 1 · 1), footer-кнопка ведёт на `/ratings/submit/`. См. `f6c-screenshots/methodology-desktop.png`, `methodology-mobile.png`.
  - Archive: боевой ответ — `[]`, показывает empty-state «Архив пуст». См. `f6c-screenshots/archive-desktop-empty.png`.
  - Submit: форма рендерится, dropdown брендов подгружается с бэка (22+ брендов), radio-группы, placeholder'ы по дизайну. См. `f6c-screenshots/submit-desktop-empty.png`, `submit-mobile.png`.

## 4. Сюрпризы / отличия от ТЗ

1. **`scoring_type` на бэке не `linear`/`exponential`, а `min_median_max`/`custom_scale`/`binary`/`formula`.** ТЗ предлагал маппинг по `scoring_type`, но реальный enum бэка — это `value_type` (`binary`/`categorical`/`fallback`/`brand_age`/`numeric`). `typeOf()` использует именно `value_type`, с fallback на `scoring_type === 'binary'` для совместимости. Покрыто 6 unit-тестами.
2. **Choices для `ionizer_type` / `russian_remote` / `uv_lamp` / `drain_pan_heater` на бэке — `None`.** Это обычные `CharField(max_length=100)` без ограничений. Захардкодил варианты из дизайна:
   - `IONIZER_CHOICES = ['Нет', 'ПДС', 'Серебро', 'Биоклимат']`
   - `RUSSIAN_REMOTE_CHOICES = ['Нет', 'Только пульт', 'Экран и пульт']`
   - `UV_LAMP_CHOICES = ['Нет', 'Есть']`
   - `DRAIN_HEATER_CHOICES = ['Нет', 'Есть']`
  
   Бэк примет любую строку — если после продакшна решим сузить до enum, ограничение добавится на уровне serializer, фронт не менять.
3. **`erv`, `fan_speed_outdoor`, `remote_backlight`** — на бэке `BooleanField` без `null=True`. Поэтому на фронте сделал `BoolRadio` с внутренним состоянием `null | false | true`: пока пользователь не выбрал — `null`, submit заблокирован. При отправке → `'true'`/`'false'` строкой в `FormData` (DRF BooleanField такой формат принимает).
4. **`nominal_capacity_watt`** на бэке `PositiveIntegerField`. На фронте `<input type="number">`. `price` — `DecimalField(max_digits=10, decimal_places=2)`, optional.
5. **Archive боевой ответ `[]`.** Скриншот empty-state зафиксирован. Когда админ переведёт хотя бы одну модель в `publish_status='archived'`, страница автоматически покажет таблицу.
6. **Подзадача T5 (тесты)** частично пересекается с T1-T3 — чтобы коммиты были атомарными, тесты собраны в отдельный коммит. Обновления `CustomRatingTab.test.ts` / `specs.test.ts` (для расширенного типа) ушли в T1, т.к. они неотделимы от изменения типа.
7. **Ratelimit 3/ч** — реальный POST не делал из dev-сессии, чтобы не тратить бюджет; серверная логика проверена при F6 testing на backend и не трогается в этой фазе.

## 5. Ключевые файлы

| Файл | Назначение |
|---|---|
| `frontend/lib/api/types/rating.ts` | +`description_ru`, `display_order`, `min/median/max_value` в `RatingMethodologyCriterion`; +`RatingBrandOption` |
| `frontend/lib/api/services/rating.ts` | +`getRatingArchiveModels`, `getRatingBrands` |
| `frontend/app/ratings/methodology/page.tsx` | Server page + revalidate 3600 |
| `frontend/app/ratings/methodology/MethodologyHero.tsx` | Hero с mini-stats |
| `frontend/app/ratings/methodology/MethodologyTable.tsx` | Client accordion + typeOf + сортировка |
| `frontend/app/ratings/methodology/MethodologyTable.test.tsx` | 9 тестов |
| `frontend/app/ratings/archive/page.tsx` | Server page |
| `frontend/app/ratings/archive/ArchiveHero.tsx` | Hero + счётчик |
| `frontend/app/ratings/archive/ArchiveTable.tsx` | Таблица / empty-state |
| `frontend/app/ratings/archive/ArchiveTable.test.tsx` | 2 теста |
| `frontend/app/ratings/submit/page.tsx` | Server shell |
| `frontend/app/ratings/submit/SubmitForm.tsx` | Client form (26 полей, honeypot, photos, FormData, 429/400 обработка) |
| `frontend/app/ratings/submit/SubmitForm.test.tsx` | 8 тестов |
| `frontend/app/ratings/_components/ComingSoon.tsx` | ❌ удалён |

## 6. Что остаётся для Ф7+

- **Визуальный QA** всего публичного раздела (`/ratings/`, `/ratings/[slug]/`, `/ratings/methodology/`, `/ratings/archive/`, `/ratings/submit/`) — свести стили в dark mode, проверить все breakpoints 390/768/1024/1440.
- **PDF методики** — «Скачать PDF» сейчас disabled placeholder; если решим реализовать — отдельный endpoint + генерация на бэке (react-pdf или weasyprint).
- **Фильтр-chips в Archive по причине выбытия** — требует полей `archive_reason` + `archived_at` в `ACModel` (решение AC-Пети / Андрея).
- **Save draft в Submit** — кнопка-placeholder, нужна поддержка на бэке (таблица черновиков, сессия по cookie или анонимный token).
- **Редизайн HVAC news** — Ф7 (пинг отдельно перед правками `frontend/app/news/`).
- **E2E-сценарий реального submit с фото** — сейчас не сделал из-за ratelimit; лучше покрыть через mocked fetch в тесте (уже частично покрыто) и отдельный staging smoke.
