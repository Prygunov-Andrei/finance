# TASK — Ф8A backend — admin API для каталога моделей и брендов

## Цель

Создать DRF endpoints под `/api/hvac/rating/` для CRUD операций с моделями кондиционеров (`ACModel`) и брендами (`Brand`). Это первая половина Ф8A — после неё Федя пишет UI на готовый API.

Сейчас `backend/ac_catalog/admin_urls.py` — пустой каркас. Мы его наполняем.

Публичный API (`/api/public/v1/rating/`) уже работает и его **НЕ ТРОГАЕМ** — он read-only.

---

## Endpoints

Под `app_name = "ac_rating_admin"` через DRF DefaultRouter (где возможно):

### 1. `ACModel` CRUD

```
GET    /api/hvac/rating/models/                       — list (с фильтрами, поиском)
POST   /api/hvac/rating/models/                       — create
GET    /api/hvac/rating/models/{id}/                  — retrieve (полный)
PUT    /api/hvac/rating/models/{id}/                  — update
PATCH  /api/hvac/rating/models/{id}/                  — partial update
DELETE /api/hvac/rating/models/{id}/                  — delete

POST   /api/hvac/rating/models/{id}/recalculate/      — пересчёт total_index одной модели
```

**list-фильтры (GET /models/?…):**
- `brand=<id>` (multi: `?brand=1&brand=2`)
- `publish_status=draft|review|published|archived`
- `equipment_type=<id>`
- `region=<id>` (через ModelRegion FK)
- `search=<q>` — по `inner_unit`, `outer_unit`, `series`, `brand__name_ru`
- `ordering=<field>` — `total_index`, `-total_index`, `inner_unit`, `created_at`, `-created_at`

**Сериализатор list (краткий):**
```py
class AdminACModelListSerializer(serializers.ModelSerializer):
    brand_name = serializers.CharField(source="brand.name_ru", read_only=True)
    brand_id = serializers.IntegerField(source="brand.id", read_only=True)
    primary_photo_url = serializers.SerializerMethodField()
    rank = serializers.SerializerMethodField()  # порядковый номер в активной методике
    
    class Meta:
        model = ACModel
        fields = (
            "id", "brand_id", "brand_name", "series", "inner_unit", "outer_unit",
            "total_index", "rank", "publish_status", "is_ad", "ad_position",
            "primary_photo_url", "created_at", "updated_at",
        )
```

**Сериализатор detail (полный, writable):**
- Все поля `ACModel`
- `photos`: nested writable serializer для `ACModelPhoto` (id, image, caption, sort_order, is_primary)
- `suppliers`: nested writable для `ACModelSupplier` (id, supplier_name, url, region, sort_order)
- `raw_values`: nested writable для `ModelRawValue` (id, criterion_code, raw_value, numeric_value)
- `regions`: M2M через `ModelRegion`

```py
class AdminACModelDetailSerializer(serializers.ModelSerializer):
    photos = AdminACModelPhotoSerializer(many=True, required=False)
    suppliers = AdminACModelSupplierSerializer(many=True, required=False)
    raw_values = AdminModelRawValueSerializer(many=True, required=False)
    region_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Region.objects.all(), source="regions",
        write_only=True, required=False,
    )

    class Meta:
        model = ACModel
        fields = "__all__"  # явно перечислить
    
    def update(self, instance, validated_data):
        photos_data = validated_data.pop("photos", None)
        suppliers_data = validated_data.pop("suppliers", None)
        raw_values_data = validated_data.pop("raw_values", None)
        
        instance = super().update(instance, validated_data)
        
        if photos_data is not None:
            self._sync_photos(instance, photos_data)
        if suppliers_data is not None:
            self._sync_suppliers(instance, suppliers_data)
        if raw_values_data is not None:
            self._sync_raw_values(instance, raw_values_data)
        
        return instance
```

**Sync-стратегия для inline (photos/suppliers/raw_values):**
- Если в payload есть `id` — обновить существующую запись
- Если нет `id` — создать новую
- Если в БД есть запись с id, которого нет в payload — удалить
- Сохранить порядок (`sort_order`)

**Photo upload отдельно** (multipart):
```
POST   /api/hvac/rating/models/{id}/photos/         — upload (FormData с image)
PATCH  /api/hvac/rating/models/{id}/photos/{pid}/   — update (caption, sort_order, is_primary)
DELETE /api/hvac/rating/models/{id}/photos/{pid}/
POST   /api/hvac/rating/models/{id}/photos/reorder/ — bulk reorder (body: {ids: [3,1,2]})
```

Причина: photo upload через JSON нельзя (бинарь). Frontend будет делать `POST .../photos/` для каждого нового файла, а потом `PATCH /models/{id}/` для остальных текстовых полей.

**Recalculate action:**
```
POST   /api/hvac/rating/models/{id}/recalculate/
→ запускает существующий механизм пересчёта одной модели
→ возвращает обновлённую модель (тот же detail-сериализатор)
```

---

### 2. `Brand` CRUD

```
GET    /api/hvac/rating/brands/        — list
POST   /api/hvac/rating/brands/        — create
GET    /api/hvac/rating/brands/{id}/   — retrieve
PUT    /api/hvac/rating/brands/{id}/   — update
PATCH  /api/hvac/rating/brands/{id}/
DELETE /api/hvac/rating/brands/{id}/
```

**Logo upload:** через multipart `PUT/PATCH` с полями `logo` (light) и `logo_dark`. Стандартная Django `ImageField`-обработка.

**list (бренд):**
```py
class AdminBrandSerializer(serializers.ModelSerializer):
    models_count = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()
    logo_dark_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Brand
        fields = (
            "id", "slug", "name_ru", "name_en", "name_de", "name_pt",
            "origin_class", "founding_year", "sort_order", "is_active",
            "logo", "logo_dark", "logo_url", "logo_dark_url", "models_count",
        )
    
    def get_models_count(self, obj):
        return obj.models.count()
```

**Action:**
```
POST   /api/hvac/rating/brands/normalize-logos/   — действие "Normalize logos"
```

Эта operation сейчас в Django-admin как `normalize_brand_logos action`. Перенеси логику.

---

### 3. Read-only справочники

```
GET /api/hvac/rating/equipment-types/   — list (read-only)
GET /api/hvac/rating/regions/           — list (read-only)
```

Для frontend dropdown'ов — простые список с `{id, name}`.

---

## Permission

Используй `hvac_bridge.permissions.IsHvacAdminProxyAllowed` для **всех** ViewSet'ов. Anonymous → 401, regular user без `marketing` permission → 403.

```py
from hvac_bridge.permissions import IsHvacAdminProxyAllowed

class ACModelAdminViewSet(viewsets.ModelViewSet):
    permission_classes = [IsHvacAdminProxyAllowed]
    ...
```

---

## Файловая структура

Новые файлы:

```
backend/ac_catalog/
  admin_views.py              ← ACModelAdminViewSet, photo endpoints
  admin_serializers.py        ← AdminACModel*Serializer, AdminBrandSerializer
  admin_urls.py               ← наполнить (сейчас пустой каркас)

backend/ac_brands/
  admin_views.py              ← BrandAdminViewSet
  admin_serializers.py        ← AdminBrandSerializer (можно вынести сюда из ac_catalog/admin_serializers.py)
  admin_urls.py               ← новый файл

backend/ac_catalog/tests/
  test_admin_views.py         ← CRUD ACModel + photos + recalculate

backend/ac_brands/tests/
  test_admin_views.py         ← CRUD Brand + normalize-logos
```

**`backend/ac_catalog/admin_urls.py`** — naполнить через DRF DefaultRouter:

```py
from rest_framework.routers import DefaultRouter
from django.urls import path, include

from . import admin_views
from ac_brands import admin_views as brand_admin_views

app_name = "ac_rating_admin"

router = DefaultRouter()
router.register(r"models", admin_views.ACModelAdminViewSet, basename="model")
router.register(r"brands", brand_admin_views.BrandAdminViewSet, basename="brand")
router.register(r"equipment-types", admin_views.EquipmentTypeAdminViewSet, basename="equipment-type")
router.register(r"regions", admin_views.ModelRegionAdminViewSet, basename="region")

urlpatterns = [
    path("", include(router.urls)),
    path(
        "models/<int:pk>/recalculate/",
        admin_views.ACModelRecalculateView.as_view(),
        name="model-recalculate",
    ),
    # Photo CRUD — отдельно, потому что DRF ViewSet не очень дружит
    # с nested-resource через router.register(); делаем APIView'ами:
    path(
        "models/<int:model_id>/photos/",
        admin_views.ACModelPhotoListCreateView.as_view(),
        name="model-photos",
    ),
    path(
        "models/<int:model_id>/photos/<int:pk>/",
        admin_views.ACModelPhotoDetailView.as_view(),
        name="model-photo-detail",
    ),
    path(
        "models/<int:model_id>/photos/reorder/",
        admin_views.ACModelPhotoReorderView.as_view(),
        name="model-photo-reorder",
    ),
    path(
        "brands/normalize-logos/",
        brand_admin_views.BrandNormalizeLogosView.as_view(),
        name="brand-normalize-logos",
    ),
]
```

`urlpatterns` верхнего уровня уже подключён в `backend/finans_assistant/urls.py` — НЕ ТРОГАЙ файл `urls.py` корневой, он уже включает `path('api/hvac/rating/', include('ac_catalog.admin_urls'))`.

---

## Тесты

В `backend/ac_catalog/tests/test_admin_views.py` и `backend/ac_brands/tests/test_admin_views.py`:

### Permission tests (для каждого endpoint)
- Anonymous → 401 (`Authentication credentials were not provided`)
- Authenticated user без `marketing` permission → 403
- Staff user → 200/201/204

### CRUD happy path

**ACModel:**
- `GET /models/` — пустой список → 200, `[]`
- `POST /models/` с минимальным валидным payload (brand, inner_unit) → 201, slug автогенерируется
- `GET /models/{id}/` → 200, все поля
- `PATCH /models/{id}/` с обновлением `editorial_lede` → 200, поле обновилось
- `DELETE /models/{id}/` → 204
- Создать модель с nested `suppliers: [{...}]` → суплаер создан
- Update с пустыми `suppliers: []` → все суплаеры удалены
- Update `raw_values: [{criterion_code: "noise", numeric_value: 25}]` → значение сохранено

**Photos:**
- `POST /models/{id}/photos/` с image (мокаем через `SimpleUploadedFile`) → 201
- `PATCH /models/{id}/photos/{pid}/` `{is_primary: true}` → 200, остальные стали `is_primary=False`
- `POST /models/{id}/photos/reorder/` `{ids: [3,1,2]}` → 200, `sort_order` обновился

**Brand:**
- CRUD стандартный
- `GET /brands/{id}/` возвращает `models_count`
- `POST /brands/normalize-logos/` → 200, в ответе сколько brand'ов обработано

### Filter tests
- `GET /models/?brand=1&brand=2` → только модели брендов 1 и 2
- `GET /models/?publish_status=draft` → только черновики
- `GET /models/?search=Gree` → совпадение по brand_name_ru или inner_unit
- `GET /models/?ordering=-total_index` → DESC

---

## Приёмка

1. `pytest backend/ac_catalog/tests/test_admin_views.py backend/ac_brands/tests/test_admin_views.py` — все зелёные.
2. `pytest backend/` (полный прогон) — без регрессий.
3. `python manage.py check` — чисто.
4. `python manage.py makemigrations --dry-run` — нет новых миграций (модели не меняем).
5. Smoke через `curl`:
   ```bash
   # Anonymous — должно быть 401
   curl -i http://localhost:8000/api/hvac/rating/models/
   
   # С JWT staff-токеном — 200
   curl -i -H "Authorization: Bearer <token>" http://localhost:8000/api/hvac/rating/models/
   ```
6. **Документация в коде:** docstring у каждого ViewSet'а — что делает, какие фильтры поддерживает.

---

## Что НЕ делаем в этой фазе

- ❌ Не делаем endpoints для `Criterion`, `MethodologyVersion`, `Review`, `Submission` — это Ф8B/C.
- ❌ Не делаем UI — это задача Феди после твоей работы.
- ❌ Не трогаем публичный API (`public_urls.py`, `views/`).
- ❌ Не подключаем Celery (decision Ф8 Q5: sync остаётся).
- ❌ Не пишем XLSX-импорт UI (decision Ф8 Q3: оставляем management command).
- ❌ Не трогаем Django-admin (старая админка остаётся работать как fallback до Ф8D).

---

## Известные нюансы из истории проекта

1. **`ac_catalog/i18n.py`** — есть утилита `pick_translated()` для multi-language fields (Russian/English/German/Portuguese). На Ф8A нам интересно только русское имя, остальные — read-write пробросом без переводов.
2. **`recalculate_all` через signal** — при изменении weights критериев модели срабатывает sync-пересчёт. Учти это — твой PATCH через ModelViewSet может триггерить пересчёт. Это нормально; в Ф8B мы добавим UI-кнопку «пересчитать всё».
3. **Photo storage** — `ACModelPhoto.image` использует `upload_to='ac_rating/photos/'`. На локалке файлы кладутся в `backend/media/ac_rating/photos/`, на проде — туда же физически (без S3 для media сейчас).
4. **Slug-генерация** — при создании модели `slug` пустой → автогенерируется в `save()` из `brand.slug + series + inner_unit`. Не пытайся сериализатором заполнить — оставь read-only в детали.
5. **MAX_PHOTOS = 6** — есть ограничение на количество фото у модели (в `ac_catalog/services/photo_limits.py` или похожем). Учти при upload — 7-я фотка → 400 с понятным сообщением.

---

## Формат отчёта

После завершения — отчёт Андрею в чат:

```
Отчёт — Ф8A backend (AC-Петя)

Ветка: ac-rating/f8a-backend
Коммиты:
  <git log --oneline main..HEAD>

Что сделано:
- ✅ ACModel CRUD endpoints (GET/POST/PATCH/DELETE)
- ✅ Photo upload + reorder + delete
- ✅ ACModel recalculate action
- ✅ Brand CRUD + normalize-logos
- ✅ EquipmentType, Region read-only
- ✅ Permission IsHvacAdminProxyAllowed на всё
- ✅ <N> тестов в test_admin_views.py — все зелёные
- ✅ <M> тестов суммарно в backend/ — без регрессий

Что НЕ сделано:
- (если есть — почему)

Прогон:
- pytest backend/ac_catalog/tests/test_admin_views.py: <N> passed
- pytest backend/ac_brands/tests/test_admin_views.py: <M> passed
- pytest backend/: <X> passed
- python manage.py check: ok

Известные риски:
- (если есть)

Ключевые файлы для ревью:
- backend/ac_catalog/admin_views.py
- backend/ac_catalog/admin_serializers.py
- backend/ac_catalog/admin_urls.py
- backend/ac_brands/admin_views.py
- backend/ac_brands/admin_urls.py
- backend/ac_catalog/tests/test_admin_views.py
- backend/ac_brands/tests/test_admin_views.py
```
