# Polish-2: Dark-theme brand logos

**Проблема:** на `/ratings/` в таблице моделей в `.dark` теме monochromatic-логотипы брендов (чёрный текст на прозрачном PNG) сливаются с тёмным фоном → нечитаемо.

**Решение:** сгенерировать dark-версии логотипов автоматически (Pillow, детерминированно), хранить отдельным полем `Brand.logo_dark`. Frontend переключает источник по CSS-классу `.dark`.

**Исполнители:** AC-Петя (backend) + AC-Федя (frontend), параллельно.

**PoC-референс:** `ac-rating/tz/_poc_dark_logo_v6.py` — proof-of-concept скрипт на 4 логотипах (casarte / haier / lg / mhi), проверено что работает на 3/4. LG требует ручного override (классифицирован как mono ошибочно из-за низкой саturации красного).

---

## Backend (AC-Петя)

**Worktree:** `ERP_Avgust_ac_petya_dark_logos`
**Ветка:** `ac-rating/dark-logos-backend`
**От:** `origin/main`

### Задачи

1. **Сервис** `backend/ac_brands/services/dark_logo_generator.py`:

   ```python
   def generate_dark_logo(
       src_path: Path,
       force_colored: bool = False,
       force_mono: bool = False,
   ) -> bytes | None:
       """Принимает путь к Brand.logo (ожидаем уже нормализованный PNG с alpha).
       Возвращает bytes для Brand.logo_dark (PNG) или None если генерация
       не нужна (цветной лого без explicit force_mono).
       """
   ```

   Алгоритм (из PoC v6):
   - Открыть PNG, `convert("RGBA")`.
   - **Cleanup**: пиксели с `min(R,G,B) >= 240` → `alpha *= (255 - rgb_min) / 15`. Убирает белые "внутренности букв" — баг M6 normalization (`.ac_brands.services.logo_normalizer` оставляет белые opaque пиксели в границах text area).
   - **is_monochromatic**: `stdev(R,G,B) < 20` на пикселях с `alpha > 64`. Берёт среднее per-pixel RGB stdev.
   - Если `force_colored` → вернуть `None` (dark не генерируем, используем оригинал).
   - Если `force_mono` или (not force_colored и mono) → recolor RGB на `(255, 255, 255)`, сохраняя alpha. Сохранить как PNG.
   - Иначе (цветной и не force_mono) → вернуть `None`.

2. **Миграция** `backend/ac_brands/migrations/00XX_brand_logo_dark.py`:
   - `AddField('Brand', 'logo_dark', ImageField(upload_to='brands/dark/', null=True, blank=True))`.
   - Паттерн RunSQL для SQL DEFAULT не нужен (nullable, без NOT NULL).
   - **ВАЖНО:** перед push — pgdump прод-DB в `~/backups/` локально, проверить `python manage.py migrate ac_brands --plan`.

3. **Management command** `backend/ac_brands/management/commands/generate_brand_dark_logos.py`:
   - `--slug <brand-slug>` — один бренд; без флага — все.
   - `--force-colored <slug>,<slug>` — список slug'ов где НЕ генерировать dark (оставить оригинал). Initial override list: `lg` (красный круг слабой насыщенности ловится как mono).
   - `--force-mono <slug>,<slug>` — список slug'ов где форсированно recolor (для edge cases).
   - `--force` — перезаписать существующие `logo_dark`.
   - `--dry-run` — печатает classification table без сохранения.
   - Output — таблица: `slug | original | mono? | dark_saved`.

4. **Обновить serializer** `backend/ac_catalog/serializers.py`:
   - `BrandSerializer`: добавить `logo_dark` field → `_url_with_mtime(obj.logo_dark)` или `""` если пусто.
   - `ACModelListSerializer.get_brand_logo_dark()`: аналогично для inline-рендера в таблице.
   - Не забыть про `MethodologyCriterionSerializer.photo_url` — не трогаем, там другое.

5. **Admin** `backend/ac_brands/admin.py`:
   - `BrandAdmin.list_display`: добавить миниатюры `logo` и `logo_dark` (readonly HTML).
   - `BrandAdmin.actions`: `generate_dark_logos_action(request, queryset)` — вызывает сервис на выбранных брендах.

6. **Тесты** `backend/ac_brands/tests/test_dark_logo_generator.py`:
   - Фикстуры: 4 PNG из PoC (`casarte.png`, `haier.png`, `lg.png`, `mhi.png`) — скопируй из `/tmp/logo-poc/original/` в `backend/ac_brands/tests/fixtures/logos/`.
   - `test_mono_detection`: casarte/mhi → mono=True; haier → mono=False.
   - `test_recolor_white`: после generate_dark_logo все непрозрачные пиксели имеют RGB=(255,255,255).
   - `test_force_colored`: LG + force_colored=True → returns None.
   - `test_management_command`: `call_command('generate_brand_dark_logos', '--dry-run')` без exception.

7. **Прогон на проде** (после merge):
   - `docker compose -f docker-compose.prod.yml exec backend python manage.py generate_brand_dark_logos --force-colored lg`.
   - Проверь Brand.logo_dark у всех 22 брендов через Django shell.
   - Если какие-то выглядят плохо — руками override через `--force-mono=<slug>` или `--force-colored=<slug>`.

### Acceptance backend

- [ ] Миграция применяется чисто (локально и на stage, если есть).
- [ ] Management command выполняется на всех 22 брендах: ~18 получают dark-версию, ~4 цветные — остаются без.
- [ ] Admin показывает две превьюхи: light + dark.
- [ ] `GET /api/public/v1/rating/models/` возвращает `brand_logo` и `brand_logo_dark` в каждой модели.
- [ ] 10+ новых тестов зелёные. Весь `pytest ac_brands` 40+ тестов pass.
- [ ] Отчёт `ac-rating/reports/dark-logos-backend.md` + скриншот админки.

---

## Frontend (AC-Федя)

**Worktree:** `ERP_Avgust_ac_fedya_dark_logos`
**Ветка:** `ac-rating/dark-logos-frontend`
**От:** `origin/main`

### Задачи

1. **Обновить types** `frontend/lib/api/types/rating.ts`:
   - `RatingBrand { logo: string; logo_dark: string; ... }` — добавить `logo_dark`.
   - `RatingModelListItem { brand_logo: string; brand_logo_dark: string; ... }`.
   - `RatingModelDetail.brand: RatingBrand` уже через `RatingBrand` — получит поле автоматически.

2. **Обновить компонент** `frontend/app/(hvac-info)/ratings/_components/primitives.tsx::BrandLogo`:
   - Props: `src: string`, `srcDark?: string | null`, `name`, `size`.
   - Render: два `<img>` с классами `rt-brand-logo-light` и `rt-brand-logo-dark`.
   - Если `srcDark` пустой/null → рендерить только `light` + класс `rt-brand-logo-single` (CSS `.dark` оставит его с `filter: invert(1)` fallback).
   - Пример разметки:
     ```tsx
     <>
       <img src={src} alt={name} className="rt-brand-logo-light" … />
       {srcDark && <img src={srcDark} alt={name} className="rt-brand-logo-dark" … />}
     </>
     ```

3. **CSS** в `frontend/app/(hvac-info)/ratings-tokens.css` (или scoped в компоненте):
   ```css
   .rt-brand-logo-dark { display: none; }
   .dark .rt-brand-logo-light { display: none; }
   .dark .rt-brand-logo-dark { display: block; }
   /* Fallback для брендов без logo_dark (brand_logo_dark пустой): */
   .dark .rt-brand-logo-single { filter: invert(1) hue-rotate(180deg); }
   ```
   Паттерн из `HvacInfoHeader.tsx` (там уже работает для главного SVG HVAC Info логотипа).

4. **Использования:**
   - `DesktopListing.tsx` — `ModelRow` рендерит `<BrandLogo src={model.brand_logo} srcDark={model.brand_logo_dark} ... />`.
   - `MobileListing.tsx` — аналогично в карточке.
   - `DetailHero.tsx` и прочие места где `brand.logo` → использовать `brand.logo_dark`.

5. **Тесты:**
   - `primitives.test.tsx` (или новый `BrandLogo.test.tsx`): рендерит оба img когда srcDark present; один img+`single` класс когда srcDark отсутствует.
   - Manual QA: переключи theme-toggle в header на `/ratings/` и `/ratings/<slug>/` — все логотипы читаемы в обеих темах.

6. **До merge подождать Петю** — Федя может начать с моками API (хардкодить `brand_logo_dark` в локальной фикстуре), но financial-merge делается после Пети.

### Acceptance frontend

- [ ] `.dark` тема на `/ratings/` и `/ratings/<slug>/` — все 22 лого читаемы.
- [ ] Toggle theme → логотипы меняются без перезагрузки.
- [ ] Бренды с пустым `logo_dark` используют CSS invert-fallback.
- [ ] 5+ новых тестов. Весь ratings suite 110+ passing.
- [ ] Отчёт `ac-rating/reports/dark-logos-frontend.md` + 4 скриншота (light+dark, desktop+mobile).

---

## Порядок действий

1. Петя стартует немедленно. Федя начинает параллельно с моками.
2. Когда Петя смержит `ac-rating/dark-logos-backend` в main — Федя rebase + тестирует с реальным API.
3. Федя мержит `ac-rating/dark-logos-frontend` после.
4. Я (техлид) делаю финальный QA на проде + deploy.

## Shared files

Оба работают не пересекаясь:
- Петя: `backend/ac_brands/*`, `backend/ac_catalog/serializers.py`.
- Федя: `frontend/lib/api/types/rating.ts`, `frontend/app/(hvac-info)/ratings/_components/*`, `frontend/app/(hvac-info)/ratings/**/*.tsx`.

Нет пересечений. Если Федя меняет `rating.ts` раньше Пети — просто добавляет optional fields, потом Петя обновляет при ребейзе (конфликт разруливается при rebase).
