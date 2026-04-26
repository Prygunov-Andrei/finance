# TASK — Ф8B-2 backend — пресеты «Свой рейтинг» + модерация отзывов

## Цель

Расширить admin API под `/api/hvac/rating/`:
1. CRUD для `RatingPreset` (пресеты таба «Свой рейтинг» в публичной части).
2. Модерация `Review` — list/retrieve + status update + bulk action.

После этой фазы будет финальная Ф8C (модерация submissions заявок) и Ф8D (cleanup Django-admin).

---

## ⚠️ Урок Ф8A

Перед написанием **каждого** сериализатора — открой соответствующую модель в `backend/ac_methodology/models.py:RatingPreset` и `backend/ac_reviews/models.py:Review` и сверь поля. Не угадывай по памяти.

---

## 1. RatingPreset CRUD

**Endpoint:** `/api/hvac/rating/presets/` под существующим `app_name = "ac_rating_admin"`.

```
GET    /api/hvac/rating/presets/         — list
POST   /api/hvac/rating/presets/         — create
GET    /api/hvac/rating/presets/{id}/    — retrieve
PUT    /api/hvac/rating/presets/{id}/
PATCH  /api/hvac/rating/presets/{id}/
DELETE /api/hvac/rating/presets/{id}/
```

**Файлы (новые):**
- `backend/ac_methodology/admin_views.py` — добавь `RatingPresetAdminViewSet` (рядом с CriterionAdminViewSet и MethodologyAdminViewSet).
- `backend/ac_methodology/admin_serializers.py` — добавь `AdminRatingPresetSerializer`.
- `backend/ac_catalog/admin_urls.py` — `router.register(r'presets', methodology_admin_views.RatingPresetAdminViewSet, basename='preset')`.

**Сериализатор:**
```python
class AdminRatingPresetSerializer(serializers.ModelSerializer):
    criteria_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Criterion.objects.all(),
        source='criteria', write_only=True, required=False,
    )
    criteria_count = serializers.SerializerMethodField()
    
    class Meta:
        model = RatingPreset
        fields = (
            'id', 'slug', 'label', 'order', 'is_active',
            'description', 'is_all_selected',
            'criteria_ids',          # writable list of Criterion IDs
            'criteria_count',        # read-only number
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at', 'criteria_count')
    
    def get_criteria_count(self, obj):
        if obj.is_all_selected:
            return -1   # маркер "ВСЕ" для фронта (или строка "ALL" — на твой вкус)
        return obj.criteria.count()
```

**Особенность M2M `criteria`:**
- `is_all_selected=True` → M2M фактически игнорируется (фронт публичный подтягивает все активные критерии активной методики).
- Сериализатор всё равно возвращает фактический список IDs (или пустой если is_all_selected) — для UI checkbox-state.
- На update: если в payload есть `criteria_ids` — синхронизируй M2M (`instance.criteria.set(...)`).

**Filters:**
- `?is_active=true|false`
- `?is_all_selected=true|false`
- `?search=<q>` — по slug, label
- `?ordering=order|created_at` (default `order`)

**list-сериализатор** можно использовать тот же `AdminRatingPresetSerializer` (модель маленькая, нет смысла в кратком).

---

## 2. Review модерация

**Endpoint:** `/api/hvac/rating/reviews/`.

```
GET    /api/hvac/rating/reviews/                 — list (фильтры)
GET    /api/hvac/rating/reviews/{id}/            — retrieve
PATCH  /api/hvac/rating/reviews/{id}/            — partial update (главное — status)
DELETE /api/hvac/rating/reviews/{id}/            — delete (для спама)

POST   /api/hvac/rating/reviews/bulk-update/     — bulk status update
```

**НЕ делаем:**
- `POST /reviews/` — отзывы создаются только публично (`/api/public/v1/rating/reviews/`).
- `PUT` — только `PATCH` (модератор обычно меняет только status, не весь объект).

**Файлы (новые):**
- `backend/ac_reviews/admin_views.py` — `ReviewAdminViewSet`, `ReviewBulkUpdateView`.
- `backend/ac_reviews/admin_serializers.py` — `AdminReviewSerializer`.
- `backend/ac_catalog/admin_urls.py` — `router.register(r'reviews', review_admin_views.ReviewAdminViewSet, basename='review-admin')` + path для bulk-update.

**Сериализатор:**
```python
class AdminReviewSerializer(serializers.ModelSerializer):
    model_brand = serializers.CharField(source='model.brand.name', read_only=True)
    model_inner_unit = serializers.CharField(source='model.inner_unit', read_only=True)
    model_slug = serializers.CharField(source='model.slug', read_only=True)
    
    class Meta:
        model = Review
        fields = (
            'id', 'model',
            'model_brand', 'model_inner_unit', 'model_slug',
            'author_name', 'rating',
            'pros', 'cons', 'comment',
            'status', 'ip_address',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'model', 'model_brand', 'model_inner_unit', 'model_slug',
            'author_name', 'rating', 'pros', 'cons', 'comment',
            'ip_address', 'created_at', 'updated_at',
        )
        # Главное writable поле — status. Модератор не редактирует тело отзыва,
        # только модерирует. (Если решим разрешить редактирование — переведём
        # rating/pros/cons/comment в writable отдельным шагом.)
```

**Filters:**
- `?status=pending|approved|rejected`
- `?model=<id>` — фильтр по модели
- `?search=<q>` — по author_name, comment, pros, cons
- `?rating=1..5` (опционально, low priority)
- `?ordering=created_at|-created_at|rating|-rating` (default `-created_at`)

**Bulk-update endpoint:**
```
POST /api/hvac/rating/reviews/bulk-update/
Body: {"review_ids": [1, 2, 3], "status": "approved"}
Response: {"updated": 3, "errors": []}
```

```python
class ReviewBulkUpdateView(APIView):
    permission_classes = [IsHvacAdminProxyAllowed]
    
    def post(self, request):
        review_ids = request.data.get('review_ids')
        new_status = request.data.get('status')
        
        if not isinstance(review_ids, list) or not all(isinstance(i, int) for i in review_ids):
            return Response(
                {'detail': 'review_ids должен быть списком целых чисел.'},
                status=400,
            )
        if new_status not in [c[0] for c in Review.Status.choices]:
            return Response(
                {'detail': f'status должен быть один из {[c[0] for c in Review.Status.choices]}'},
                status=400,
            )
        
        updated = Review.objects.filter(id__in=review_ids).update(status=new_status)
        return Response({'updated': updated, 'errors': []}, status=200)
```

---

## 3. Регистрация URL

В `backend/ac_catalog/admin_urls.py` — добавь:

```python
from ac_reviews import admin_views as review_admin_views

router.register(r'presets', methodology_admin_views.RatingPresetAdminViewSet, basename='preset')
router.register(r'reviews', review_admin_views.ReviewAdminViewSet, basename='review-admin')

urlpatterns = [
    # ...existing...
    path('reviews/bulk-update/',
         review_admin_views.ReviewBulkUpdateView.as_view(),
         name='review-bulk-update'),
    # ...existing...
    path('', include(router.urls)),
]
```

**Внимание:** `bulk-update/` нужно зарегистрировать **до** `include(router.urls)`, чтобы DRF не поймал `bulk-update` как `<int:pk>` для review-detail. Этот же приём ты использовал в Ф8A для brands/normalize-logos.

**Permission:** `IsHvacAdminProxyAllowed` на ВСЕ.

---

## 4. Тесты

**Файлы (новые):**
- `backend/ac_methodology/tests/test_admin_presets.py` — 8-10 тестов.
- `backend/ac_reviews/tests/test_admin_views.py` — 12-15 тестов.

### RatingPreset tests
- Permission denied (anon → 401, regular → 403, staff → 200).
- CRUD happy path.
- Создать с `criteria_ids: [1,2,3]` → M2M синхронизирован.
- Update `criteria_ids: []` → M2M очищен.
- Filter `?is_active=true`.
- `criteria_count` для preset с `is_all_selected=True` → -1 (маркер ВСЕ).

### Review tests
- Permission denied (anon → 401, regular user → 403, staff → 200).
- list возвращает model_brand/model_inner_unit/model_slug.
- Filter `?status=pending` возвращает только pending.
- PATCH с `{status: 'approved'}` → 200, status обновлён.
- POST на endpoint → 405 (не разрешаем create через admin).
- Попытка PATCH `pros` (read-only) → 200 но pros не меняется.
- DELETE → 204.
- Bulk-update happy path: 3 review_ids → status=approved → 3 updated.
- Bulk-update с невалидным status → 400.
- Bulk-update с невалидным review_ids (не list, или строки) → 400.

---

## 5. Приёмка

1. `pytest backend/ac_methodology/tests/test_admin_presets.py` — все зелёные.
2. `pytest backend/ac_reviews/tests/test_admin_views.py` — все зелёные.
3. `pytest backend/ac_*/` — без регрессий.
4. `python manage.py check` — чисто.
5. `python manage.py makemigrations --dry-run --check` — **No changes detected**. В этой фазе НЕТ новых миграций (модели не меняем).

---

## Что НЕ делаем

- ❌ Submissions — это Ф8C.
- ❌ Public endpoint для отзывов (`/api/public/v1/rating/reviews/`) — он уже работает, не трогай.
- ❌ Создание отзывов через admin (POST на `/admin/reviews/`) — модератор только модерирует.
- ❌ Редактирование тела отзыва (rating, pros, cons) — пока read-only. Если потребуется — отдельная задача.
- ❌ Нотификации автору при approve/reject — вне scope (нет email-инфраструктуры под публичные отзывы).

---

## Известные нюансы

1. **`is_all_selected=True`** у RatingPreset — M2M не нужен, но фронт всё равно увидит фактические `criteria_ids` (возможно пустой список). Это нормально, фронт реагирует на флаг is_all_selected, не на содержимое M2M.
2. **`Review.ip_address`** — read-only в админке (privacy). На list-странице в API можно показать (для модератора полезно при борьбе со спамом), но writable не делаем.
3. **`Review.model`** — FK на ACModel. В list-сериализаторе денормализуем `model_brand`, `model_inner_unit`, `model_slug` — фронту удобнее.
4. **DELETE отзыва** — допускаем (для жёсткого спама, удаление по DSGVO/152-ФЗ запросу). Без soft-delete.
5. **`Review.Status` choices** — `pending`, `approved`, `rejected`. Дефолт `pending`. Публичный endpoint показывает только `approved` (см. `ac_reviews/views.py`).

---

## Формат отчёта

```
Отчёт — Ф8B-2 backend (AC-Петя)

Ветка: ac-rating/f8b2-backend (rebased на origin/main)
Коммиты:
  <git log --oneline main..HEAD>

Что сделано:
- ✅ RatingPreset CRUD endpoints (с M2M criteria sync)
- ✅ Review модерация: list/retrieve/PATCH/DELETE + bulk-update
- ✅ Permission IsHvacAdminProxyAllowed везде
- ✅ <N> тестов в ac_methodology + <M> тестов в ac_reviews — все зелёные

Что НЕ сделано:
- (если есть)

Прогон:
- pytest backend/ac_methodology/tests/test_admin_presets.py: <N> passed
- pytest backend/ac_reviews/tests/test_admin_views.py: <M> passed
- pytest backend/ac_*/: <X> passed (без регрессий)
- python manage.py check: ok
- makemigrations --dry-run --check: No changes detected

Известные риски:
- ...

Ключевые файлы для ревью:
- backend/ac_methodology/admin_views.py (+RatingPresetAdminViewSet)
- backend/ac_methodology/admin_serializers.py (+AdminRatingPresetSerializer)
- backend/ac_reviews/admin_views.py (новый)
- backend/ac_reviews/admin_serializers.py (новый)
- backend/ac_catalog/admin_urls.py (+register +path bulk-update)
- backend/ac_methodology/tests/test_admin_presets.py (новый)
- backend/ac_reviews/tests/test_admin_views.py (новый)
```
