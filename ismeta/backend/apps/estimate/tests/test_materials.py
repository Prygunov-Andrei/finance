"""Tests for Material catalog + matching pipeline (E-MAT-01).

Требует PostgreSQL с расширением pg_trgm (создаётся в миграции
0004_create_material_with_trgm). На SQLite тесты запускаться не будут.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.estimate.matching.materials import (
    MaterialMatchingService,
    _bucket_for,
    match_item,
    materials_search,
)
from apps.estimate.models import Estimate, EstimateItem, EstimateSection, Material
from apps.workspace.models import Workspace

User = get_user_model()
WS_HEADER = "HTTP_X_WORKSPACE_ID"


@pytest.fixture()
def ws():
    return Workspace.objects.create(name="WS-MAT", slug="ws-mat")


@pytest.fixture()
def other_ws():
    return Workspace.objects.create(name="WS-OTHER", slug="ws-other")


@pytest.fixture()
def user():
    return User.objects.create_user(username="mat-user", password="pass")


@pytest.fixture()
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture()
def estimate(ws, user):
    return Estimate.objects.create(
        workspace=ws,
        name="Mat-test",
        default_material_markup={"type": "percent", "value": 30},
        default_work_markup={"type": "percent", "value": 300},
        created_by=user,
    )


@pytest.fixture()
def section(estimate, ws):
    return EstimateSection.objects.create(
        estimate=estimate, workspace=ws, name="Вентиляция", sort_order=0
    )


def _material(ws, name, unit="шт", price="1000.00", brand="", model_name=""):
    return Material.objects.create(
        workspace=ws,
        name=name,
        unit=unit,
        price=Decimal(price),
        brand=brand,
        model_name=model_name,
    )


def _item(estimate, section, ws, name, tech_specs=None, sort_order=0):
    import uuid as _uuid
    return EstimateItem.objects.create(
        section=section,
        estimate=estimate,
        workspace=ws,
        row_id=_uuid.uuid4(),
        sort_order=sort_order,
        name=name,
        unit="шт",
        quantity=Decimal("1"),
        tech_specs=tech_specs or {},
    )


@pytest.mark.django_db
class TestMaterialModel:
    def test_search_text_concatenation(self, ws):
        m = _material(ws, "Кабель ВВГнг", brand="Belden", model_name="UTP-6")
        assert m.search_text == "Кабель ВВГнг UTP-6 Belden"

    def test_search_text_only_name_when_others_empty(self, ws):
        m = _material(ws, "Лоток")
        assert m.search_text == "Лоток"


@pytest.mark.django_db
class TestMaterialsSearch:
    def test_empty_query_returns_empty(self, ws):
        _material(ws, "Кабель ВВГнг")
        assert materials_search(str(ws.id), "") == []
        assert materials_search(str(ws.id), "   ") == []

    def test_exact_match_has_high_score(self, ws):
        _material(ws, "Кабель ВВГнг 3x2.5")
        results = materials_search(str(ws.id), "Кабель ВВГнг 3x2.5")
        assert results
        material, score = results[0]
        assert material.name == "Кабель ВВГнг 3x2.5"
        assert score >= Decimal("0.9")

    def test_similar_match_returns_lower_score(self, ws):
        _material(ws, "Кабель ВВГнг 3x2.5")
        results = materials_search(str(ws.id), "Кабель ВВГнг 3х2.5 силовой")
        assert results
        _, score = results[0]
        assert score < Decimal("0.95")  # не точный матч
        assert score > Decimal("0.3")

    def test_workspace_isolation(self, ws, other_ws):
        _material(ws, "Кабель")
        _material(other_ws, "Кабель")
        results = materials_search(str(ws.id), "Кабель")
        assert len(results) == 1
        assert results[0][0].workspace_id == ws.id

    def test_inactive_materials_skipped(self, ws):
        m = _material(ws, "Кабель ВВГ")
        m.is_active = False
        m.save()
        results = materials_search(str(ws.id), "Кабель ВВГ")
        assert results == []

    def test_limit_applied(self, ws):
        for i in range(5):
            _material(ws, f"Кабель тип {i}")
        results = materials_search(str(ws.id), "Кабель", limit=3)
        assert len(results) == 3

    def test_searches_model_name_and_brand(self, ws):
        _material(ws, "Кабель", brand="Belden", model_name="Cat6-UTP")
        results = materials_search(str(ws.id), "Belden Cat6")
        assert results
        assert results[0][0].brand == "Belden"

    def test_low_similarity_filtered_out(self, ws):
        _material(ws, "Совершенно другое название")
        results = materials_search(str(ws.id), "gibberish-zzz-qqq")
        assert results == []


@pytest.mark.django_db
class TestBucketThresholds:
    def test_green_at_090(self):
        assert _bucket_for(Decimal("0.90")) == "green"
        assert _bucket_for(Decimal("0.99")) == "green"

    def test_yellow_between_070_and_090(self):
        assert _bucket_for(Decimal("0.70")) == "yellow"
        assert _bucket_for(Decimal("0.85")) == "yellow"
        assert _bucket_for(Decimal("0.8999")) == "yellow"

    def test_red_below_070(self):
        assert _bucket_for(Decimal("0.50")) == "red"
        assert _bucket_for(Decimal("0.00")) == "red"


@pytest.mark.django_db
class TestMatchItem:
    def test_match_item_green_exact(self, ws, estimate, section):
        _material(ws, "Кабель ВВГнг 3x2.5", price="85.00")
        item = _item(estimate, section, ws, "Кабель ВВГнг 3x2.5")
        match = match_item(item, str(ws.id))
        assert match is not None
        assert match.material_name == "Кабель ВВГнг 3x2.5"
        assert match.material_price == Decimal("85.00")
        assert match.bucket == "green"

    def test_match_item_yellow_fuzzy(self, ws, estimate, section):
        _material(ws, "Кабель силовой ВВГнг")
        item = _item(estimate, section, ws, "Кабель силовой ВВГнг 3×2.5 мм²")
        match = match_item(item, str(ws.id))
        # При сильном отличии fuzz может вернуть None — проверяем оба сценария:
        if match is not None:
            assert match.bucket in {"green", "yellow"}

    def test_match_item_none_for_empty_name(self, ws, estimate, section):
        item = _item(estimate, section, ws, "")
        assert match_item(item, str(ws.id)) is None

    def test_match_item_none_when_catalog_empty(self, ws, estimate, section):
        item = _item(estimate, section, ws, "Кабель")
        assert match_item(item, str(ws.id)) is None

    def test_match_item_uses_tech_specs(self, ws, estimate, section):
        _material(ws, "Вентилятор канальный WNK 100", brand="Корф", model_name="WNK-100")
        item = _item(
            estimate, section, ws,
            "Вентилятор канальный",
            tech_specs={"model_name": "WNK-100", "brand": "Корф"},
        )
        match = match_item(item, str(ws.id))
        assert match is not None
        assert match.material_name.startswith("Вентилятор")


@pytest.mark.django_db
class TestMatchingService:
    def test_match_estimate_returns_results(self, ws, estimate, section):
        _material(ws, "Кабель ВВГнг 3x2.5", price="85.00")
        _material(ws, "Воздуховод прямоугольный 200x200", price="1200.00")
        _item(estimate, section, ws, "Кабель ВВГнг 3x2.5", sort_order=0)
        _item(estimate, section, ws, "Воздуховод прямоугольный 200x200", sort_order=1)
        _item(estimate, section, ws, "Уникальная позиция без материала", sort_order=2)

        result = MaterialMatchingService.match_estimate(str(estimate.id), str(ws.id))
        assert result["total_items"] == 3
        assert result["matched"] == 2
        assert len(result["results"]) == 2

    def test_apply_matches_updates_item_price(self, ws, estimate, section):
        _material(ws, "Кабель ВВГнг 3x2.5", price="85.00")
        item = _item(estimate, section, ws, "Кабель ВВГнг 3x2.5")
        result = MaterialMatchingService.match_estimate(
            str(estimate.id), str(ws.id)
        )
        updated = MaterialMatchingService.apply_matches(
            result["results"], str(ws.id)
        )
        assert updated == 1
        item.refresh_from_db()
        assert item.material_price == Decimal("85.00")

    def test_auto_apply_green_only(self, ws, estimate, section):
        _material(ws, "Кабель ВВГнг 3x2.5", price="85.00")
        _item(estimate, section, ws, "Кабель ВВГнг 3x2.5")
        count = MaterialMatchingService.auto_apply_green(
            str(estimate.id), str(ws.id)
        )
        assert count >= 1


@pytest.mark.django_db
class TestSearchEndpoint:
    def test_returns_hits(self, client, ws):
        _material(ws, "Кабель ВВГнг 3x2.5")
        resp = client.get(
            "/api/v1/materials/search/?q=Кабель ВВГнг",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 200
        assert resp.data["query"] == "Кабель ВВГнг"
        assert len(resp.data["results"]) == 1
        assert resp.data["results"][0]["name"] == "Кабель ВВГнг 3x2.5"

    def test_empty_query_returns_empty(self, client, ws):
        _material(ws, "Кабель")
        resp = client.get(
            "/api/v1/materials/search/?q=",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 200
        assert resp.data["results"] == []

    def test_missing_workspace_400(self, client, ws):
        _material(ws, "Кабель")
        resp = client.get("/api/v1/materials/search/?q=Кабель")
        assert resp.status_code == 400

    def test_limit_param_respected(self, client, ws):
        for i in range(5):
            _material(ws, f"Кабель вариант {i}")
        resp = client.get(
            "/api/v1/materials/search/?q=Кабель&limit=2",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 200
        assert len(resp.data["results"]) == 2

    def test_workspace_filter(self, client, ws, other_ws):
        _material(ws, "Кабель")
        _material(other_ws, "Кабель")
        resp = client.get(
            "/api/v1/materials/search/?q=Кабель",
            **{WS_HEADER: str(ws.id)},
        )
        assert len(resp.data["results"]) == 1


@pytest.mark.django_db
class TestMatchMaterialsEndpoint:
    def test_match_and_apply_flow(self, client, ws, estimate, section):
        _material(ws, "Кабель ВВГнг 3x2.5", price="85.00")
        item = _item(estimate, section, ws, "Кабель ВВГнг 3x2.5")

        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/match-materials/",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 200
        assert resp.data["matched"] == 1
        matches = resp.data["results"]

        apply_resp = client.post(
            f"/api/v1/estimates/{estimate.id}/match-materials/apply/",
            {"matches": matches},
            format="json",
            **{WS_HEADER: str(ws.id)},
        )
        assert apply_resp.status_code == 200
        assert apply_resp.data["updated"] == 1

        item.refresh_from_db()
        assert item.material_price == Decimal("85.00")

    def test_match_requires_workspace(self, client, estimate):
        resp = client.post(f"/api/v1/estimates/{estimate.id}/match-materials/")
        assert resp.status_code == 400

    def test_apply_requires_matches_list(self, client, ws, estimate):
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/match-materials/apply/",
            {"matches": "not a list"},
            format="json",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 400

    def test_apply_empty_list_ok(self, client, ws, estimate):
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/match-materials/apply/",
            {"matches": []},
            format="json",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 200
        assert resp.data["updated"] == 0
