# TASK — Wave 5 — фиксы после первого прохода Андрея на проде

## Контекст

Андрей зашёл в `/erp/hvac-rating/` после деплоя Ф8 и нашёл 5 проблем. Чиним батчем + один деплой.

---

## 1. ACModelsPage — добавить колонку с фото-thumb

Файл: `frontend/components/hvac/pages/ACModelsPage.tsx`

В таблицу моделей добавить колонку «Фото» (40×40 thumb) — поле `primary_photo_url` уже приходит из backend-сериализатора `AdminACModelListSerializer`.

```tsx
<TableHead className="w-14">Фото</TableHead>
...
<TableCell>
  {row.primary_photo_url ? (
    <ImageWithFallback
      src={row.primary_photo_url}
      alt={`${row.brand_name} ${row.inner_unit}`}
      width={40}
      height={40}
      className="rounded object-cover"
      style={{ width: 40, height: 40 }}
    />
  ) : (
    <span className="text-xs text-muted-foreground">—</span>
  )}
</TableCell>
```

Импорт: `import { ImageWithFallback } from '@/components/common/ImageWithFallback';`

Также видно поле `photos_count` в API — можно добавить badge «N фото» рядом или отдельной колонкой если место позволяет. На твой вкус.

---

## 2. ACModelEditor вкладка «Фото» — превью загруженных фото

Файл: `frontend/components/hvac/pages/ACModelEditor.tsx`

В табе `photos` (где сейчас upload + reorder) — для каждого элемента `form.photos` показать миниатюру через `image_url` (уже в типе `ACModelPhotoNested`).

Сейчас в таб'е скорее всего только список с `alt` + кнопками ↑↓/delete. Добавь visual:

```tsx
{form.photos.map((photo, idx) => (
  <div key={photo.id ?? `new-${idx}`} className="flex items-center gap-3 p-2 border rounded">
    <ImageWithFallback
      src={photo.image_url}
      alt={photo.alt || `Фото ${idx + 1}`}
      width={80}
      height={60}
      className="rounded object-cover"
      style={{ width: 80, height: 60 }}
    />
    <div className="flex-1">
      <Input value={photo.alt} onChange={...} placeholder="Alt-текст" />
    </div>
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={() => moveUp(idx)} disabled={idx === 0}>↑</Button>
      <Button size="sm" variant="ghost" onClick={() => moveDown(idx)} disabled={idx === form.photos.length - 1}>↓</Button>
      <Button size="sm" variant="destructive" onClick={() => deletePhoto(photo.id)}>×</Button>
    </div>
  </div>
))}
```

(Конкретная разметка — на твой вкус, главное чтобы фото было видно.)

В create-режиме (mode='create') — таб «Фото» disabled с пометкой «Сначала сохрани модель» (как раньше) — оставь.

---

## 3. ACBrandsPage — thumbs логотипов в таблице

Файл: `frontend/components/hvac/pages/ACBrandsPage.tsx`

Сейчас в таблице нет колонки с логотипом. Backend отдаёт `logo_url` и `logo_dark_url` в `AdminBrandSerializer`. Добавь колонку «Логотип» с обоими (light + dark side-by-side):

```tsx
<TableHead className="w-32">Логотип</TableHead>
...
<TableCell>
  <div className="flex items-center gap-2">
    {row.logo_url ? (
      <ImageWithFallback
        src={row.logo_url}
        alt={`${row.name} (light)`}
        width={56}
        height={28}
        className="rounded bg-white border object-contain"
        style={{ width: 56, height: 28 }}
      />
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )}
    {row.logo_dark_url ? (
      <ImageWithFallback
        src={row.logo_dark_url}
        alt={`${row.name} (dark)`}
        width={56}
        height={28}
        className="rounded bg-zinc-900 border object-contain"
        style={{ width: 56, height: 28 }}
      />
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )}
  </div>
</TableCell>
```

(Хочешь — колонку «Light/Dark» одной разделить на 2 — на твой вкус.)

---

## 4. Backend — `pagination_class = None` для админских справочников

Файл: `backend/ac_methodology/admin_views.py`

В классе `CriterionAdminViewSet` добавь:

```python
class CriterionAdminViewSet(viewsets.ModelViewSet):
    permission_classes = [IsHvacAdminProxyAllowed]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None   # ← ДОБАВИТЬ
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    ...
```

Причина: критериев 31 (и максимум вырастет до ~100). Для админа смысла в page-by-page нет — отдаём всё разом. DRF по умолчанию paginates 20.

**Также добавь** `pagination_class = None` в:
- `RatingPresetAdminViewSet` (в том же файле — пресетов мало) [Wave 5 fix]
- Не обязательно, но проверь — если `MethodologyAdminViewSet` тоже paginated, тоже отключи (методик мало, 1-3 версии).

**Frontend ACCriteriaPage.tsx** — после backend фикса всё уже работает: `acRatingService.getCriteria` через `normalizeList<T>` обрабатывает и paginated, и plain list. Но если хочешь явности — можешь не трогать или добавь короткий комментарий.

**Тесты:** в `backend/ac_methodology/tests/test_admin_views.py` добавить простой тест что list возвращает все критерии (не 20):
```python
def test_criteria_list_no_pagination(api_client_staff):
    # создать 25 критериев через factory
    response = api_client_staff.get('/api/hvac/rating/criteria/')
    assert response.status_code == 200
    assert isinstance(response.data, list)  # plain list, не {results: ...}
    assert len(response.data) == 25
```

---

## 5. ACCriteriaPage — обновить/убрать KEY_MEASUREMENT_NOTE баннер

Файл: `frontend/components/hvac/pages/ACCriteriaPage.tsx`

Сейчас баннер говорит:
> «Флаг "Ключевой замер" применяется только для критериев, включённых в активную методику. Сейчас активна v1.0 — критерии вне неё игнорируются на фронте.»

Это **устарело** — фронт уже работает с is_key_measurement независимо от активности (polish-4, через `parameter_scores`). Условие только одно: у модели должен быть raw_value этого критерия.

**Заменить на короткий правильный текст:**

```
Критерии с флагом «Ключевой замер» получают teal-выделение и
показываются первыми в списке параметров на детальной странице
модели — независимо от активности критерия в методике, при условии
что у модели заполнено значение этого параметра.
```

Или ещё короче: можно вообще убрать баннер, оставить только tooltip у поля is_key_measurement в `ACCriterionEditor`. Решай.

---

## 6. Прогон

```bash
cd frontend
npx tsc --noEmit              # чисто
npm test -- --run AC          # все AC* зелёные
```

Backend (если есть локальный venv):
```bash
cd backend
pytest ac_methodology/tests/ ac_catalog/tests/ ac_brands/tests/ --no-cov
```

(Если нет venv — оставь без backend-прогона; я проверю при ревью.)

**Скриншоты по возможности:**
- ACModelsPage с thumbs.
- ACModelEditor → Фото с превью.
- ACBrandsPage с light+dark thumbs.
- ACCriteriaPage с 31 критерием (без pagination).

---

## Известные нюансы

1. **`ImageWithFallback`** — переиспользуй `@/components/common/ImageWithFallback` (есть в проекте, твой же reference из Ф8A).
2. **Размер worktree** — Wave 5 это маленький batch (3-5 файлов фронт + 1 строка backend + 1 тест). Не overengineer.
3. **`pagination_class = None`** для admin endpoints безопасно — admin это не публичный API, нагрузка минимальная.

---

## Формат отчёта

```
Отчёт — Wave 5 (AC-Федя)

Ветка: ac-rating/wave5 (rebased на origin/main)
Коммиты:
  <git log --oneline main..HEAD>

Что сделано:
- ✅ ACModelsPage: thumb фото в списке
- ✅ ACModelEditor: превью загруженных фото в табе
- ✅ ACBrandsPage: light + dark thumbs логотипов
- ✅ Backend: pagination_class=None для CriterionAdminViewSet (+ presets/methodology)
- ✅ ACCriteriaPage: обновлённый/убранный баннер
- ✅ <N> тестов

Прогон:
- npx tsc --noEmit: ok
- npm test: <X> passed
- pytest backend/ac_*/: <Y> passed (если делал)

Скриншоты: [...]

Известные риски: ...

Ключевые файлы:
- frontend/components/hvac/pages/ACModelsPage.tsx
- frontend/components/hvac/pages/ACModelEditor.tsx
- frontend/components/hvac/pages/ACBrandsPage.tsx
- frontend/components/hvac/pages/ACCriteriaPage.tsx
- backend/ac_methodology/admin_views.py
- backend/ac_methodology/tests/test_admin_views.py
```
