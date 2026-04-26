"""Тесты админского API методики (/api/hvac/rating/criteria|methodologies/).

Ф8B-1: проверяем permissions, CRUD критериев (включая photo upload),
фильтры, methodologies_count, а также list/retrieve/activate методики.
"""
from __future__ import annotations

from io import BytesIO

import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from ac_methodology.models import Criterion, MethodologyVersion
from ac_methodology.tests.factories import (
    ActiveMethodologyVersionFactory,
    CriterionFactory,
    MethodologyCriterionFactory,
    MethodologyVersionFactory,
)
from personnel.models import Employee, default_erp_permissions


def _png_bytes(width: int = 8, height: int = 8) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (width, height), (200, 100, 50)).save(buf, format="PNG")
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
        username="meth_staff", password="x", is_staff=True,
    )
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def regular_client(db):
    user = User.objects.create_user(username="meth_reg", password="x")
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


# ── Permissions: Criterion ───────────────────────────────────────────────


@pytest.mark.django_db
def test_anonymous_criteria_list_401(anon_client):
    resp = anon_client.get("/api/hvac/rating/criteria/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_regular_user_criteria_list_403(regular_client):
    resp = regular_client.get("/api/hvac/rating/criteria/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_staff_criteria_list_200(staff_client):
    CriterionFactory(code="noise_min", name_ru="Шум мин")
    resp = staff_client.get("/api/hvac/rating/criteria/")
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    assert any(c["code"] == "noise_min" for c in items)


# ── Criterion CRUD ──────────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_criterion_minimal(staff_client):
    resp = staff_client.post(
        "/api/hvac/rating/criteria/",
        {
            "code": "noise_min",
            "name_ru": "Минимальный шум",
            "value_type": Criterion.ValueType.NUMERIC,
            "group": Criterion.Group.ACOUSTICS,
            "is_active": True,
        },
        format="json",
    )
    assert resp.status_code == 201, resp.json()
    assert Criterion.objects.filter(code="noise_min").exists()


@pytest.mark.django_db
def test_create_criterion_with_photo(staff_client, media_tmp):
    resp = staff_client.post(
        "/api/hvac/rating/criteria/",
        {
            "code": "warranty",
            "name_ru": "Гарантия",
            "value_type": Criterion.ValueType.NUMERIC,
            "group": Criterion.Group.OTHER,
            "is_active": "true",
            "photo": _png_upload("warranty.png"),
        },
        format="multipart",
    )
    assert resp.status_code == 201, resp.json()
    crit = Criterion.objects.get(code="warranty")
    assert crit.photo.name


@pytest.mark.django_db
def test_retrieve_criterion_returns_photo_url(staff_client, media_tmp):
    crit = CriterionFactory(code="energy_class")
    crit.photo.save("e.png", _png_upload("e.png"), save=True)

    resp = staff_client.get(f"/api/hvac/rating/criteria/{crit.id}/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["photo_url"].startswith("http")
    assert body["code"] == "energy_class"


@pytest.mark.django_db
def test_patch_criterion_is_key_measurement_false_to_true(staff_client):
    crit = CriterionFactory(code="warranty", is_key_measurement=False)
    resp = staff_client.patch(
        f"/api/hvac/rating/criteria/{crit.id}/",
        {"is_key_measurement": True},
        format="json",
    )
    assert resp.status_code == 200, resp.json()
    crit.refresh_from_db()
    assert crit.is_key_measurement is True


@pytest.mark.django_db
def test_patch_criterion_photo_via_multipart(staff_client, media_tmp):
    crit = CriterionFactory(code="noise_max")
    resp = staff_client.patch(
        f"/api/hvac/rating/criteria/{crit.id}/",
        {"photo": _png_upload("noise.png")},
        format="multipart",
    )
    assert resp.status_code == 200, resp.json()
    crit.refresh_from_db()
    assert crit.photo.name


@pytest.mark.django_db
def test_delete_criterion(staff_client):
    crit = CriterionFactory(code="to_delete")
    resp = staff_client.delete(f"/api/hvac/rating/criteria/{crit.id}/")
    assert resp.status_code == 204
    assert not Criterion.objects.filter(pk=crit.id).exists()


# ── Criterion filters & search ───────────────────────────────────────────


@pytest.mark.django_db
def test_filter_criterion_is_key_measurement(staff_client):
    CriterionFactory(code="key_one", is_key_measurement=True)
    CriterionFactory(code="not_key", is_key_measurement=False)

    resp = staff_client.get(
        "/api/hvac/rating/criteria/?is_key_measurement=true"
    )
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    codes = {c["code"] for c in items}
    assert "key_one" in codes
    assert "not_key" not in codes


@pytest.mark.django_db
def test_filter_criterion_value_type_and_group(staff_client):
    CriterionFactory(
        code="noise_min",
        value_type=Criterion.ValueType.NUMERIC,
        group=Criterion.Group.ACOUSTICS,
    )
    CriterionFactory(
        code="wifi",
        value_type=Criterion.ValueType.BINARY,
        group=Criterion.Group.CONTROL,
    )

    resp = staff_client.get(
        "/api/hvac/rating/criteria/?value_type=binary&group=control"
    )
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    codes = {c["code"] for c in items}
    assert codes == {"wifi"}


@pytest.mark.django_db
def test_search_criterion_by_code(staff_client):
    CriterionFactory(code="noise_min", name_ru="Минимальный шум")
    CriterionFactory(code="warranty", name_ru="Гарантия")

    resp = staff_client.get("/api/hvac/rating/criteria/?search=noise")
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    codes = {c["code"] for c in items}
    assert "noise_min" in codes
    assert "warranty" not in codes


@pytest.mark.django_db
def test_methodologies_count_via_annotate(staff_client):
    crit = CriterionFactory(code="warranty")
    m1 = MethodologyVersionFactory(version="2.0")
    MethodologyVersionFactory(version="2.1")  # без связи
    MethodologyCriterionFactory(methodology=m1, criterion=crit, weight=1.0)

    resp = staff_client.get(f"/api/hvac/rating/criteria/{crit.id}/")
    assert resp.status_code == 200
    # detail-сериализатор не отдаёт methodologies_count, проверяем через list
    list_resp = staff_client.get("/api/hvac/rating/criteria/")
    body = list_resp.json()
    items = body if isinstance(body, list) else body["results"]
    target = next(c for c in items if c["code"] == "warranty")
    assert target["methodologies_count"] == 1


# ── Permissions: Methodology ─────────────────────────────────────────────


@pytest.mark.django_db
def test_anonymous_methodologies_list_401(anon_client):
    resp = anon_client.get("/api/hvac/rating/methodologies/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_regular_user_methodologies_list_403(regular_client):
    resp = regular_client.get("/api/hvac/rating/methodologies/")
    assert resp.status_code == 403


# ── Methodology list / retrieve ──────────────────────────────────────────


@pytest.mark.django_db
def test_methodologies_list_returns_counters(staff_client):
    methodology = MethodologyVersionFactory(version="3.0", name="Mv3")
    crit_a = CriterionFactory(code="a")
    crit_b = CriterionFactory(code="b")
    MethodologyCriterionFactory(
        methodology=methodology, criterion=crit_a, weight=40.0,
    )
    MethodologyCriterionFactory(
        methodology=methodology, criterion=crit_b, weight=60.0,
    )

    resp = staff_client.get("/api/hvac/rating/methodologies/")
    assert resp.status_code == 200
    body = resp.json()
    items = body if isinstance(body, list) else body["results"]
    target = next(m for m in items if m["version"] == "3.0")
    assert target["criteria_count"] == 2
    assert pytest.approx(target["weight_sum"], rel=1e-3) == 100.0


@pytest.mark.django_db
def test_methodology_retrieve_returns_nested_criteria(staff_client):
    methodology = MethodologyVersionFactory(version="4.0")
    crit = CriterionFactory(code="warranty", name_ru="Гарантия")
    MethodologyCriterionFactory(
        methodology=methodology, criterion=crit, weight=15.0,
    )

    resp = staff_client.get(
        f"/api/hvac/rating/methodologies/{methodology.id}/"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["version"] == "4.0"
    assert len(body["methodology_criteria"]) == 1
    nested = body["methodology_criteria"][0]
    assert nested["weight"] == 15.0
    assert nested["criterion"]["code"] == "warranty"


# ── Methodology activate ────────────────────────────────────────────────


@pytest.mark.django_db
def test_activate_methodology_switches_active(staff_client):
    previous = ActiveMethodologyVersionFactory(version="5.0")
    target = MethodologyVersionFactory(version="5.1")

    resp = staff_client.post(
        f"/api/hvac/rating/methodologies/{target.id}/activate/"
    )
    assert resp.status_code == 200, resp.json()

    target.refresh_from_db()
    previous.refresh_from_db()
    assert target.is_active is True
    assert previous.is_active is False
    assert resp.json()["is_active"] is True


@pytest.mark.django_db
def test_activate_methodology_no_op_when_already_active(staff_client):
    active = ActiveMethodologyVersionFactory(version="6.0")
    resp = staff_client.post(
        f"/api/hvac/rating/methodologies/{active.id}/activate/"
    )
    assert resp.status_code == 200
    active.refresh_from_db()
    assert active.is_active is True
    # Других активных не появилось.
    assert MethodologyVersion.objects.filter(is_active=True).count() == 1


# ── Methodology: запрещённые методы ─────────────────────────────────────


@pytest.mark.django_db
def test_methodology_post_not_allowed(staff_client):
    resp = staff_client.post(
        "/api/hvac/rating/methodologies/",
        {"version": "9.9", "name": "X"},
        format="json",
    )
    assert resp.status_code == 405


@pytest.mark.django_db
def test_methodology_put_patch_delete_not_allowed(staff_client):
    methodology = MethodologyVersionFactory(version="7.0")
    base = f"/api/hvac/rating/methodologies/{methodology.id}/"

    assert staff_client.put(base, {"name": "X"}, format="json").status_code == 405
    assert staff_client.patch(base, {"name": "X"}, format="json").status_code == 405
    assert staff_client.delete(base).status_code == 405
