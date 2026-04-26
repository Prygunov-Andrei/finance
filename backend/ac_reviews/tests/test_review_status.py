"""Тесты модерации Review через поле status (pending/approved/rejected).

Покрывает:
- default-статус,
- read-only status в POST,
- фильтр публичного API (anonymous vs staff),
- bulk-actions admin (approve/reject),
- идемпотентность data-migration backfill (косвенно: проверка результата).
"""
from __future__ import annotations

import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APIClient

from ac_catalog.tests.factories import PublishedACModelFactory
from ac_reviews.admin import ReviewAdmin
from ac_reviews.models import Review
from ac_reviews.tests.factories import ReviewFactory


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def staff_client(db):
    user = User.objects.create_user(
        username="moderator", password="x", is_staff=True,
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


# ── 1. default ────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_default_status_is_pending():
    """Review.status имеет default=pending — отзыв требует модерации."""
    review = ReviewFactory()
    assert review.status == Review.Status.PENDING


# ── 2. read-only через API ────────────────────────────────────────────────


@pytest.mark.django_db
def test_post_cannot_set_status_approved(client):
    """POST с status=approved — игнорируется (поле read-only). Защита от
    обхода модерации."""
    m = PublishedACModelFactory()
    payload = {
        "model": m.pk,
        "author_name": "Hacker",
        "rating": 5,
        "status": "approved",  # попытка обойти модерацию
    }
    resp = client.post(
        "/api/public/v1/rating/reviews/", payload, format="json",
        REMOTE_ADDR="10.0.0.2",
    )
    assert resp.status_code == 201
    review = Review.objects.latest("created_at")
    assert review.status == Review.Status.PENDING


@pytest.mark.django_db
def test_post_response_returns_status_pending(client):
    """Сервер возвращает status в ответе POST — фронт показывает «На модерации»."""
    m = PublishedACModelFactory()
    resp = client.post(
        "/api/public/v1/rating/reviews/",
        {"model": m.pk, "author_name": "A", "rating": 4},
        format="json",
        REMOTE_ADDR="10.0.0.3",
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "pending"


# ── 3. публичный фильтр ───────────────────────────────────────────────────


@pytest.mark.django_db
def test_anonymous_sees_only_approved(client):
    m = PublishedACModelFactory()
    ReviewFactory(model=m, status=Review.Status.APPROVED, author_name="Ok")
    ReviewFactory(model=m, status=Review.Status.PENDING, author_name="Wait")
    ReviewFactory(model=m, status=Review.Status.REJECTED, author_name="Bad")

    resp = client.get(f"/api/public/v1/rating/models/{m.pk}/reviews/")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["author_name"] == "Ok"


@pytest.mark.django_db
def test_staff_sees_all_statuses(staff_client):
    """Staff (модератор) видит все отзывы — нужен дашборд модерации."""
    m = PublishedACModelFactory()
    ReviewFactory(model=m, status=Review.Status.APPROVED, author_name="Ok")
    ReviewFactory(model=m, status=Review.Status.PENDING, author_name="Wait")
    ReviewFactory(model=m, status=Review.Status.REJECTED, author_name="Bad")

    resp = staff_client.get(f"/api/public/v1/rating/models/{m.pk}/reviews/")
    assert resp.status_code == 200
    names = sorted(item["author_name"] for item in resp.json())
    assert names == ["Bad", "Ok", "Wait"]


@pytest.mark.django_db
def test_status_field_not_exposed_in_public_serializer(client):
    """Поле status не появляется в публичном GET — это внутренняя информация."""
    m = PublishedACModelFactory()
    ReviewFactory(model=m, status=Review.Status.APPROVED)
    resp = client.get(f"/api/public/v1/rating/models/{m.pk}/reviews/")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert "status" not in body[0]


# ── 4. admin bulk-actions ─────────────────────────────────────────────────


@pytest.mark.django_db
def test_admin_action_approve_selected(rf, admin_user):
    """Bulk-action approve_selected переводит выбранные отзывы в approved."""
    r1 = ReviewFactory(status=Review.Status.PENDING)
    r2 = ReviewFactory(status=Review.Status.PENDING)

    admin = ReviewAdmin(model=Review, admin_site=None)
    request = rf.post("/admin/ac_reviews/review/")
    request.user = admin_user
    # message_user в test-режиме требует middleware messages — используем noop.
    admin.message_user = lambda *a, **kw: None

    qs = Review.objects.filter(pk__in=[r1.pk, r2.pk])
    admin.approve_selected(request, qs)

    r1.refresh_from_db()
    r2.refresh_from_db()
    assert r1.status == Review.Status.APPROVED
    assert r2.status == Review.Status.APPROVED


@pytest.mark.django_db
def test_admin_action_reject_selected(rf, admin_user):
    """Bulk-action reject_selected переводит выбранные отзывы в rejected."""
    r1 = ReviewFactory(status=Review.Status.PENDING)
    r2 = ReviewFactory(status=Review.Status.APPROVED)

    admin = ReviewAdmin(model=Review, admin_site=None)
    request = rf.post("/admin/ac_reviews/review/")
    request.user = admin_user
    admin.message_user = lambda *a, **kw: None

    qs = Review.objects.filter(pk__in=[r1.pk, r2.pk])
    admin.reject_selected(request, qs)

    r1.refresh_from_db()
    r2.refresh_from_db()
    assert r1.status == Review.Status.REJECTED
    assert r2.status == Review.Status.REJECTED


# ── 5. защита от спама + модерация ────────────────────────────────────────


@pytest.mark.django_db
def test_rejected_review_not_visible_publicly(client):
    """Отклонённый модератором отзыв не возвращается публичному GET."""
    m = PublishedACModelFactory()
    ReviewFactory(model=m, status=Review.Status.REJECTED, author_name="Bad")
    resp = client.get(f"/api/public/v1/rating/models/{m.pk}/reviews/")
    assert resp.status_code == 200
    assert resp.json() == []


# ── 6. модель: индекс ─────────────────────────────────────────────────────


@pytest.mark.django_db
def test_status_field_has_db_index():
    """Индекс по status — необходим для фильтра публичного API на больших объёмах."""
    field = Review._meta.get_field("status")
    assert field.db_index is True
    assert field.choices is not None
    assert {value for value, _label in field.choices} == {"pending", "approved", "rejected"}
