"""Тесты admin endpoint'а FeaturedNewsSettings (singleton).

Endpoint смонтирован через news.urls (тот же паттерн, что и featured-news/):
- /api/v1/hvac/public/admin/featured-settings/
- /api/hvac/admin/featured-settings/

Permission — IsHvacAdminProxyAllowed (staff/superuser или employee
с ERP-permission marketing).
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from news.models import FeaturedNewsSettings, NewsCategory


User = get_user_model()

URL = "/api/v1/hvac/public/admin/featured-settings/"
URL_ALT = "/api/hvac/admin/featured-settings/"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        username="staff-feat",
        email="staff-feat@test.com",
        password="testpass123",
        is_staff=True,
    )


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        username="regular-feat",
        email="regular-feat@test.com",
        password="testpass123",
    )


@pytest.fixture
def categories(db):
    return {c.slug: c for c in NewsCategory.objects.all()}


@pytest.mark.django_db
def test_anonymous_gets_401(client):
    resp = client.get(URL)
    assert resp.status_code == 401


@pytest.mark.django_db
def test_regular_user_gets_403(client, regular_user):
    client.force_authenticate(user=regular_user)
    resp = client.get(URL)
    assert resp.status_code == 403


@pytest.mark.django_db
def test_staff_get_returns_current_settings(client, staff_user, categories):
    FeaturedNewsSettings.objects.update_or_create(
        pk=1, defaults={"category": categories["brands"]}
    )
    client.force_authenticate(user=staff_user)
    resp = client.get(URL)
    assert resp.status_code == 200
    body = resp.json()
    assert body["category"] == "brands"
    assert body["category_slug"] == "brands"
    assert body["category_name"] == categories["brands"].name
    assert "updated_at" in body


@pytest.mark.django_db
def test_staff_get_with_null_category(client, staff_user):
    FeaturedNewsSettings.objects.update_or_create(pk=1, defaults={"category": None})
    client.force_authenticate(user=staff_user)
    resp = client.get(URL)
    assert resp.status_code == 200
    body = resp.json()
    assert body["category"] is None
    assert body["category_slug"] is None
    assert body["category_name"] is None


@pytest.mark.django_db
def test_staff_patch_sets_category(client, staff_user, categories):
    FeaturedNewsSettings.objects.update_or_create(pk=1, defaults={"category": None})
    client.force_authenticate(user=staff_user)
    resp = client.patch(URL, {"category": "industry"}, format="json")
    assert resp.status_code == 200
    assert resp.json()["category"] == "industry"

    obj = FeaturedNewsSettings.objects.get(pk=1)
    assert obj.category_id == "industry"


@pytest.mark.django_db
def test_staff_patch_clears_category(client, staff_user, categories):
    FeaturedNewsSettings.objects.update_or_create(
        pk=1, defaults={"category": categories["brands"]}
    )
    client.force_authenticate(user=staff_user)
    resp = client.patch(URL, {"category": None}, format="json")
    assert resp.status_code == 200
    assert resp.json()["category"] is None

    obj = FeaturedNewsSettings.objects.get(pk=1)
    assert obj.category_id is None


@pytest.mark.django_db
def test_patch_invalid_slug_returns_400(client, staff_user):
    client.force_authenticate(user=staff_user)
    resp = client.patch(URL, {"category": "no-such-slug"}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_get_creates_singleton_when_missing(client, staff_user):
    FeaturedNewsSettings.objects.filter(pk=1).delete()
    assert not FeaturedNewsSettings.objects.exists()

    client.force_authenticate(user=staff_user)
    resp = client.get(URL)
    assert resp.status_code == 200
    assert FeaturedNewsSettings.objects.filter(pk=1).exists()


@pytest.mark.django_db
def test_alt_url_works(client, staff_user, categories):
    FeaturedNewsSettings.objects.update_or_create(
        pk=1, defaults={"category": categories["brands"]}
    )
    client.force_authenticate(user=staff_user)
    resp = client.get(URL_ALT)
    assert resp.status_code == 200
    assert resp.json()["category"] == "brands"


@pytest.mark.django_db
def test_delete_method_not_allowed(client, staff_user):
    client.force_authenticate(user=staff_user)
    resp = client.delete(URL)
    assert resp.status_code == 405
