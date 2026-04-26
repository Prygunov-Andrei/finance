"""Smoke-тесты Django admin для всех ac_* моделей.

Проверяем что страницы рендерятся (200) — основные классы ошибок:
неправильный импорт, опечатка в readonly_fields, невалидный template path.

После Ф8D `/admin/` урезан до whitelist (методика + auth + LogEntry).
Полный admin доступен по `/hvac-admin/` (backup-доступ). Smoke-тесты для
моделей вне whitelist (catalog, brands, reviews, submissions, scoring)
теперь бьют по `/hvac-admin/`.
"""
from __future__ import annotations

import pytest
from django.contrib.auth.models import User
from django.test import Client

from ac_brands.tests.factories import BrandFactory
from ac_catalog.tests.factories import PublishedACModelFactory
from ac_methodology.tests.factories import (
    ActiveMethodologyVersionFactory,
    CriterionFactory,
)
from ac_reviews.tests.factories import ReviewFactory
from ac_scoring.tests.factories import CalculationRunFactory
from ac_submissions.tests.factories import ACSubmissionFactory


@pytest.fixture
def admin_client(db):
    user = User.objects.create_superuser(
        username="acadmin", password="x", email="ac@test.local",
    )
    client = Client()
    client.force_login(user)
    return client


# ── ac_catalog: ACModel ───────────────────────────────────────────────


@pytest.mark.django_db
def test_ac_model_changelist_renders(admin_client):
    PublishedACModelFactory()
    resp = admin_client.get("/hvac-admin/ac_catalog/acmodel/")
    assert resp.status_code == 200
    body = resp.content.decode()
    # Кнопка импорта из кастомного change_list_template
    assert "Импорт моделей" in body


@pytest.mark.django_db
def test_ac_model_add_renders(admin_client):
    resp = admin_client.get("/hvac-admin/ac_catalog/acmodel/add/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_ac_model_change_renders(admin_client):
    m = PublishedACModelFactory()
    resp = admin_client.get(f"/hvac-admin/ac_catalog/acmodel/{m.pk}/change/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_ac_model_import_view_renders(admin_client):
    resp = admin_client.get("/hvac-admin/ac_catalog/acmodel/import-models/")
    assert resp.status_code == 200
    assert "Импорт моделей" in resp.content.decode()


@pytest.mark.django_db
def test_ac_model_import_template_xlsx_no_active_methodology_redirects(admin_client):
    """Без активной методики download endpoint редиректит с warning-сообщением."""
    resp = admin_client.get("/hvac-admin/ac_catalog/acmodel/import-template-xlsx/")
    assert resp.status_code == 302
    assert resp.url.endswith("/ac_catalog/acmodel/")


@pytest.mark.django_db
def test_ac_model_import_template_xlsx_with_active_returns_xlsx(admin_client):
    ActiveMethodologyVersionFactory(version="adm-tpl")
    resp = admin_client.get("/hvac-admin/ac_catalog/acmodel/import-template-xlsx/")
    assert resp.status_code == 200
    assert resp["Content-Type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@pytest.mark.django_db
def test_equipment_type_changelist(admin_client):
    resp = admin_client.get("/hvac-admin/ac_catalog/equipmenttype/")
    assert resp.status_code == 200


# ── ac_brands ─────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_brand_changelist(admin_client):
    BrandFactory(name="Daikin")
    resp = admin_client.get("/hvac-admin/ac_brands/brand/")
    assert resp.status_code == 200
    assert "Daikin" in resp.content.decode()


@pytest.mark.django_db
def test_brand_origin_class_changelist(admin_client):
    resp = admin_client.get("/hvac-admin/ac_brands/brandoriginclass/")
    assert resp.status_code == 200


# ── ac_methodology ────────────────────────────────────────────────────
# Методика в whitelist — остаётся в /admin/.


@pytest.mark.django_db
def test_methodology_version_changelist(admin_client):
    ActiveMethodologyVersionFactory(version="adm-1")
    resp = admin_client.get("/admin/ac_methodology/methodologyversion/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_methodology_version_change_with_duplicate_button(admin_client):
    mv = ActiveMethodologyVersionFactory(version="adm-2")
    resp = admin_client.get(f"/admin/ac_methodology/methodologyversion/{mv.pk}/change/")
    assert resp.status_code == 200
    body = resp.content.decode()
    # Кастомный change_form вешает «Дублировать как новую версию»
    assert "Дублировать как новую версию" in body


@pytest.mark.django_db
def test_methodology_version_duplicate_form_renders(admin_client):
    mv = ActiveMethodologyVersionFactory(version="adm-3")
    resp = admin_client.get(f"/admin/ac_methodology/methodologyversion/{mv.pk}/duplicate/")
    assert resp.status_code == 200
    assert "Дублировать версию методики" in resp.content.decode()


@pytest.mark.django_db
def test_criterion_changelist(admin_client):
    CriterionFactory(code="adm_crit")
    resp = admin_client.get("/admin/ac_methodology/criterion/")
    assert resp.status_code == 200


# ── ac_reviews ────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_review_changelist(admin_client):
    ReviewFactory()
    resp = admin_client.get("/hvac-admin/ac_reviews/review/")
    assert resp.status_code == 200


# ── ac_submissions ────────────────────────────────────────────────────


@pytest.mark.django_db
def test_submission_changelist(admin_client):
    ACSubmissionFactory()
    resp = admin_client.get("/hvac-admin/ac_submissions/acsubmission/")
    assert resp.status_code == 200


# ── ac_scoring ────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_calculation_run_changelist(admin_client):
    CalculationRunFactory()
    resp = admin_client.get("/hvac-admin/ac_scoring/calculationrun/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_hvac_admin_index_lists_non_methodology_ac_apps(admin_client):
    """Полный backup-admin (`/hvac-admin/`) показывает 5 ac_* apps без методики.

    `ac_methodology` после Ф8D зарегистрирован ТОЛЬКО в ac_admin_site
    (whitelist /admin/), поэтому в /hvac-admin/ его нет — это by design.
    """
    resp = admin_client.get("/hvac-admin/")
    assert resp.status_code == 200
    body = resp.content.decode().lower()
    for label in (
        "ac_brands", "ac_catalog",
        "ac_reviews", "ac_scoring", "ac_submissions",
    ):
        assert label.replace("_", "-").lower() in body or label in body, (
            f"app {label} не виден в /hvac-admin/"
        )


@pytest.mark.django_db
def test_admin_index_lists_methodology_only(admin_client):
    """Урезанный `/admin/` показывает методику и не показывает остальные ac_*."""
    resp = admin_client.get("/admin/")
    assert resp.status_code == 200
    body = resp.content.decode().lower()
    assert "ac_methodology" in body or "ac-methodology" in body
    for hidden in ("ac_brands", "ac_catalog", "ac_reviews", "ac_scoring", "ac_submissions"):
        assert hidden not in body, f"{hidden} не должен быть в /admin/"
