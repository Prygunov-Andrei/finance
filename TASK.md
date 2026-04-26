# TASK — Ф8C backend — модерация submissions заявок

## Цель

Расширить admin API под `/api/hvac/rating/` модерацией `ACSubmission`:
1. CRUD-подобный интерфейс: list / retrieve / PATCH (status) / DELETE.
2. Action `convert-to-acmodel/` — обёртка над существующим `convert_submission_to_acmodel`.
3. Bulk-update статусов (по образцу `/reviews/bulk-update/` из Ф8B-2).

После этой фазы — Ф8D (cleanup Django-admin), затем — батч-деплой Ф8A+B+C+D на прод.

---

## ⚠️ Урок Ф8A

Перед сериализатором — открой:
- `backend/ac_submissions/models.py:ACSubmission` — 40+ полей.
- `backend/ac_submissions/models.py:SubmissionPhoto` — фото (image, order).
- `backend/ac_submissions/services.py:convert_submission_to_acmodel` — что уже есть.

---

## 1. ACSubmission модерация

**Endpoints:** `/api/hvac/rating/submissions/`.

```
GET    /api/hvac/rating/submissions/                  — list
GET    /api/hvac/rating/submissions/{id}/             — retrieve (с nested photos)
PATCH  /api/hvac/rating/submissions/{id}/             — partial update (status + admin_notes)
DELETE /api/hvac/rating/submissions/{id}/             — delete (для спама)

POST   /api/hvac/rating/submissions/bulk-update/      — bulk status
POST   /api/hvac/rating/submissions/{id}/convert-to-acmodel/  — конверсия
```

**НЕ делаем:**
- POST `/submissions/` через admin — заявки создаются только публично.
- Полный PUT — только PATCH (модератор меняет только status и admin_notes; тело заявки read-only).

**Файлы (новые):**
- `backend/ac_submissions/admin_views.py` — `SubmissionAdminViewSet`, `SubmissionConvertView`, `SubmissionBulkUpdateView`.
- `backend/ac_submissions/admin_serializers.py` — `AdminSubmissionListSerializer`, `AdminSubmissionDetailSerializer`, `AdminSubmissionPhotoSerializer`.
- В `backend/ac_catalog/admin_urls.py` — `router.register(r'submissions', submission_admin_views.SubmissionAdminViewSet, basename='submission-admin')` + path для `bulk-update/` и `{id}/convert-to-acmodel/`.

### Сериализаторы

**Photo (read-only):**
```python
class AdminSubmissionPhotoSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = SubmissionPhoto
        fields = ('id', 'image_url', 'order')
        read_only_fields = fields

    def get_image_url(self, obj):
        request = self.context.get('request')
        url = obj.image.url if obj.image else ''
        return request.build_absolute_uri(url) if request and url else url
```

**List (краткий):**
```python
class AdminSubmissionListSerializer(serializers.ModelSerializer):
    brand_name = serializers.SerializerMethodField()
    photos_count = serializers.SerializerMethodField()
    primary_photo_url = serializers.SerializerMethodField()
    converted_model_id = serializers.IntegerField(source='converted_model.id', read_only=True, default=None)

    class Meta:
        model = ACSubmission
        fields = (
            'id', 'status',
            'brand_name', 'series', 'inner_unit', 'outer_unit',
            'nominal_capacity_watt', 'price',
            'submitter_email', 'photos_count', 'primary_photo_url',
            'converted_model_id',
            'created_at', 'updated_at',
        )
        read_only_fields = fields

    def get_brand_name(self, obj):
        return obj.brand.name if obj.brand else (obj.custom_brand_name or '—')

    def get_photos_count(self, obj):
        return obj.photos.count()

    def get_primary_photo_url(self, obj):
        photo = obj.photos.first()
        if not photo or not photo.image:
            return ''
        request = self.context.get('request')
        url = photo.image.url
        return request.build_absolute_uri(url) if request else url
```

**Detail (полный, тело read-only):**
- Все поля `ACSubmission` + nested `photos` (read-only) + `brand_name` (computed).
- Writable: только `status`, `admin_notes`, `brand` (FK — для случая «модератор привязал к бренду перед конверсией»).
- Все остальные поля — read-only.

```python
class AdminSubmissionDetailSerializer(serializers.ModelSerializer):
    photos = AdminSubmissionPhotoSerializer(many=True, read_only=True)
    brand_name = serializers.SerializerMethodField()
    converted_model_id = serializers.IntegerField(
        source='converted_model.id', read_only=True, default=None,
    )

    class Meta:
        model = ACSubmission
        fields = '__all__'   # явно перечисли все поля
        read_only_fields = (
            'id', 'created_at', 'updated_at',
            'inner_he_surface_area', 'outer_he_surface_area',
            'submitter_email', 'consent', 'ip_address',
            'converted_model', 'converted_model_id',
            'photos', 'brand_name',
            'series', 'inner_unit', 'outer_unit', 'compressor_model',
            'nominal_capacity_watt', 'price',
            'drain_pan_heater', 'erv', 'fan_speed_outdoor', 'remote_backlight',
            'fan_speeds_indoor', 'fine_filters', 'ionizer_type',
            'russian_remote', 'uv_lamp',
            'inner_he_length_mm', 'inner_he_tube_count', 'inner_he_tube_diameter_mm',
            'outer_he_length_mm', 'outer_he_tube_count', 'outer_he_tube_diameter_mm',
            'outer_he_thickness_mm',
            'video_url', 'buy_url', 'supplier_url',
            'custom_brand_name',
        )
        # Writable: status, admin_notes, brand
```

(Если ты предпочитаешь явно `fields = (...)` — да, это чище. Главное — список writable короткий: `status`, `admin_notes`, `brand`.)

### Filters
- `?status=pending|approved|rejected`
- `?brand=<id>` (опционально)
- `?search=<q>` — по `inner_unit`, `outer_unit`, `series`, `submitter_email`, `custom_brand_name`
- `?has_brand=true|false` — заявки с привязанным брендом vs custom-name (для воркфлоу: модератор фильтрует «без бренда» чтобы привязать)
- `?ordering=-created_at|created_at|-status` (default `-created_at`)

### ViewSet

```python
class SubmissionAdminViewSet(viewsets.ModelViewSet):
    permission_classes = [IsHvacAdminProxyAllowed]
    http_method_names = ['get', 'patch', 'delete', 'head', 'options']  # POST/PUT запрещены
    
    def get_serializer_class(self):
        if self.action == 'list':
            return AdminSubmissionListSerializer
        return AdminSubmissionDetailSerializer
    
    def get_queryset(self):
        qs = ACSubmission.objects.select_related('brand', 'converted_model').prefetch_related('photos')
        params = self.request.query_params
        # filters...
        return qs
```

---

## 2. Action: convert-to-acmodel

**Endpoint:** `POST /api/hvac/rating/submissions/{id}/convert-to-acmodel/`

**Реализация:**

```python
class SubmissionConvertView(APIView):
    permission_classes = [IsHvacAdminProxyAllowed]
    
    def post(self, request, pk):
        submission = get_object_or_404(ACSubmission, pk=pk)
        
        if submission.converted_model_id:
            return Response(
                {'detail': f'Заявка уже сконвертирована в модель #{submission.converted_model_id}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        try:
            ac_model = convert_submission_to_acmodel(submission)
        except Exception as exc:
            logger.exception('convert_submission_to_acmodel failed for submission %s', pk)
            return Response(
                {'detail': f'Ошибка конверсии: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        
        submission.status = ACSubmission.Status.APPROVED
        submission.converted_model = ac_model
        submission.save(update_fields=['status', 'converted_model'])
        
        return Response(
            {
                'submission_id': submission.id,
                'created_model_id': ac_model.id,
                'created_model_slug': ac_model.slug,
                'redirect_to': f'/hvac-rating/models/edit/{ac_model.id}/',  # фронту удобно
            },
            status=status.HTTP_201_CREATED,
        )
```

**Edge case:** если у submission нет `brand` И нет `custom_brand_name` — `convert_submission_to_acmodel` упадёт на NULL FK. Проверь это до вызова, верни 400 с понятным сообщением.

**Edge case 2:** если `submission.brand is None and submission.custom_brand_name`, существующий services.py делает `Brand.objects.get_or_create(name=custom_brand_name)`. Это нормально для MVP — новый бренд создастся со стандартными defaults. Документируй в response: `created_brand: True`.

---

## 3. Bulk-update

**Endpoint:** `POST /api/hvac/rating/submissions/bulk-update/`

По образцу `ReviewBulkUpdateView` из Ф8B-2:

```python
class SubmissionBulkUpdateView(APIView):
    permission_classes = [IsHvacAdminProxyAllowed]
    
    def post(self, request):
        submission_ids = request.data.get('submission_ids')
        new_status = request.data.get('status')
        
        if not isinstance(submission_ids, list) or not all(isinstance(i, int) and not isinstance(i, bool) for i in submission_ids):
            return Response({'detail': 'submission_ids должен быть списком целых чисел.'}, status=400)
        if new_status not in [c[0] for c in ACSubmission.Status.choices]:
            return Response({'detail': f'status должен быть один из {[c[0] for c in ACSubmission.Status.choices]}'}, status=400)
        
        updated = ACSubmission.objects.filter(id__in=submission_ids).update(status=new_status)
        return Response({'updated': updated, 'errors': []}, status=200)
```

**Внимание:** bulk-update **не запускает** convert-to-acmodel. Только меняет статус. Для конверсии модератор использует отдельную кнопку per-submission.

---

## 4. Регистрация URL

В `backend/ac_catalog/admin_urls.py` (после твоих регистраций из Ф8B):

```python
from ac_submissions import admin_views as submission_admin_views

router.register(r'submissions', submission_admin_views.SubmissionAdminViewSet, basename='submission-admin')

urlpatterns = [
    # ...existing...
    
    # Submissions: actions ДО include(router.urls)
    path('submissions/bulk-update/',
         submission_admin_views.SubmissionBulkUpdateView.as_view(),
         name='submission-bulk-update'),
    path('submissions/<int:pk>/convert-to-acmodel/',
         submission_admin_views.SubmissionConvertView.as_view(),
         name='submission-convert'),
    
    # ...existing reviews/bulk-update...
    
    path('', include(router.urls)),
]
```

Permission `IsHvacAdminProxyAllowed` на всех ViewSet'ах и APIView'ах.

---

## 5. Тесты

**Файл (новый):** `backend/ac_submissions/tests/test_admin_views.py`.

### Permission
- Anon → 401, regular user → 403, staff → 200.

### CRUD
- list возвращает поля денормализованные (brand_name, photos_count, primary_photo_url).
- list filter `?status=pending`.
- list filter `?has_brand=false` показывает заявки только с custom_brand_name.
- retrieve включает nested photos.
- PATCH `{status: 'approved'}` работает.
- PATCH `{admin_notes: '...'}` работает.
- PATCH `{inner_unit: 'X'}` (read-only) → не применяется.
- POST → 405.
- PUT → 405.
- DELETE → 204.

### Convert
- Happy path: PENDING submission с brand → POST convert → submission.converted_model_id заполнен, status=approved, response содержит created_model_id и redirect_to.
- Submission с custom_brand_name (нет brand FK) → конверсия успешна, новый Brand создан.
- Уже сконвертированная заявка → 400.
- Submission без brand И без custom_brand_name → 400.

### Bulk-update
- Happy path: 3 submission_ids → status=rejected → 3 updated.
- Невалидный status → 400.
- Невалидный submission_ids → 400.

---

## 6. Приёмка

1. `pytest backend/ac_submissions/tests/test_admin_views.py` — все зелёные.
2. `pytest backend/ac_*/` — без регрессий (важно: добавление endpoint'ов не должно ломать существующие тесты).
3. `python manage.py check` — чисто.
4. `python manage.py makemigrations --dry-run --check` — **No changes detected** (модели не меняем).

---

## Что НЕ делаем

- ❌ POST submission через admin — публичный endpoint уже есть.
- ❌ Полный PUT — только PATCH writable полей (status, admin_notes, brand).
- ❌ Edit тела заявки — read-only.
- ❌ Email-уведомление автору при approve/reject — нет инфраструктуры под публичные emails.
- ❌ Cleanup Django-admin — это Ф8D.

---

## Известные нюансы

1. **`convert_submission_to_acmodel` в `services.py`** — переиспользуй, не переписывай. Если нашёл баг в логике — отметь в отчёте, чинить отдельной задачей (не в Ф8C).
2. **`SubmissionPhoto`** копируется в `ACModelPhoto` через `convert_submission_to_acmodel` (проверь что это уже там — если нет, в этой фазе **не дописывай** — флагнь в отчёте, исправим отдельно).
3. **`brand` FK writable в PATCH** — модератор может привязать заявку к существующему Brand перед конверсией (если в submission было custom_brand_name).
4. **Permission staff** — Андрей и Максим. Regular user без `marketing` permission получит 403.
5. **`http_method_names`** в `ViewSet` блокирует POST/PUT — проверь работает (возвращает 405).

---

## Формат отчёта

```
Отчёт — Ф8C backend (AC-Петя)

Ветка: ac-rating/f8c-backend (rebased на origin/main)
Коммиты:
  <git log --oneline main..HEAD>

Что сделано:
- ✅ ACSubmission модерация: list/retrieve/PATCH/DELETE через ViewSet
- ✅ /submissions/{id}/convert-to-acmodel/ через services.py обёртку
- ✅ /submissions/bulk-update/
- ✅ Permission IsHvacAdminProxyAllowed
- ✅ <N> тестов

Что НЕ сделано:
- (если есть)

Прогон:
- pytest backend/ac_submissions/tests/test_admin_views.py: <N> passed
- pytest backend/ac_*/: <X> passed (без регрессий)
- python manage.py check: ok
- makemigrations --dry-run --check: No changes detected

Известные риски:
- ...

Ключевые файлы для ревью:
- backend/ac_submissions/admin_views.py (новый)
- backend/ac_submissions/admin_serializers.py (новый)
- backend/ac_catalog/admin_urls.py (+register submissions + 2 path)
- backend/ac_submissions/tests/test_admin_views.py (новый)
```
