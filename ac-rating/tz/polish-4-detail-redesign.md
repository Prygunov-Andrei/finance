# Polish-4: Детальная страница модели — перекомпоновка + фиксы

**Scope:** 10 замечаний Андрея по `/ratings/<slug>/`, составляющих крупный refactor детальной страницы. Оформляем одним эпиком.

**Исполнители:** AC-Петя (backend) + AC-Федя (frontend), параллельно. Сложность: Петя 0.3 дня, Федя 1-1.3 дня.

---

## Scope (10 пунктов)

1. **Порядок anchor-nav:** было `Обзор → Критерии → Спеки → Где купить → Отзывы → Упоминания`. Должно быть: `Оценки по критериям → Спеки → Где купить → Отзывы → Обзор`. **«Упоминания» (M5 news_mentions) убираем совсем** — и из anchor-nav, и рендер секции.
2. **Перенос блоков «Плюсы/Минусы» + «Вердикт редакции»** из `DetailOverview` → в `DetailCriteria` (в правую колонку). Раскладка: слева editorial-таблица критериев на 2/3 ширины, справа aside 1/3 ширины с «Вердикт редакции» сверху + «Плюсы» + «Минусы» снизу (см. дизайн-картинка в обсуждении 2026-04-23).
3. **Счётчик «N параметров рейтинга»:**
   - «32» берётся из `parameter_scores.length`, который backend намеренно расширяет неактивными критериями (`is_active=False`, если у модели есть raw_value). На заголовке должно быть число **активных** — 30 для текущей методики.
   - **Правильная плюрализация:** 1 параметр / 2-4 параметра / 5+ параметров.
   - Использовать `methodology.stats.active_criteria_count` на фронте.
4. **«Ключевой замер» (is_key_measurement)** — новое backend-поле `Criterion.is_key_measurement: BooleanField`. Критерии с этим флагом рендерятся **первыми** в списке DetailCriteria, визуально выделены: teal background (`rt-accent-bg`), teal badge «КЛЮЧЕВОЙ ЗАМЕР» сверху (eyebrow). Пример на картинке: «Есть замер минимального уровня шума».
   - Initial seed в data-migration: `is_key_measurement=True` для критериев где `code` содержит подстроки `min_noise`, `noise_measurement`, `key_` (оставь место для будущих через admin).
5. **Работающий tooltip «?»** на каждом критерии в DetailCriteria. При hover/click — всплывает `description_ru` (уже в `methodology.criteria[i].description_ru`). Можно через `title` HTML-атрибут (minimal) или кастомный popover (nicer). Обязательно accessible (keyboard focus, Esc close).
6. **Убрать view «Сетка»** из `ViewSwitcher`. Оставить только `list` + `radar`. Удалить `GridView` компонент полностью.
7. **Убрать блок «Упоминания»** из anchor-nav и рендера (`DetailNewsMentions`). Секция `news_mentions` остаётся в API (используется где-то ещё), **только UI-удаление**.
8. **DetailSpecs:**
   - Группа «Прочее» появляется когда `Criterion.group == 'other'`. Это ожидаемо — как есть оставляем.
   - **2-колоночная раскладка на desktop** (`grid-template-columns: 1fr 1fr`), 1 колонка на mobile.
   - **PDF / CSV / Копировать кнопки должны реально работать** (сейчас не работают). Детали ниже.
9. **Убрать `DetailRelated`** («Сравнить с конкурентами») совсем. Удалить компонент + импорт в `[slug]/page.tsx`.
10. **«Вердикт редакции» — хардкод авторов** (Савинов Максим + Прыгунов Андрей), использует `editorial_body` / `editorial_quote` из модели как тело. Формат как на картинке: eyebrow «ВЕРДИКТ РЕДАКЦИИ» + параграф serif + разделитель + 2 круглые аватарки + «Андрей Петров · Ирина Соколова» → заменить на «Савинов Максим · Прыгунов Андрей» + «редакция · апрель 2026».

---

## Backend (AC-Петя)

**Worktree:** `ERP_Avgust_ac_petya_polish4`
**Ветка:** `ac-rating/polish4-backend`
**От:** `origin/main`

### 1. `Criterion.is_key_measurement` (п. 4)

Файл: `backend/ac_methodology/models.py`:

```python
class Criterion(TimestampedModel):
    # ... existing fields
    is_key_measurement = models.BooleanField(
        default=False,
        verbose_name="Ключевой замер",
        help_text="Выделяется отдельным визуальным блоком на детальной странице модели.",
    )
```

Schema-migration `0006_criterion_is_key_measurement.py` — просто AddField, nullable не нужен (default=False).

Data-migration `0007_seed_key_measurements.py` через RunPython:
```python
def seed(apps, schema_editor):
    Criterion = apps.get_model("ac_methodology", "Criterion")
    # Initial: критерии с substring по code
    patterns = ["min_noise", "noise_measurement", "key_"]
    for c in Criterion.objects.all():
        if any(p in (c.code or "").lower() for p in patterns):
            c.is_key_measurement = True
            c.save(update_fields=["is_key_measurement"])
```

Подход: автоматическая эвристика на initial + Андрей может в админке ставить/снимать флаг.

### 2. Admin для `is_key_measurement` (п. 4)

`CriterionAdmin.list_display` → добавить `is_key_measurement` с `list_editable=True`. Фильтр по `is_key_measurement` в `list_filter`.

### 3. Serializer `MethodologyCriterionSerializer` (п. 4)

Файл: `backend/ac_catalog/serializers.py`:
```python
class MethodologyCriterionSerializer(serializers.ModelSerializer):
    # ... existing
    is_key_measurement = serializers.BooleanField(source="criterion.is_key_measurement", read_only=True)

    class Meta:
        # ...
        fields = (..., "is_key_measurement")
```

### 4. Backend-endpoint CSV-экспорт (п. 8)

**Цель:** `GET /api/public/v1/rating/models/<slug>/export.csv` — возвращает CSV с параметрами модели (группа, название, значение, единица). Правильный `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<slug>.csv"`.

Файл: `backend/ac_catalog/views/export.py` (новый):
```python
import csv
from io import StringIO
from django.http import HttpResponse
from rest_framework.views import APIView
# ... AllowAny permission, no pagination

class ACModelCSVExportView(APIView):
    def get(self, request, slug):
        model = get_object_or_404(ACModel, slug=slug, publish_status="published")
        # header: Группа, Критерий, Значение, Единица
        buf = StringIO()
        writer = csv.writer(buf)
        writer.writerow(["Группа", "Критерий", "Значение", "Единица"])
        # ... итерируем raw_values + criterion.group_display + criterion.name_ru
        resp = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="{slug}.csv"'
        return resp
```

URL в `ac_catalog/urls.py`: `path("models/<slug:slug>/export.csv", ACModelCSVExportView.as_view())`.

### 5. Тесты (все пункты)

- `test_criterion_key_measurement_model.py` — поле default=False, saving, filter.
- `test_seed_key_measurements_migration.py` — после migrate у critérium `min_noise_measurement` (или какие есть) is_key_measurement=True.
- `test_csv_export.py` — `GET /export.csv` → 200, корректный Content-Type, CSV имеет правильную шапку, данные модели, UTF-8.
- `MethodologyCriterionSerializer` возвращает `is_key_measurement`.

### Acceptance backend

- [ ] Миграция применяется чисто, seed автоматически отмечает ≥1 критерий (если соответствует эвристике).
- [ ] Admin показывает поле is_key_measurement с inline-редактированием.
- [ ] API `/methodology/` возвращает `is_key_measurement` в каждом critérium.
- [ ] `/models/<slug>/export.csv` — 200, скачивается как файл.
- [ ] 10+ новых тестов, `pytest ac_methodology ac_catalog` 45+ pass.
- [ ] Отчёт `ac-rating/reports/polish4-backend.md` + скриншот админки.

---

## Frontend (AC-Федя)

**Worktree:** `ERP_Avgust_ac_fedya_polish4`
**Ветка:** `ac-rating/polish4-frontend`
**От:** `origin/main`

### 1. `DetailAnchorNav` (п. 1, п. 7)

Файл: `frontend/app/(hvac-info)/ratings/_components/DetailAnchorNav.tsx`:
- Порядок: `criteria → specs → buy → reviews → overview`.
- Удалить пункт «Упоминания» (`mentions`).
- Названия: «Оценки по критериям», «Характеристики», «Где купить», «Отзывы», «Обзор».

### 2. `DetailCriteria` refactor (п. 2, п. 3, п. 4, п. 5, п. 6)

Файл: `frontend/app/(hvac-info)/ratings/_components/DetailCriteria.tsx`:

- **Двухколоночная раскладка** на desktop (≥1024px): `grid-template-columns: 2fr 1fr` с gap 40.
  - Left: таблица критериев (как сейчас).
  - Right aside: `DetailEditorial` новый sub-component с «Вердикт редакции» (editorial_body/quote + хардкод Савинов+Прыгунов) + «Плюсы» (из `pros_text`) + «Минусы» (из `cons_text`).
  - Mobile: столбом (editorial сверху, таблица ниже).

- **Счётчик:** `{activeCriteriaCount} {pluralParam(activeCriteriaCount)}` где helper:
  ```ts
  function pluralParam(n: number): string {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'параметр';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'параметра';
    return 'параметров';
  }
  ```
  `activeCriteriaCount` → `methodology.stats.active_criteria_count` (prop от page).

- **Ключевые замеры** (`is_key_measurement=True`) выводятся **первыми** в списке, в teal-boxes:
  ```tsx
  {keyScores.map((s) => <KeyMeasurementRow {...s} />)}
  {regularScores.map((s) => <RegularRow {...s} />)}
  ```
  `KeyMeasurementRow` — teal background + badge «КЛЮЧЕВОЙ ЗАМЕР» eyebrow сверху.

- **Tooltip «?»** на каждом критерии:
  - Простейший: `<span title={description_ru}>?</span>` (HTML native).
  - Более продвинутый (рекомендуется): кастомный Popover на click/hover с Esc-close, focus-ring, aria-describedby.
  - Любой вариант — проверь что видна полная `description_ru`, не обрезается.

- **Убрать «Сетка»:** удалить из `VIEW_DEFS` элемент `{ id: 'grid' }`. Удалить компонент `GridView`. Default view `list`.

### 3. `DetailOverview` (п. 2)

Файл: `frontend/app/(hvac-info)/ratings/_components/DetailOverview.tsx`:
- **Удалить** блок Плюсы/Минусы (переехал в DetailCriteria).
- **Удалить** Pull quote если он только про плюсы/минусы — оставить только editorial_body.
- Если после удаления контента осталось мало — оставь lede + тело, этого хватит.

### 4. `[slug]/page.tsx` (п. 1, п. 7, п. 9)

- Удалить `<DetailNewsMentions />` секцию.
- Удалить `<DetailRelated />` секцию + импорт.
- Порядок рендера секций: `DetailHero → DetailMedia → DetailAnchorNav → DetailCriteria → DetailSpecs → DetailBuy → DetailReviews → DetailOverview`.

### 5. `DetailSpecs` (п. 8)

Файл: `frontend/app/(hvac-info)/ratings/_components/DetailSpecs.tsx`:

- **2-колоночная раскладка:** `grid-template-columns: 1fr 1fr` на desktop, `1fr` на mobile.
- **Кнопки реально работают:**
  - **Копировать:** `navigator.clipboard.writeText(plainText)` где `plainText` — sanitized таблица характеристик (`Group:\t\tKey:\tValue\n...`). Toast «Скопировано» (minimal: state `copied` → показать 2s).
  - **CSV:** `<a href={/api/.../models/<slug>/export.csv} download>` — бекенд Пети (см. выше).
  - **PDF:** клиентский jsPDF + html2canvas. Установить `jspdf` (уже может быть в зависимостях). Scroll-capture `.rt-detail-specs` section → PDF. Filename: `<slug>.pdf`.

### 6. Хардкод авторов «Вердикт редакции» (п. 10)

Новый компонент `DetailEditorial.tsx` (или inline внутри DetailCriteria):
```tsx
const EDITORS = [
  { name: 'Савинов Максим', avatar: '/rating-authors/savinov.jpg' },
  { name: 'Прыгунов Андрей', avatar: '/rating-authors/prygunov.jpg' },
];
const DATE_LABEL = 'редакция · апрель 2026';  // можно вычислить из detail.updated_at
```

(Пути — те же что уже используются в HeroBlock на главной. Файлы в `frontend/public/rating-authors/`.)

### 7. Тесты

- `DetailAnchorNav.test.tsx` — verify порядок: first=criteria, last=overview, нет mentions.
- `DetailCriteria.test.tsx` — key-measurements рендерятся сверху с badge; `pluralParam` на 1/2/5; tooltip hover показывает description.
- `DetailSpecs.test.tsx` — 2-колоночный grid, кнопки работают (mock clipboard, download link).
- `DetailOverview.test.tsx` — убедиться что pros/cons НЕ рендерятся.

### Acceptance frontend

- [ ] Anchor-nav в правильном порядке. Нет пункта «Упоминания».
- [ ] DetailCriteria двухколоночный, editorial справа с плюсами/минусами.
- [ ] Ключевые замеры визуально выделены, первыми.
- [ ] Tooltip работает на всех критериях.
- [ ] «N параметра/параметров/параметр» правильные падежи.
- [ ] «Сетка» убрана.
- [ ] DetailSpecs 2 колонки, PDF/CSV/Copy работают.
- [ ] DetailRelated + DetailNewsMentions удалены.
- [ ] Вердикт редакции с авторами Савинов+Прыгунов.
- [ ] 10+ новых/обновлённых тестов, весь ratings-suite 130+ pass.
- [ ] Отчёт `ac-rating/reports/polish4-frontend.md` + 6 скриншотов: detail-criteria light/dark, detail-specs light/dark, DetailCriteria-mobile, detail-page-scroll-through.

---

## Порядок

1. Петя и Федя параллельно, оба от `origin/main`.
2. Петя мержится первым.
3. Федя rebase на main, доделывает QA с реальным API, мержится.
4. Я (техлид) review + deploy.

## Shared файлы

- Петя: `backend/ac_methodology/*`, `backend/ac_catalog/serializers.py`, `backend/ac_catalog/views/export.py`, `backend/ac_catalog/urls.py`.
- Федя: `frontend/lib/api/types/rating.ts` (добавить `is_key_measurement` optional), `frontend/app/(hvac-info)/ratings/_components/Detail*.tsx`, `frontend/app/(hvac-info)/ratings/[slug]/page.tsx`.

Если Федя коммитит раньше Пети — в types делает `is_key_measurement?: boolean`, фронт устойчив к отсутствию поля в API.
