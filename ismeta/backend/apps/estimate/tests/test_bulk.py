"""Тесты bulk operations (E4.2)."""

import uuid
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.estimate.models import Estimate, EstimateItem, EstimateSection
from apps.estimate.services.estimate_service import EstimateService
from apps.workspace.models import Workspace

User = get_user_model()
WS_HEADER = "HTTP_X_WORKSPACE_ID"


@pytest.fixture()
def ws():
    return Workspace.objects.create(name="WS-Bulk", slug="ws-bulk")


@pytest.fixture()
def user():
    return User.objects.create_user(username="bulk-user", password="pass")


@pytest.fixture()
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture()
def estimate(ws, user):
    return Estimate.objects.create(
        workspace=ws, name="Bulk test",
        default_material_markup={"type": "percent", "value": 30},
        default_work_markup={"type": "percent", "value": 300},
        created_by=user,
    )


@pytest.fixture()
def section(estimate, ws):
    return EstimateSection.objects.create(
        estimate=estimate, workspace=ws, name="Bulk section", sort_order=1,
    )


@pytest.mark.django_db
class TestBulkCreate:
    def test_bulk_create_100_items(self, client, estimate, section, ws):
        items = [
            {"section_id": str(section.id), "name": f"Item {i}", "unit": "шт", "quantity": i + 1}
            for i in range(100)
        ]
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/items/bulk-create/",
            {"items": items},
            format="json",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 201
        assert resp.data["created"] == 100
        assert EstimateItem.objects.filter(estimate=estimate, workspace_id=ws.id).count() == 100

    def test_bulk_create_limit_exceeded(self, client, estimate, section, ws):
        items = [{"section_id": str(section.id), "name": f"Item {i}", "unit": "шт", "quantity": 1} for i in range(501)]
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/items/bulk-create/",
            {"items": items},
            format="json",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 400
        assert "500" in resp.data["detail"]

    def test_bulk_create_recalcs_totals(self, client, estimate, section, ws):
        items = [
            {"section_id": str(section.id), "name": "Bulk item", "unit": "шт",
             "quantity": 10, "material_price": 100, "work_price": 50}
        ]
        client.post(
            f"/api/v1/estimates/{estimate.id}/items/bulk-create/",
            {"items": items}, format="json", **{WS_HEADER: str(ws.id)},
        )
        estimate.refresh_from_db()
        assert estimate.total_amount > 0


@pytest.mark.django_db
class TestBulkUpdate:
    def test_bulk_update(self, client, estimate, section, ws):
        items = []
        for i in range(5):
            item = EstimateService.create_item(section, estimate, ws.id, {
                "name": f"Original {i}", "unit": "шт", "quantity": 1,
            })
            items.append(item)

        update_data = [
            {"id": str(items[0].id), "version": items[0].version, "name": "Updated 0"},
            {"id": str(items[1].id), "version": items[1].version, "name": "Updated 1"},
        ]
        resp = client.patch(
            f"/api/v1/estimates/{estimate.id}/items/bulk-update/",
            {"items": update_data},
            format="json",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 200
        assert resp.data["updated"] == 2
        assert resp.data["errors"] == []

    def test_bulk_update_version_conflict(self, client, estimate, section, ws):
        item = EstimateService.create_item(section, estimate, ws.id, {
            "name": "Conflict test", "unit": "шт", "quantity": 1,
        })
        resp = client.patch(
            f"/api/v1/estimates/{estimate.id}/items/bulk-update/",
            {"items": [{"id": str(item.id), "version": 999, "name": "Fail"}]},
            format="json",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 200
        assert resp.data["updated"] == 0
        assert len(resp.data["errors"]) == 1
        assert "version conflict" in resp.data["errors"][0]


@pytest.mark.django_db
class TestBulkDelete:
    def test_bulk_delete(self, client, estimate, section, ws):
        items = [
            EstimateService.create_item(section, estimate, ws.id, {
                "name": f"Delete {i}", "unit": "шт", "quantity": 1,
            })
            for i in range(3)
        ]
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/items/bulk-delete/",
            {
                "item_ids": [str(i.id) for i in items],
                "versions": [i.version for i in items],
            },
            format="json",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 200
        assert resp.data["deleted"] == 3
        assert EstimateItem.objects.filter(estimate=estimate, workspace_id=ws.id).count() == 0
        assert EstimateItem.all_objects.filter(estimate=estimate, workspace_id=ws.id).count() == 3


@pytest.mark.django_db
class TestImporterUsesBulk:
    def test_importer_creates_via_bulk(self, estimate, section, ws):
        """Importer использует bulk_create_items вместо поштучного create."""
        import io
        from openpyxl import Workbook

        wb = Workbook()
        sheet = wb.active
        sheet.append(["Наименование", "Ед.изм.", "Кол-во", "Цена оборуд.", "Цена мат.", "Цена работ"])
        for i in range(50):
            sheet.append([f"Bulk import item {i}", "шт", i + 1, 0, 100, 50])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        from apps.estimate.excel.importer import import_estimate_xlsx
        result = import_estimate_xlsx(str(estimate.id), str(ws.id), buf)
        assert result.created == 50
        assert EstimateItem.objects.filter(estimate=estimate, workspace_id=ws.id).count() == 50
