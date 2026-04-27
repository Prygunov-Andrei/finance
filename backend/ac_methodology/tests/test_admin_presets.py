"""Тесты админского API пресетов (/api/hvac/rating/presets/).

Ф8B-2: permissions, CRUD, фильтры, M2M-синхронизация criteria_ids,
маркер -1 для is_all_selected пресетов.
"""
from __future__ import annotations

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from ac_methodology.models import RatingPreset
from ac_methodology.tests.factories import (
    CriterionFactory,
    RatingPresetFactory,
)
from personnel.models import Employee, default_erp_permissions


@pytest.fixture
def anon_client():
    return APIClient()


@pytest.fixture
def staff_client(db):
    user = User.objects.create_user(
        username="preset_staff", password="x", is_staff=True,
    )
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def regular_client(db):
    user = User.objects.create_user(username="preset_reg", password="x")
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
def test_anonymous_presets_list_401(anon_client):
    resp = anon_client.get("/api/hvac/rating/presets/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_presets_list_no_pagination(staff_client):
    for i in range(25):
        RatingPresetFactory(slug=f"p_{i:02d}")
    resp = staff_client.get("/api/hvac/rating/presets/")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list), "Ожидается plain list (pagination_class=None)"
    assert len(body) >= 25


@pytest.mark.django_db
def test_regular_user_presets_list_403(regular_client):
    resp = regular_client.get("/api/hvac/rating/presets/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_staff_presets_list_200(staff_client):
    RatingPresetFactory(slug="custom-test", label="Custom")
    resp = staff_client.get("/api/hvac/rating/presets/")
    assert resp.status_code == 200
    items = _items(resp.json())
    assert any(p["slug"] == "custom-test" for p in items)


# ── CRUD ────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_preset_minimal(staff_client):
    resp = staff_client.post(
        "/api/hvac/rating/presets/",
        {
            "slug": "new-preset",
            "label": "Новый",
            "order": 7,
            "is_active": True,
            "is_all_selected": False,
        },
        format="json",
    )
    assert resp.status_code == 201, resp.json()
    p = RatingPreset.objects.get(slug="new-preset")
    assert p.label == "Новый"
    assert p.order == 7


@pytest.mark.django_db
def test_create_preset_with_criteria_ids_syncs_m2m(staff_client):
    c1 = CriterionFactory(code="c1")
    c2 = CriterionFactory(code="c2")
    resp = staff_client.post(
        "/api/hvac/rating/presets/",
        {
            "slug": "with-criteria",
            "label": "С критериями",
            "criteria_ids": [c1.id, c2.id],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.json()
    p = RatingPreset.objects.get(slug="with-criteria")
    assert set(p.criteria.values_list("id", flat=True)) == {c1.id, c2.id}


@pytest.mark.django_db
def test_retrieve_preset_returns_criteria_ids(staff_client):
    c1 = CriterionFactory(code="x1")
    c2 = CriterionFactory(code="x2")
    p = RatingPresetFactory(slug="rt", is_all_selected=False)
    p.criteria.set([c1, c2])

    resp = staff_client.get(f"/api/hvac/rating/presets/{p.id}/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["slug"] == "rt"
    assert set(body["criteria_ids"]) == {c1.id, c2.id}
    assert body["criteria_count"] == 2


@pytest.mark.django_db
def test_patch_preset_criteria_ids_replaces_m2m(staff_client):
    c1 = CriterionFactory(code="o1")
    c2 = CriterionFactory(code="o2")
    c3 = CriterionFactory(code="o3")
    p = RatingPresetFactory(slug="patch-p")
    p.criteria.set([c1, c2])

    resp = staff_client.patch(
        f"/api/hvac/rating/presets/{p.id}/",
        {"criteria_ids": [c3.id]},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    p.refresh_from_db()
    assert list(p.criteria.values_list("id", flat=True)) == [c3.id]


@pytest.mark.django_db
def test_patch_preset_criteria_ids_empty_clears_m2m(staff_client):
    c1 = CriterionFactory(code="e1")
    p = RatingPresetFactory(slug="clear-p")
    p.criteria.set([c1])

    resp = staff_client.patch(
        f"/api/hvac/rating/presets/{p.id}/",
        {"criteria_ids": []},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    p.refresh_from_db()
    assert p.criteria.count() == 0


@pytest.mark.django_db
def test_criteria_count_marker_minus_one_for_all_selected(staff_client):
    p = RatingPresetFactory(slug="all-sel", is_all_selected=True)
    resp = staff_client.get(f"/api/hvac/rating/presets/{p.id}/")
    assert resp.status_code == 200
    assert resp.json()["criteria_count"] == -1


@pytest.mark.django_db
def test_delete_preset(staff_client):
    p = RatingPresetFactory(slug="to-del")
    resp = staff_client.delete(f"/api/hvac/rating/presets/{p.id}/")
    assert resp.status_code == 204
    assert not RatingPreset.objects.filter(pk=p.id).exists()


# ── Filters & search ────────────────────────────────────────────────────


@pytest.mark.django_db
def test_filter_preset_is_active(staff_client):
    RatingPresetFactory(slug="filter-active", is_active=True)
    RatingPresetFactory(slug="filter-inactive", is_active=False)

    resp = staff_client.get("/api/hvac/rating/presets/?is_active=false")
    assert resp.status_code == 200
    slugs = {p["slug"] for p in _items(resp.json())}
    assert "filter-inactive" in slugs
    assert "filter-active" not in slugs


@pytest.mark.django_db
def test_filter_preset_is_all_selected(staff_client):
    RatingPresetFactory(slug="all-yes", is_all_selected=True)
    RatingPresetFactory(slug="all-no", is_all_selected=False)

    resp = staff_client.get("/api/hvac/rating/presets/?is_all_selected=true")
    assert resp.status_code == 200
    slugs = {p["slug"] for p in _items(resp.json())}
    assert "all-yes" in slugs
    assert "all-no" not in slugs


@pytest.mark.django_db
def test_search_preset_by_label(staff_client):
    RatingPresetFactory(slug="srch-1", label="Уникальная метка X")
    RatingPresetFactory(slug="srch-2", label="Другая")

    resp = staff_client.get("/api/hvac/rating/presets/?search=Уникальная")
    assert resp.status_code == 200
    slugs = {p["slug"] for p in _items(resp.json())}
    assert "srch-1" in slugs
    assert "srch-2" not in slugs
