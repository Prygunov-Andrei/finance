"""Тесты публичного API ac_catalog (/api/public/v1/rating/...)."""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from ac_brands.tests.factories import BrandFactory
from ac_catalog.models import ACModel, ModelRegion
from ac_catalog.tests.factories import (
    ACModelFactory,
    ArchivedACModelFactory,
    ModelRegionFactory,
    PublishedACModelFactory,
)
from ac_methodology.models import Criterion, MethodologyCriterion
from ac_methodology.tests.factories import (
    ActiveMethodologyVersionFactory,
    CriterionFactory,
)


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def methodology(db):
    mv = ActiveMethodologyVersionFactory(version="api-1", name="API-test")
    return mv


@pytest.fixture
def methodology_with_noise(methodology):
    crit = CriterionFactory(
        code="noise", name_ru="Шум", value_type=Criterion.ValueType.NUMERIC,
    )
    MethodologyCriterion.objects.create(
        methodology=methodology, criterion=crit,
        scoring_type=MethodologyCriterion.ScoringType.MIN_MEDIAN_MAX,
        weight=100, min_value=20, median_value=30, max_value=40,
        is_inverted=True, display_order=1,
    )
    return methodology


# ── List ───────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_list_returns_only_published(client, methodology):
    PublishedACModelFactory(brand=BrandFactory(name="A"))
    PublishedACModelFactory(brand=BrandFactory(name="B"))
    ACModelFactory(brand=BrandFactory(name="DraftBrand"))  # DRAFT — не должен попасть
    ArchivedACModelFactory(brand=BrandFactory(name="ArchivedBrand"))

    resp = client.get("/api/public/v1/rating/models/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2


@pytest.mark.django_db
def test_list_unauthenticated_no_401(client):
    """Публичный API не требует JWT — глобальный IsAuthenticated должен быть перекрыт."""
    resp = client.get("/api/public/v1/rating/models/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_list_filter_by_brand(client, methodology):
    PublishedACModelFactory(brand=BrandFactory(name="Daikin"))
    PublishedACModelFactory(brand=BrandFactory(name="Mitsubishi"))

    resp = client.get("/api/public/v1/rating/models/?brand=Daik")
    assert resp.status_code == 200
    items = resp.json()["results"]
    assert len(items) == 1
    assert items[0]["brand"] == "Daikin"


@pytest.mark.django_db
def test_list_filter_by_region(client, methodology):
    m_ru = PublishedACModelFactory(brand=BrandFactory(name="RU"))
    ModelRegionFactory(model=m_ru, region_code=ModelRegion.RegionCode.RU)
    m_eu = PublishedACModelFactory(brand=BrandFactory(name="EU"))
    ModelRegionFactory(model=m_eu, region_code=ModelRegion.RegionCode.EU)

    resp = client.get("/api/public/v1/rating/models/?region=ru")
    assert resp.status_code == 200
    items = resp.json()["results"]
    assert len(items) == 1
    assert items[0]["brand"] == "RU"


@pytest.mark.django_db
def test_list_filter_by_capacity_range(client, methodology):
    PublishedACModelFactory(brand=BrandFactory(name="Low"), nominal_capacity=2000)
    PublishedACModelFactory(brand=BrandFactory(name="Mid"), nominal_capacity=3000)
    PublishedACModelFactory(brand=BrandFactory(name="High"), nominal_capacity=5000)

    resp = client.get("/api/public/v1/rating/models/?capacity_min=2500&capacity_max=4000")
    assert resp.status_code == 200
    items = resp.json()["results"]
    assert len(items) == 1
    assert items[0]["brand"] == "Mid"


@pytest.mark.django_db
def test_list_filter_by_price_range(client, methodology):
    PublishedACModelFactory(brand=BrandFactory(name="Cheap"), price="10000")
    PublishedACModelFactory(brand=BrandFactory(name="Mid"), price="30000")
    PublishedACModelFactory(brand=BrandFactory(name="Expensive"), price="100000")

    resp = client.get("/api/public/v1/rating/models/?price_min=20000&price_max=50000")
    assert resp.status_code == 200
    items = resp.json()["results"]
    assert len(items) == 1
    assert items[0]["brand"] == "Mid"


@pytest.mark.django_db
def test_list_invalid_capacity_param_returns_400(client, methodology):
    resp = client.get("/api/public/v1/rating/models/?capacity_min=abc")
    assert resp.status_code == 400


# ── Detail ─────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_detail_by_pk(client, methodology):
    m = PublishedACModelFactory()
    resp = client.get(f"/api/public/v1/rating/models/{m.pk}/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == m.pk
    assert body["slug"] == m.slug


@pytest.mark.django_db
def test_detail_pk_not_found(client):
    resp = client.get("/api/public/v1/rating/models/999999/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_detail_by_slug(client, methodology):
    brand = BrandFactory(name="Daikin")
    m = PublishedACModelFactory(brand=brand, series="Comfort", inner_unit="x1", outer_unit="y1")
    resp = client.get(f"/api/public/v1/rating/models/by-slug/{m.slug}/")
    assert resp.status_code == 200
    assert resp.json()["id"] == m.pk


# ── Archive ────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_archive_returns_only_archived(client, methodology):
    PublishedACModelFactory(brand=BrandFactory(name="Pub"))
    ArchivedACModelFactory(brand=BrandFactory(name="Old1"))
    ArchivedACModelFactory(brand=BrandFactory(name="Old2"))

    resp = client.get("/api/public/v1/rating/models/archive/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2


# ── Methodology ────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_methodology_returns_active(client, methodology_with_noise):
    resp = client.get("/api/public/v1/rating/methodology/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_active"] is True
    assert body["version"] == methodology_with_noise.version
    assert len(body["criteria"]) == 1
    assert body["criteria"][0]["code"] == "noise"


@pytest.mark.django_db
def test_methodology_404_when_no_active(client, db):
    """Без активной методики — 404 (NotFound из MethodologyView)."""
    resp = client.get("/api/public/v1/rating/methodology/")
    assert resp.status_code == 404


# ── Export CSV ─────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_export_csv_returns_csv_content_type(client, db):
    PublishedACModelFactory(brand=BrandFactory(name="ExportBrand"))
    resp = client.get("/api/public/v1/rating/export/csv/")
    assert resp.status_code == 200
    assert resp["Content-Type"].startswith("text/csv")
    assert "attachment" in resp["Content-Disposition"]
    body = resp.content.decode()
    assert "brand,model" in body  # заголовок
    assert "ExportBrand" in body


@pytest.mark.django_db
def test_export_csv_empty_db_returns_header_only(client, db):
    resp = client.get("/api/public/v1/rating/export/csv/")
    assert resp.status_code == 200
    assert resp.content.decode().strip() == "brand,model,nominal_capacity,total_index,publish_status"
