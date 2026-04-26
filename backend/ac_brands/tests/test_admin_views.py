"""Тесты админского API брендов (/api/hvac/rating/brands/...)."""
from __future__ import annotations

from io import BytesIO
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User
from PIL import Image
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from ac_brands.models import Brand
from ac_brands.tests.factories import BrandFactory, BrandOriginClassFactory
from personnel.models import Employee, default_erp_permissions


def _png_bytes(width: int = 8, height: int = 8) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (width, height), (200, 100, 50)).save(buf, format="PNG")
    return buf.getvalue()


def _png_via_file():
    """Helper: ContentFile с PNG для `Brand.logo.save()`."""
    from django.core.files.base import ContentFile
    return ContentFile(_png_bytes(), name="logo.png")


@pytest.fixture
def anon_client():
    return APIClient()


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        username="brand_staff", password="x", is_staff=True,
    )


@pytest.fixture
def regular_user(db):
    user = User.objects.create_user(username="brand_reg", password="x")
    Employee.objects.create(
        full_name="Regular", user=user, erp_permissions=default_erp_permissions(),
    )
    return user


@pytest.fixture
def staff_client(staff_user):
    client = APIClient()
    refresh = RefreshToken.for_user(staff_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def regular_client(regular_user):
    client = APIClient()
    refresh = RefreshToken.for_user(regular_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


# ── Permissions ──────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_anonymous_brands_list_401(anon_client):
    resp = anon_client.get("/api/hvac/rating/brands/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_regular_user_brands_list_403(regular_client):
    resp = regular_client.get("/api/hvac/rating/brands/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_staff_brands_list_200(staff_client):
    BrandFactory(name="Gree")
    resp = staff_client.get("/api/hvac/rating/brands/")
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    assert any(b["name"] == "Gree" for b in items)


# ── CRUD ────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_brand_minimal(staff_client):
    resp = staff_client.post(
        "/api/hvac/rating/brands/",
        {"name": "Daikin", "is_active": True},
        format="json",
    )
    assert resp.status_code == 201, resp.json()
    assert Brand.objects.filter(name="Daikin").exists()


@pytest.mark.django_db
def test_retrieve_brand_returns_models_count(staff_client):
    from ac_catalog.tests.factories import ACModelFactory

    brand = BrandFactory(name="Mitsubishi")
    ACModelFactory(brand=brand)
    ACModelFactory(brand=brand)

    resp = staff_client.get(f"/api/hvac/rating/brands/{brand.id}/")
    assert resp.status_code == 200
    assert resp.json()["models_count"] == 2


@pytest.mark.django_db
def test_patch_brand_origin_class(staff_client):
    brand = BrandFactory(name="Haier")
    origin = BrandOriginClassFactory(origin_type="China")
    resp = staff_client.patch(
        f"/api/hvac/rating/brands/{brand.id}/",
        {"origin_class": origin.id, "sales_start_year_ru": 2010},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    brand.refresh_from_db()
    assert brand.origin_class_id == origin.id
    assert brand.sales_start_year_ru == 2010


@pytest.mark.django_db
def test_delete_brand(staff_client):
    brand = BrandFactory(name="Royal")
    resp = staff_client.delete(f"/api/hvac/rating/brands/{brand.id}/")
    assert resp.status_code == 204
    assert not Brand.objects.filter(pk=brand.id).exists()


@pytest.mark.django_db
def test_brand_filter_is_active(staff_client):
    BrandFactory(name="Active1", is_active=True)
    BrandFactory(name="Inactive1", is_active=False)

    resp = staff_client.get("/api/hvac/rating/brands/?is_active=false")
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    names = {b["name"] for b in items}
    assert "Inactive1" in names
    assert "Active1" not in names


@pytest.mark.django_db
def test_brand_search(staff_client):
    BrandFactory(name="Samsung")
    BrandFactory(name="Panasonic")

    resp = staff_client.get("/api/hvac/rating/brands/?search=samsu")
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    names = {b["name"] for b in items}
    assert "Samsung" in names
    assert "Panasonic" not in names


# ── Logo upload через multipart ──────────────────────────────────────────


@pytest.mark.django_db
def test_brand_logo_upload_multipart(staff_client, tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    brand = BrandFactory(name="LogoTest")

    from django.core.files.uploadedfile import SimpleUploadedFile
    upload = SimpleUploadedFile(
        "logo.png", _png_bytes(), content_type="image/png",
    )
    resp = staff_client.patch(
        f"/api/hvac/rating/brands/{brand.id}/",
        {"logo": upload},
        format="multipart",
    )
    assert resp.status_code == 200, resp.json()
    brand.refresh_from_db()
    assert brand.logo.name


# ── Actions ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_anonymous_normalize_logos_401(anon_client):
    resp = anon_client.post(
        "/api/hvac/rating/brands/normalize-logos/", {}, format="json",
    )
    assert resp.status_code == 401


@pytest.mark.django_db
def test_regular_user_normalize_logos_403(regular_client):
    resp = regular_client.post(
        "/api/hvac/rating/brands/normalize-logos/", {}, format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_normalize_logos_invokes_normalizer(staff_client, tmp_path, settings):
    """Не зависим от реального PIL-нормалайзера: мокаем `normalize_logo_file`,
    проверяем что он зовётся для бренда с логотипом и счётчик `normalized`
    инкрементится.
    """
    settings.MEDIA_ROOT = str(tmp_path)
    brand_with_logo = BrandFactory(name="WithLogo")
    brand_with_logo.logo.save("x.png", _png_via_file(), save=True)
    BrandFactory(name="NoLogo")  # без logo — не должна обрабатываться

    with patch(
        "ac_brands.admin_views.normalize_logo_file",
        return_value=_png_bytes(),
    ) as mock_normalize:
        resp = staff_client.post(
            "/api/hvac/rating/brands/normalize-logos/", {}, format="json",
        )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["normalized"] == 1
    assert body["errors"] == []
    assert mock_normalize.call_count == 1


@pytest.mark.django_db
def test_normalize_logos_filters_by_brand_ids(staff_client, tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    b1 = BrandFactory(name="Logo1")
    b1.logo.save("a.png", _png_via_file(), save=True)
    b2 = BrandFactory(name="Logo2")
    b2.logo.save("b.png", _png_via_file(), save=True)

    with patch(
        "ac_brands.admin_views.normalize_logo_file",
        return_value=_png_bytes(),
    ):
        resp = staff_client.post(
            "/api/hvac/rating/brands/normalize-logos/",
            {"brand_ids": [b1.id]},
            format="json",
        )
    assert resp.status_code == 200
    assert resp.json()["normalized"] == 1


@pytest.mark.django_db
def test_generate_dark_logos_endpoint(staff_client, tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    b1 = BrandFactory(name="Dark1")
    b1.logo.save("d.png", _png_via_file(), save=True)
    BrandFactory(name="DarkNoLogo")

    with patch(
        "ac_brands.admin_views.generate_dark_logo",
        return_value=_png_bytes(),
    ) as mock_gen:
        resp = staff_client.post(
            "/api/hvac/rating/brands/generate-dark-logos/", {}, format="json",
        )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["generated"] == 1
    assert body["skipped_colored"] == 0
    assert body["errors"] == []
    assert mock_gen.call_count == 1


@pytest.mark.django_db
def test_generate_dark_logos_skipped_colored(staff_client, tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    b1 = BrandFactory(name="ColorBrand")
    b1.logo.save("c.png", _png_via_file(), save=True)

    with patch(
        "ac_brands.admin_views.generate_dark_logo",
        return_value=None,  # цветной → skipped
    ):
        resp = staff_client.post(
            "/api/hvac/rating/brands/generate-dark-logos/", {}, format="json",
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["generated"] == 0
    assert body["skipped_colored"] == 1
