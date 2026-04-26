"""Тесты админского API каталога моделей кондиционеров (/api/hvac/rating/...)."""
from __future__ import annotations

from io import BytesIO

import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from ac_brands.tests.factories import BrandFactory
from ac_catalog.admin_views import MAX_PHOTOS
from ac_catalog.models import ACModel, ACModelPhoto, ACModelSupplier, ModelRegion, ModelRawValue
from ac_catalog.tests.factories import (
    ACModelFactory,
    ACModelPhotoFactory,
    ACModelSupplierFactory,
    EquipmentTypeFactory,
    PublishedACModelFactory,
)
from ac_methodology.tests.factories import (
    ActiveMethodologyVersionFactory,
    CriterionFactory,
    MethodologyCriterionFactory,
)
from personnel.models import Employee, default_erp_permissions


def _png_bytes(width: int = 8, height: int = 8) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (width, height), (10, 200, 150)).save(buf, format="PNG")
    return buf.getvalue()


def _png_upload(name: str = "p.png") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, _png_bytes(), content_type="image/png")


# ── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def anon_client():
    return APIClient()


@pytest.fixture
def staff_client(db):
    user = User.objects.create_user(
        username="ac_staff", password="x", is_staff=True,
    )
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def regular_client(db):
    user = User.objects.create_user(username="ac_reg", password="x")
    Employee.objects.create(
        full_name="Reg", user=user, erp_permissions=default_erp_permissions(),
    )
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def media_tmp(tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    return tmp_path


# ── Permissions ──────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_models_list_anonymous_401(anon_client):
    resp = anon_client.get("/api/hvac/rating/models/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_models_list_regular_user_403(regular_client):
    resp = regular_client.get("/api/hvac/rating/models/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_models_list_staff_200_empty(staff_client):
    resp = staff_client.get("/api/hvac/rating/models/")
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body.get("results", [])
    assert items == []


# ── List filters / search / ordering ─────────────────────────────────────


@pytest.mark.django_db
def test_models_filter_by_brand_multi(staff_client):
    b1 = BrandFactory(name="B1")
    b2 = BrandFactory(name="B2")
    b3 = BrandFactory(name="B3")
    ACModelFactory(brand=b1)
    ACModelFactory(brand=b2)
    ACModelFactory(brand=b3)

    resp = staff_client.get(
        f"/api/hvac/rating/models/?brand={b1.id}&brand={b2.id}",
    )
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    brand_ids = {item["brand_id"] for item in items}
    assert brand_ids == {b1.id, b2.id}


@pytest.mark.django_db
def test_models_filter_by_publish_status(staff_client):
    PublishedACModelFactory()
    ACModelFactory()  # draft

    resp = staff_client.get("/api/hvac/rating/models/?publish_status=draft")
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    assert len(items) == 1
    assert items[0]["publish_status"] == "draft"


@pytest.mark.django_db
def test_models_filter_by_equipment_type(staff_client):
    et = EquipmentTypeFactory(name="Split")
    m1 = ACModelFactory()
    m1.equipment_type = et
    m1.save()
    ACModelFactory()  # без типа

    resp = staff_client.get(f"/api/hvac/rating/models/?equipment_type={et.id}")
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    assert len(items) == 1
    assert items[0]["id"] == m1.id


@pytest.mark.django_db
def test_models_filter_by_region(staff_client):
    m_ru = ACModelFactory()
    ModelRegion.objects.create(model=m_ru, region_code="ru")
    m_eu = ACModelFactory()
    ModelRegion.objects.create(model=m_eu, region_code="eu")

    resp = staff_client.get("/api/hvac/rating/models/?region=ru")
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    ids = {item["id"] for item in items}
    assert ids == {m_ru.id}


@pytest.mark.django_db
def test_models_search(staff_client):
    brand = BrandFactory(name="Gree")
    ACModelFactory(brand=brand, inner_unit="MSAGS-09")
    ACModelFactory(brand=BrandFactory(name="Other"), inner_unit="XYZ-01")

    resp = staff_client.get("/api/hvac/rating/models/?search=msags")
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    assert len(items) == 1
    assert "MSAGS" in items[0]["inner_unit"]


@pytest.mark.django_db
def test_models_ordering_by_total_index_desc(staff_client):
    ACModelFactory(total_index=10)
    ACModelFactory(total_index=50)
    ACModelFactory(total_index=30)

    resp = staff_client.get("/api/hvac/rating/models/?ordering=-total_index")
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    indices = [item["total_index"] for item in items]
    assert indices == sorted(indices, reverse=True)


# ── CRUD ─────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_model_minimal(staff_client):
    brand = BrandFactory(name="CrudBrand")
    resp = staff_client.post(
        "/api/hvac/rating/models/",
        {
            "brand": brand.id,
            "inner_unit": "ABC-09",
            "publish_status": "draft",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.json()
    data = resp.json()
    assert data["slug"]  # автогенерация
    assert data["inner_unit"] == "ABC-09"
    assert ACModel.objects.filter(pk=data["id"]).exists()


@pytest.mark.django_db
def test_retrieve_model_full_detail(staff_client):
    brand = BrandFactory(name="DetailBrand")
    model = ACModelFactory(brand=brand, editorial_lede="Старый лид.")
    ACModelSupplierFactory(model=model, name="Поставщик-1")

    resp = staff_client.get(f"/api/hvac/rating/models/{model.id}/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == model.id
    assert data["brand_detail"]["name"] == "DetailBrand"
    assert any(s["name"] == "Поставщик-1" for s in data["suppliers"])
    assert data["editorial_lede"] == "Старый лид."


@pytest.mark.django_db
def test_patch_editorial_fields(staff_client):
    model = ACModelFactory()
    resp = staff_client.patch(
        f"/api/hvac/rating/models/{model.id}/",
        {"editorial_lede": "Новый лид"},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    model.refresh_from_db()
    assert model.editorial_lede == "Новый лид"


@pytest.mark.django_db
def test_delete_model(staff_client):
    model = ACModelFactory()
    resp = staff_client.delete(f"/api/hvac/rating/models/{model.id}/")
    assert resp.status_code == 204
    assert not ACModel.objects.filter(pk=model.id).exists()


# ── Nested suppliers ─────────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_model_with_nested_suppliers(staff_client):
    brand = BrandFactory(name="WithSup")
    resp = staff_client.post(
        "/api/hvac/rating/models/",
        {
            "brand": brand.id,
            "inner_unit": "S-01",
            "suppliers": [
                {"name": "Supp1", "url": "https://shop1.example/"},
                {"name": "Supp2", "url": "https://shop2.example/", "city": "Москва", "price": "12345.67"},
            ],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.json()
    model = ACModel.objects.get(pk=resp.json()["id"])
    assert model.suppliers.count() == 2
    assert model.suppliers.filter(name="Supp2", city="Москва").exists()


@pytest.mark.django_db
def test_patch_suppliers_empty_array_clears(staff_client):
    model = ACModelFactory()
    ACModelSupplierFactory(model=model, name="S-keep")
    resp = staff_client.patch(
        f"/api/hvac/rating/models/{model.id}/",
        {"suppliers": []},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    assert model.suppliers.count() == 0


@pytest.mark.django_db
def test_patch_suppliers_update_existing(staff_client):
    model = ACModelFactory()
    s = ACModelSupplierFactory(model=model, name="OldName", url="https://old.example/")
    resp = staff_client.patch(
        f"/api/hvac/rating/models/{model.id}/",
        {"suppliers": [{"id": s.id, "name": "NewName", "url": "https://new.example/"}]},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    s.refresh_from_db()
    assert s.name == "NewName"
    assert s.url == "https://new.example/"


# ── Nested raw_values ────────────────────────────────────────────────────


@pytest.mark.django_db
def test_patch_raw_values_creates_with_criterion_link(staff_client):
    model = ACModelFactory()
    crit = CriterionFactory(code="noise", name_ru="Шум")
    resp = staff_client.patch(
        f"/api/hvac/rating/models/{model.id}/",
        {
            "raw_values": [
                {"criterion_code": "noise", "raw_value": "25", "numeric_value": 25},
            ],
        },
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    rv = ModelRawValue.objects.get(model=model, criterion_code="noise")
    assert rv.criterion_id == crit.id
    assert rv.raw_value == "25"
    assert rv.numeric_value == 25


@pytest.mark.django_db
def test_patch_raw_values_removes_absent(staff_client):
    model = ACModelFactory()
    crit_a = CriterionFactory(code="a", name_ru="A")
    crit_b = CriterionFactory(code="b", name_ru="B")
    ModelRawValue.objects.create(
        model=model, criterion=crit_a, raw_value="1",
    )
    ModelRawValue.objects.create(
        model=model, criterion=crit_b, raw_value="2",
    )

    resp = staff_client.patch(
        f"/api/hvac/rating/models/{model.id}/",
        {"raw_values": [{"criterion_code": "a", "raw_value": "X"}]},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    codes = set(model.raw_values.values_list("criterion_code", flat=True))
    assert codes == {"a"}
    assert model.raw_values.get(criterion_code="a").raw_value == "X"


# ── Region codes ─────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_patch_region_codes_sync(staff_client):
    model = ACModelFactory()
    ModelRegion.objects.create(model=model, region_code="ru")

    resp = staff_client.patch(
        f"/api/hvac/rating/models/{model.id}/",
        {"region_codes": ["eu"]},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    codes = set(model.regions.values_list("region_code", flat=True))
    assert codes == {"eu"}


# ── Photos ───────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_photo_upload_201(staff_client, media_tmp):
    model = ACModelFactory()
    resp = staff_client.post(
        f"/api/hvac/rating/models/{model.id}/photos/",
        {"image": _png_upload(), "alt": "front view"},
        format="multipart",
    )
    assert resp.status_code == 201, resp.json()
    assert model.photos.count() == 1
    assert model.photos.first().alt == "front view"


@pytest.mark.django_db
def test_photo_upload_without_image_400(staff_client, media_tmp):
    model = ACModelFactory()
    resp = staff_client.post(
        f"/api/hvac/rating/models/{model.id}/photos/",
        {"alt": "no image"},
        format="multipart",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_photo_upload_max_limit_400(staff_client, media_tmp):
    model = ACModelFactory()
    for i in range(MAX_PHOTOS):
        ACModelPhotoFactory(model=model, order=i)
    resp = staff_client.post(
        f"/api/hvac/rating/models/{model.id}/photos/",
        {"image": _png_upload()},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "лимит" in resp.json()["detail"].lower() or "limit" in resp.json()["detail"].lower()


@pytest.mark.django_db
def test_photo_patch_metadata(staff_client, media_tmp):
    model = ACModelFactory()
    photo = ACModelPhotoFactory(model=model, order=0, alt="old")
    resp = staff_client.patch(
        f"/api/hvac/rating/models/{model.id}/photos/{photo.id}/",
        {"alt": "new alt", "order": 5},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    photo.refresh_from_db()
    assert photo.alt == "new alt"
    assert photo.order == 5


@pytest.mark.django_db
def test_photo_delete(staff_client, media_tmp):
    model = ACModelFactory()
    photo = ACModelPhotoFactory(model=model)
    resp = staff_client.delete(
        f"/api/hvac/rating/models/{model.id}/photos/{photo.id}/",
    )
    assert resp.status_code == 204
    assert not ACModelPhoto.objects.filter(pk=photo.id).exists()


@pytest.mark.django_db
def test_photo_reorder(staff_client, media_tmp):
    model = ACModelFactory()
    p1 = ACModelPhotoFactory(model=model, order=0)
    p2 = ACModelPhotoFactory(model=model, order=1)
    p3 = ACModelPhotoFactory(model=model, order=2)

    resp = staff_client.post(
        f"/api/hvac/rating/models/{model.id}/photos/reorder/",
        {"ids": [p3.id, p1.id, p2.id]},
        format="json",
    )
    assert resp.status_code == 200, resp.json()

    p1.refresh_from_db()
    p2.refresh_from_db()
    p3.refresh_from_db()
    assert p3.order == 0
    assert p1.order == 1
    assert p2.order == 2


@pytest.mark.django_db
def test_photo_reorder_rejects_foreign_id(staff_client, media_tmp):
    model = ACModelFactory()
    other_model = ACModelFactory()
    p = ACModelPhotoFactory(model=model)
    foreign = ACModelPhotoFactory(model=other_model)

    resp = staff_client.post(
        f"/api/hvac/rating/models/{model.id}/photos/reorder/",
        {"ids": [p.id, foreign.id]},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_photo_endpoints_anonymous_401(anon_client):
    model = ACModelFactory()
    resp = anon_client.get(f"/api/hvac/rating/models/{model.id}/photos/")
    assert resp.status_code == 401


# ── Recalculate ──────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_recalculate_no_methodology_400(staff_client):
    model = ACModelFactory()
    resp = staff_client.post(
        f"/api/hvac/rating/models/{model.id}/recalculate/", {}, format="json",
    )
    assert resp.status_code == 400
    assert "методик" in resp.json()["detail"].lower()


@pytest.mark.django_db
def test_recalculate_with_active_methodology_200(staff_client):
    methodology = ActiveMethodologyVersionFactory()
    crit = CriterionFactory(code="cap", name_ru="Capacity")
    MethodologyCriterionFactory(
        methodology=methodology, criterion=crit, weight=10.0,
        min_value=0.0, max_value=100.0,
    )
    model = ACModelFactory()

    resp = staff_client.post(
        f"/api/hvac/rating/models/{model.id}/recalculate/", {}, format="json",
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert "model" in body
    assert "recalculated" in body
    assert body["model"]["id"] == model.id


@pytest.mark.django_db
def test_recalculate_anonymous_401(anon_client):
    model = ACModelFactory()
    resp = anon_client.post(
        f"/api/hvac/rating/models/{model.id}/recalculate/", {}, format="json",
    )
    assert resp.status_code == 401


# ── Equipment types / regions read-only ──────────────────────────────────


@pytest.mark.django_db
def test_equipment_types_read_only_list(staff_client):
    EquipmentTypeFactory(name="Cassette")
    EquipmentTypeFactory(name="Wall-mounted")
    resp = staff_client.get("/api/hvac/rating/equipment-types/")
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    names = {item["name"] for item in items}
    assert {"Cassette", "Wall-mounted"}.issubset(names)


@pytest.mark.django_db
def test_equipment_types_create_method_not_allowed(staff_client):
    resp = staff_client.post(
        "/api/hvac/rating/equipment-types/", {"name": "X"}, format="json",
    )
    assert resp.status_code == 405


@pytest.mark.django_db
def test_regions_read_only_list(staff_client):
    resp = staff_client.get("/api/hvac/rating/regions/")
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    codes = {item["code"] for item in items}
    assert {"ru", "eu"}.issubset(codes)
