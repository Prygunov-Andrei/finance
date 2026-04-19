"""Тесты публичного API ac_submissions."""
from __future__ import annotations

import io

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from ac_brands.models import Brand
from ac_brands.tests.factories import BrandFactory
from ac_submissions.models import ACSubmission, SubmissionPhoto


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def client():
    return APIClient()


def _png_bytes(size: int = 100) -> bytes:
    """Минимальный валидный PNG в памяти (size px квадрат)."""
    img = Image.new("RGB", (size, size), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _photo(name: str = "p.png", size_bytes: int | None = None) -> SimpleUploadedFile:
    if size_bytes is None:
        content = _png_bytes()
    else:
        content = b"x" * size_bytes
    return SimpleUploadedFile(name, content, content_type="image/png")


def _payload(brand: Brand) -> dict:
    return {
        "brand": brand.pk,
        "series": "S",
        "inner_unit": "i1",
        "outer_unit": "o1",
        "compressor_model": "comp-x",
        "nominal_capacity_watt": 2500,
        "drain_pan_heater": "no",
        "erv": False,
        "fan_speed_outdoor": False,
        "remote_backlight": False,
        "fan_speeds_indoor": 3,
        "fine_filters": 1,
        "ionizer_type": "none",
        "russian_remote": "yes",
        "uv_lamp": "no",
        "inner_he_length_mm": 700,
        "inner_he_tube_count": 12,
        "inner_he_tube_diameter_mm": 7.0,
        "outer_he_length_mm": 800,
        "outer_he_tube_count": 24,
        "outer_he_tube_diameter_mm": 7.0,
        "outer_he_thickness_mm": 22,
        "submitter_email": "a@example.com",
        "consent": True,
    }


# ── BrandList ──────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_brand_list_only_active_sorted(client):
    BrandFactory(name="Zeta", is_active=True)
    BrandFactory(name="Alpha", is_active=True)
    BrandFactory(name="Inactive", is_active=False)

    resp = client.get("/api/public/v1/rating/brands/")
    assert resp.status_code == 200
    body = resp.json()
    names = [b["name"] for b in body]
    assert names == ["Alpha", "Zeta"]


@pytest.mark.django_db
def test_brand_list_unauthenticated_no_401(client):
    resp = client.get("/api/public/v1/rating/brands/")
    assert resp.status_code == 200


# ── Submission create ─────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_submission_no_photos_returns_400(client):
    brand = BrandFactory()
    resp = client.post(
        "/api/public/v1/rating/submissions/", _payload(brand), format="multipart",
    )
    assert resp.status_code == 400
    assert resp.json()["photos"] == ["Загрузите хотя бы одно фото измерений."]


@pytest.mark.django_db
def test_create_submission_too_many_photos_returns_400(client):
    brand = BrandFactory()
    data = _payload(brand)
    photos = [_photo(f"p{i}.png") for i in range(21)]
    resp = client.post(
        "/api/public/v1/rating/submissions/",
        {**data, "photos": photos},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "Максимум 20 фото" in resp.json()["photos"][0]


@pytest.mark.django_db
def test_create_submission_oversize_photo_returns_400(client):
    brand = BrandFactory()
    data = _payload(brand)
    big = _photo("big.png", size_bytes=11 * 1024 * 1024)  # 11MB > 10MB limit
    resp = client.post(
        "/api/public/v1/rating/submissions/",
        {**data, "photos": [big]},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "10 МБ" in resp.json()["photos"][0]


@pytest.mark.django_db
def test_create_submission_happy_path_201_and_persists(client):
    brand = BrandFactory()
    data = _payload(brand)
    resp = client.post(
        "/api/public/v1/rating/submissions/",
        {**data, "photos": [_photo("a.png"), _photo("b.png")]},
        format="multipart",
        REMOTE_ADDR="10.0.0.42",
    )
    assert resp.status_code == 201
    sub = ACSubmission.objects.latest("created_at")
    assert sub.brand_id == brand.pk
    assert sub.ip_address == "10.0.0.42"
    assert SubmissionPhoto.objects.filter(submission=sub).count() == 2


@pytest.mark.django_db
def test_create_submission_consent_required(client):
    brand = BrandFactory()
    data = {**_payload(brand), "consent": False}
    resp = client.post(
        "/api/public/v1/rating/submissions/",
        {**data, "photos": [_photo("a.png")]},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "consent" in resp.json()


@pytest.mark.django_db
def test_create_submission_brand_or_custom_required(client):
    data = _payload(BrandFactory())
    data["brand"] = ""
    data["custom_brand_name"] = ""
    resp = client.post(
        "/api/public/v1/rating/submissions/",
        {**data, "photos": [_photo("a.png")]},
        format="multipart",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_submission_ratelimit_3_per_hour(client):
    brand = BrandFactory()
    data = _payload(brand)
    statuses = []
    for _ in range(4):
        resp = client.post(
            "/api/public/v1/rating/submissions/",
            {**data, "photos": [_photo("a.png")]},
            format="multipart",
            REMOTE_ADDR="192.168.77.7",
        )
        statuses.append(resp.status_code)
    # django-ratelimit (block=True) → Ratelimited → 403 (Django default).
    # См. комментарий в ac_reviews/tests/test_api.py.
    assert statuses[:3].count(201) == 3, f"первые 3 должны проходить, было {statuses}"
    assert statuses[3] == 403, f"4-й должен быть заблокирован (403), было {statuses[3]}"
