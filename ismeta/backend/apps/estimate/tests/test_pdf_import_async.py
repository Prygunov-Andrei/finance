"""Тесты async-режима import_pdf (E19-2).

По умолчанию /api/v1/estimates/{id}/import/pdf/ работает в async-режиме —
создаёт RecognitionJob (status=queued) и возвращает 202 со сериализованным
job. Старый sync-flow доступен через `?async=false`.
"""

from __future__ import annotations

import httpx
import pytest
import respx
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.estimate.models import Estimate
from apps.recognition_jobs.models import RecognitionJob
from apps.workspace.models import Workspace

User = get_user_model()
WS_HEADER = "HTTP_X_WORKSPACE_ID"
RECOGNITION_URL = "http://recognition:8003"

SPEC_OK_SYNC = {
    "status": "done",
    "items": [
        {"name": "X", "model_name": "M", "brand": "B", "unit": "шт", "quantity": 1,
         "tech_specs": "", "section_name": "S", "page_number": 1, "sort_order": 0},
    ],
    "errors": [],
    "pages_stats": {"total": 1, "processed": 1, "skipped": 0, "error": 0},
}


@pytest.fixture(autouse=True)
def _settings(settings):
    settings.RECOGNITION_URL = RECOGNITION_URL
    settings.RECOGNITION_API_KEY = "test-key"


@pytest.fixture()
def ws():
    return Workspace.objects.create(name="WS-ASYNC", slug="ws-async")


@pytest.fixture()
def user():
    return User.objects.create_user(username="async-user", password="pw")


@pytest.fixture()
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture()
def estimate(ws, user):
    return Estimate.objects.create(
        workspace=ws, name="async test",
        default_material_markup={"type": "percent", "value": 30},
        default_work_markup={"type": "percent", "value": 300},
        created_by=user,
    )


@pytest.mark.django_db
class TestImportPdfAsync:
    def test_async_default_creates_job_and_returns_202(self, client, ws, estimate):
        pdf = SimpleUploadedFile("spec.pdf", b"%PDF-1.4 fake", content_type="application/pdf")
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/import/pdf/",
            data={"file": pdf},
            format="multipart",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 202, resp.content
        assert resp.data["status"] == "queued"
        assert resp.data["file_name"] == "spec.pdf"
        # job в БД
        jobs = RecognitionJob.objects.filter(estimate=estimate)
        assert jobs.count() == 1
        job = jobs.first()
        assert job.status == "queued"
        assert job.cancellation_token  # генерится на стороне backend'а
        # PDF blob сохранён для воркера
        assert bytes(job.file_blob) == b"%PDF-1.4 fake"

    def test_async_explicit_true(self, client, ws, estimate):
        pdf = SimpleUploadedFile("e.pdf", b"%PDF", content_type="application/pdf")
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/import/pdf/?async=true",
            data={"file": pdf},
            format="multipart",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 202

    def test_async_rejects_non_pdf(self, client, ws, estimate):
        not_pdf = SimpleUploadedFile("a.txt", b"hi", content_type="text/plain")
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/import/pdf/",
            data={"file": not_pdf},
            format="multipart",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 400

    def test_async_requires_workspace(self, client, estimate):
        pdf = SimpleUploadedFile("x.pdf", b"%PDF", content_type="application/pdf")
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/import/pdf/",
            data={"file": pdf},
            format="multipart",
        )
        assert resp.status_code == 400

    def test_async_404_when_estimate_not_in_workspace(self, client, ws, user):
        other_ws = Workspace.objects.create(name="OW", slug="ow")
        other = Estimate.objects.create(
            workspace=other_ws, name="other",
            default_material_markup={"type": "percent", "value": 30},
            default_work_markup={"type": "percent", "value": 300},
            created_by=user,
        )
        pdf = SimpleUploadedFile("x.pdf", b"%PDF", content_type="application/pdf")
        resp = client.post(
            f"/api/v1/estimates/{other.id}/import/pdf/",
            data={"file": pdf},
            format="multipart",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 404


@pytest.mark.django_db
class TestImportPdfSyncFallback:
    @respx.mock
    def test_sync_via_async_false(self, client, ws, estimate):
        """Backward-compat: ?async=false → старый sync flow без создания RecognitionJob."""
        respx.post(f"{RECOGNITION_URL}/v1/parse/spec").mock(
            return_value=httpx.Response(200, json=SPEC_OK_SYNC)
        )
        pdf = SimpleUploadedFile("s.pdf", b"%PDF", content_type="application/pdf")
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/import/pdf/?async=false",
            data={"file": pdf},
            format="multipart",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 200
        assert resp.data["created"] == 1
        assert resp.data["sections"] == 1
        assert RecognitionJob.objects.count() == 0
