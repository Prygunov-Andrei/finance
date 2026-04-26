"""Тесты публичного API ac_reviews."""
from __future__ import annotations

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from ac_catalog.tests.factories import PublishedACModelFactory
from ac_reviews.models import Review
from ac_reviews.tests.factories import ReviewFactory


@pytest.fixture(autouse=True)
def _clear_cache():
    """django-ratelimit использует default cache; чистим, чтобы тесты не
    влияли друг на друга через переходящий счётчик."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def client():
    return APIClient()


@pytest.mark.django_db
def test_list_returns_only_approved(client):
    m = PublishedACModelFactory()
    ReviewFactory(model=m, status=Review.Status.APPROVED, author_name="Approved")
    ReviewFactory(model=m, status=Review.Status.PENDING, author_name="Pending")
    ReviewFactory(model=m, status=Review.Status.REJECTED, author_name="Rejected")

    resp = client.get(f"/api/public/v1/rating/models/{m.pk}/reviews/")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["author_name"] == "Approved"


@pytest.mark.django_db
def test_create_review_201_and_unapproved_with_ip(client):
    m = PublishedACModelFactory()
    payload = {
        "model": m.pk,
        "author_name": "Иван",
        "rating": 5,
        "pros": "Тихий",
        "cons": "",
        "comment": "ок",
    }
    resp = client.post(
        "/api/public/v1/rating/reviews/", payload, format="json",
        REMOTE_ADDR="10.0.0.1",
    )
    assert resp.status_code == 201
    review = Review.objects.latest("created_at")
    assert review.status == Review.Status.PENDING
    assert review.ip_address == "10.0.0.1"
    # Фронт получает status в ответе, чтобы показать «На модерации».
    assert resp.json()["status"] == "pending"


@pytest.mark.django_db
def test_create_review_honeypot_blocks_spam(client):
    m = PublishedACModelFactory()
    payload = {
        "model": m.pk,
        "author_name": "Bot",
        "rating": 5,
        "website": "http://spam.test",
    }
    resp = client.post("/api/public/v1/rating/reviews/", payload, format="json")
    assert resp.status_code == 400
    assert "website" in resp.json()


@pytest.mark.django_db
def test_create_review_ratelimit_5_per_hour(client):
    m = PublishedACModelFactory()
    payload = {"model": m.pk, "author_name": "A", "rating": 5}
    responses = []
    for _ in range(6):
        resp = client.post(
            "/api/public/v1/rating/reviews/", payload, format="json",
            REMOTE_ADDR="192.168.99.1",
        )
        responses.append(resp)
    statuses = [r.status_code for r in responses]
    # Первые 5 — 201; шестой ловится django-ratelimit (block=True) и
    # уезжает в наш RATELIMIT_VIEW (ac_catalog.ratelimit.ratelimited_view) —
    # 429 с JSON-detail.
    assert statuses[:5].count(201) == 5, f"первые 5 должны проходить, было {statuses}"
    assert statuses[5] == 429, f"6-й POST должен быть 429, было {statuses[5]}"
    body = responses[5].json()
    assert body["detail"].startswith("Слишком много")
    assert responses[5]["Retry-After"] == "60"
