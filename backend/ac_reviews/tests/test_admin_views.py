"""Тесты админского API модерации отзывов (/api/hvac/rating/reviews/).

Ф8B-2: permissions, list/retrieve/PATCH (только status), DELETE,
запрещённые методы (POST/PUT), bulk-update.
"""
from __future__ import annotations

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from ac_brands.tests.factories import BrandFactory
from ac_catalog.tests.factories import ACModelFactory
from ac_reviews.models import Review
from ac_reviews.tests.factories import ReviewFactory
from personnel.models import Employee, default_erp_permissions


@pytest.fixture
def anon_client():
    return APIClient()


@pytest.fixture
def staff_client(db):
    user = User.objects.create_user(
        username="rev_staff", password="x", is_staff=True,
    )
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def regular_client(db):
    user = User.objects.create_user(username="rev_reg", password="x")
    Employee.objects.create(
        full_name="Reg", user=user, erp_permissions=default_erp_permissions(),
    )
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


def _items(body):
    return body if isinstance(body, list) else body["results"]


# ── Permissions ──────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_anonymous_reviews_list_401(anon_client):
    resp = anon_client.get("/api/hvac/rating/reviews/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_regular_user_reviews_list_403(regular_client):
    resp = regular_client.get("/api/hvac/rating/reviews/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_staff_reviews_list_200(staff_client):
    ReviewFactory()
    resp = staff_client.get("/api/hvac/rating/reviews/")
    assert resp.status_code == 200
    assert len(_items(resp.json())) >= 1


# ── Денормализация ──────────────────────────────────────────────────────


@pytest.mark.django_db
def test_list_returns_denormalized_model_fields(staff_client):
    brand = BrandFactory(name="MyBrand")
    ac = ACModelFactory(brand=brand, inner_unit="ABC-12", slug="abc-12")
    ReviewFactory(model=ac, author_name="Иван")

    resp = staff_client.get("/api/hvac/rating/reviews/")
    assert resp.status_code == 200
    items = _items(resp.json())
    target = next(r for r in items if r["author_name"] == "Иван")
    assert target["model_brand"] == "MyBrand"
    assert target["model_inner_unit"] == "ABC-12"
    assert target["model_slug"] == "abc-12"


# ── Filters ─────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_filter_status_pending(staff_client):
    ReviewFactory(status=Review.Status.PENDING, author_name="P-only")
    ReviewFactory(status=Review.Status.APPROVED, author_name="A-only")

    resp = staff_client.get("/api/hvac/rating/reviews/?status=pending")
    assert resp.status_code == 200
    names = {r["author_name"] for r in _items(resp.json())}
    assert "P-only" in names
    assert "A-only" not in names


@pytest.mark.django_db
def test_filter_by_model(staff_client):
    ac1 = ACModelFactory(inner_unit="m-1")
    ac2 = ACModelFactory(inner_unit="m-2")
    ReviewFactory(model=ac1, author_name="for-1")
    ReviewFactory(model=ac2, author_name="for-2")

    resp = staff_client.get(f"/api/hvac/rating/reviews/?model={ac1.id}")
    assert resp.status_code == 200
    names = {r["author_name"] for r in _items(resp.json())}
    assert names == {"for-1"}


@pytest.mark.django_db
def test_search_by_comment(staff_client):
    ReviewFactory(comment="Уникальный текст комментария", author_name="srch-yes")
    ReviewFactory(comment="другое", author_name="srch-no")

    resp = staff_client.get("/api/hvac/rating/reviews/?search=Уникальный")
    assert resp.status_code == 200
    names = {r["author_name"] for r in _items(resp.json())}
    assert "srch-yes" in names
    assert "srch-no" not in names


# ── PATCH / DELETE ──────────────────────────────────────────────────────


@pytest.mark.django_db
def test_patch_status_to_approved(staff_client):
    r = ReviewFactory(status=Review.Status.PENDING)
    resp = staff_client.patch(
        f"/api/hvac/rating/reviews/{r.id}/",
        {"status": Review.Status.APPROVED},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    r.refresh_from_db()
    assert r.status == Review.Status.APPROVED


@pytest.mark.django_db
def test_patch_pros_is_readonly(staff_client):
    r = ReviewFactory(pros="оригинал", rating=4)
    resp = staff_client.patch(
        f"/api/hvac/rating/reviews/{r.id}/",
        {"pros": "взлом", "rating": 1},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    r.refresh_from_db()
    assert r.pros == "оригинал"
    assert r.rating == 4


@pytest.mark.django_db
def test_post_not_allowed(staff_client):
    ac = ACModelFactory()
    resp = staff_client.post(
        "/api/hvac/rating/reviews/",
        {
            "model": ac.id,
            "author_name": "x",
            "rating": 5,
            "status": Review.Status.APPROVED,
        },
        format="json",
    )
    assert resp.status_code == 405


@pytest.mark.django_db
def test_put_not_allowed(staff_client):
    r = ReviewFactory()
    resp = staff_client.put(
        f"/api/hvac/rating/reviews/{r.id}/",
        {"status": Review.Status.APPROVED},
        format="json",
    )
    assert resp.status_code == 405


@pytest.mark.django_db
def test_delete_review(staff_client):
    r = ReviewFactory()
    resp = staff_client.delete(f"/api/hvac/rating/reviews/{r.id}/")
    assert resp.status_code == 204
    assert not Review.objects.filter(pk=r.id).exists()


# ── Bulk update ─────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_bulk_update_happy_path(staff_client):
    r1 = ReviewFactory(status=Review.Status.PENDING)
    r2 = ReviewFactory(status=Review.Status.PENDING)
    r3 = ReviewFactory(status=Review.Status.PENDING)

    resp = staff_client.post(
        "/api/hvac/rating/reviews/bulk-update/",
        {"review_ids": [r1.id, r2.id, r3.id], "status": "approved"},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["updated"] == 3
    assert body["errors"] == []
    for r in (r1, r2, r3):
        r.refresh_from_db()
        assert r.status == Review.Status.APPROVED


@pytest.mark.django_db
def test_bulk_update_invalid_status_400(staff_client):
    r = ReviewFactory()
    resp = staff_client.post(
        "/api/hvac/rating/reviews/bulk-update/",
        {"review_ids": [r.id], "status": "garbage"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_bulk_update_invalid_review_ids_not_list_400(staff_client):
    resp = staff_client.post(
        "/api/hvac/rating/reviews/bulk-update/",
        {"review_ids": "1,2,3", "status": "approved"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_bulk_update_review_ids_with_strings_400(staff_client):
    resp = staff_client.post(
        "/api/hvac/rating/reviews/bulk-update/",
        {"review_ids": ["1", "2"], "status": "approved"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_bulk_update_anonymous_401(anon_client):
    resp = anon_client.post(
        "/api/hvac/rating/reviews/bulk-update/",
        {"review_ids": [1], "status": "approved"},
        format="json",
    )
    assert resp.status_code == 401


@pytest.mark.django_db
def test_bulk_update_regular_user_403(regular_client):
    resp = regular_client.post(
        "/api/hvac/rating/reviews/bulk-update/",
        {"review_ids": [1], "status": "approved"},
        format="json",
    )
    assert resp.status_code == 403
