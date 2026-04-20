"""Тесты PDF import (E32): mock ERP parser, preview + apply."""

import json
import uuid
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.estimate.models import Estimate, EstimateItem, EstimateSection
from apps.estimate.services.pdf_import_service import apply_parsed_items
from apps.workspace.models import Workspace

User = get_user_model()
WS_HEADER = "HTTP_X_WORKSPACE_ID"

MOCK_PARSE_RESULT = {
    "items": [
        {"name": "Дефлектор Цаги ф355", "unit": "шт", "quantity": 58, "section": "Вентиляция", "equipment_price": 3200},
        {"name": "Воздуховод прямоугольный 200x200", "unit": "м.п.", "quantity": 850, "section": "Вентиляция", "material_price": 680},
        {"name": "Вентилятор канальный WNK 100", "unit": "шт", "quantity": 10, "section": "МОП", "equipment_price": 28500},
        {"name": "Огнезадерживающий клапан EI60", "unit": "шт", "quantity": 2, "section": "МОП", "equipment_price": 12500},
    ],
    "pages_total": 5,
    "pages_processed": 4,
    "pages_skipped": 1,
    "errors": [],
    "status": "done",
}


@pytest.fixture()
def ws():
    return Workspace.objects.create(name="WS-PDF", slug="ws-pdf")


@pytest.fixture()
def user():
    return User.objects.create_user(username="pdf-user", password="pass")


@pytest.fixture()
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture()
def estimate(ws, user):
    return Estimate.objects.create(
        workspace=ws, name="PDF test",
        default_material_markup={"type": "percent", "value": 30},
        default_work_markup={"type": "percent", "value": 300},
        created_by=user,
    )


@pytest.mark.django_db
class TestApplyParsedItems:
    def test_apply_creates_sections_and_items(self, estimate, ws):
        result = apply_parsed_items(str(estimate.id), str(ws.id), MOCK_PARSE_RESULT["items"])
        assert result["created"] == 4
        assert result["sections"] == 2
        sections = EstimateSection.objects.filter(estimate=estimate)
        assert set(sections.values_list("name", flat=True)) == {"Вентиляция", "МОП"}

    def test_apply_skips_empty_names(self, estimate, ws):
        items = [{"name": "", "unit": "шт", "quantity": 1, "section": "Test"}]
        result = apply_parsed_items(str(estimate.id), str(ws.id), items)
        assert result["created"] == 0


@pytest.mark.django_db
class TestPDFPreviewEndpoint:
    @patch("apps.estimate.pdf_views.parse_pdf_via_erp")
    def test_preview_returns_items(self, mock_parse, client, estimate, ws):
        mock_parse.return_value = MOCK_PARSE_RESULT
        pdf_file = SimpleUploadedFile("spec.pdf", b"%PDF-fake", content_type="application/pdf")

        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/import/pdf/",
            {"file": pdf_file},
            format="multipart",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 200
        assert len(resp.data["items"]) == 4
        assert resp.data["pages_total"] == 5
        assert "preview_id" in resp.data

    @patch("apps.estimate.pdf_views.parse_pdf_via_erp")
    def test_preview_then_apply(self, mock_parse, client, estimate, ws):
        mock_parse.return_value = MOCK_PARSE_RESULT
        pdf_file = SimpleUploadedFile("spec.pdf", b"%PDF-fake", content_type="application/pdf")

        # Preview
        resp1 = client.post(
            f"/api/v1/estimates/{estimate.id}/import/pdf/",
            {"file": pdf_file},
            format="multipart",
            **{WS_HEADER: str(ws.id)},
        )
        preview_id = resp1.data["preview_id"]

        # Apply
        resp2 = client.post(
            f"/api/v1/estimates/{estimate.id}/import/pdf/{preview_id}/apply/",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp2.status_code == 200
        assert resp2.data["created"] == 4
        assert resp2.data["sections"] == 2

    def test_apply_expired_preview_404(self, client, estimate, ws):
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/import/pdf/fake-id/apply/",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 404
