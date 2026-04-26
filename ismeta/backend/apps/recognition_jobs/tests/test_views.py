"""Тесты RecognitionJobViewSet — list / retrieve / cancel / callback."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.estimate.models import Estimate, EstimateItem, EstimateSection
from apps.recognition_jobs.models import RecognitionJob
from apps.workspace.models import Workspace

User = get_user_model()
WS_HEADER = "HTTP_X_WORKSPACE_ID"


@pytest.fixture()
def ws():
    return Workspace.objects.create(name="WS-VIEWS", slug="ws-views")


@pytest.fixture()
def other_ws():
    return Workspace.objects.create(name="WS-OTHER", slug="ws-other")


@pytest.fixture()
def user():
    return User.objects.create_user(username="rj-views", password="pw")


@pytest.fixture()
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture()
def anon_client():
    return APIClient()


@pytest.fixture()
def estimate(ws, user):
    return Estimate.objects.create(
        workspace=ws,
        name="RJ views",
        default_material_markup={"type": "percent", "value": 30},
        default_work_markup={"type": "percent", "value": 300},
        created_by=user,
    )


@pytest.fixture()
def estimate_other(other_ws, user):
    return Estimate.objects.create(
        workspace=other_ws,
        name="other",
        default_material_markup={"type": "percent", "value": 30},
        default_work_markup={"type": "percent", "value": 300},
        created_by=user,
    )


@pytest.fixture()
def job(ws, estimate, user):
    return RecognitionJob.objects.create(
        estimate=estimate,
        workspace=ws,
        file_name="spec.pdf",
        file_blob=b"%PDF",
        cancellation_token="secrettoken",
        created_by=user,
    )


@pytest.fixture(autouse=True)
def _settings(settings):
    settings.RECOGNITION_URL = "http://recognition:8003"
    settings.RECOGNITION_API_KEY = "test-key"
    settings.BACKEND_INTERNAL_URL = "http://ismeta-backend:8000"


@pytest.mark.django_db
class TestList:
    def test_list_filters_by_workspace(self, client, ws, other_ws, estimate, estimate_other, user):
        RecognitionJob.objects.create(
            estimate=estimate, workspace=ws, file_name="a.pdf", file_blob=b"x"
        )
        RecognitionJob.objects.create(
            estimate=estimate_other, workspace=other_ws, file_name="b.pdf", file_blob=b"x"
        )
        resp = client.get("/api/v1/recognition-jobs/", **{WS_HEADER: str(ws.id)})
        assert resp.status_code == 200
        names = [r["file_name"] for r in resp.data["results"]]
        assert "a.pdf" in names and "b.pdf" not in names

    def test_list_requires_workspace(self, client):
        resp = client.get("/api/v1/recognition-jobs/")
        assert resp.status_code == 400

    def test_list_requires_auth(self, anon_client, ws):
        resp = anon_client.get(
            "/api/v1/recognition-jobs/", **{WS_HEADER: str(ws.id)}
        )
        assert resp.status_code in (401, 403)

    def test_filter_by_status(self, client, ws, estimate):
        RecognitionJob.objects.create(
            estimate=estimate, workspace=ws, file_name="q.pdf", file_blob=b"x",
            status="queued",
        )
        RecognitionJob.objects.create(
            estimate=estimate, workspace=ws, file_name="d.pdf", file_blob=b"x",
            status="done",
        )
        resp = client.get(
            "/api/v1/recognition-jobs/?status=queued",
            **{WS_HEADER: str(ws.id)},
        )
        names = [r["file_name"] for r in resp.data["results"]]
        assert names == ["q.pdf"]

    def test_filter_by_estimate(self, client, ws, estimate):
        other_estimate = Estimate.objects.create(
            workspace=ws, name="x",
            default_material_markup={"type": "percent", "value": 30},
            default_work_markup={"type": "percent", "value": 300},
        )
        RecognitionJob.objects.create(
            estimate=estimate, workspace=ws, file_name="m.pdf", file_blob=b"x"
        )
        RecognitionJob.objects.create(
            estimate=other_estimate, workspace=ws, file_name="n.pdf", file_blob=b"x"
        )
        resp = client.get(
            f"/api/v1/recognition-jobs/?estimate_id={estimate.id}",
            **{WS_HEADER: str(ws.id)},
        )
        names = [r["file_name"] for r in resp.data["results"]]
        assert names == ["m.pdf"]


@pytest.mark.django_db
class TestRetrieve:
    def test_retrieve_returns_serialized(self, client, ws, job):
        resp = client.get(f"/api/v1/recognition-jobs/{job.id}/", **{WS_HEADER: str(ws.id)})
        assert resp.status_code == 200
        assert resp.data["file_name"] == "spec.pdf"
        assert resp.data["status"] == "queued"
        # PDF blob и cancellation_token не выставляем во вне.
        assert "file_blob" not in resp.data
        assert "cancellation_token" not in resp.data


@pytest.mark.django_db
class TestCancel:
    def test_cancel_queued_job(self, client, ws, job):
        resp = client.post(
            f"/api/v1/recognition-jobs/{job.id}/cancel/", **{WS_HEADER: str(ws.id)}
        )
        assert resp.status_code == 200
        job.refresh_from_db()
        assert job.status == "cancelled"
        assert job.completed_at is not None

    def test_cancel_running_calls_recognition(self, client, ws, job):
        job.status = "running"
        job.save(update_fields=["status"])
        with patch("apps.recognition_jobs.views.httpx.Client") as mock_client_cls:
            instance = mock_client_cls.return_value.__enter__.return_value
            resp = client.post(
                f"/api/v1/recognition-jobs/{job.id}/cancel/",
                **{WS_HEADER: str(ws.id)},
            )
        assert resp.status_code == 200
        assert instance.post.call_args.args[0].endswith(f"/v1/parse/spec/cancel/{job.id}")
        job.refresh_from_db()
        assert job.status == "cancelled"

    def test_cancel_terminal_returns_409(self, client, ws, job):
        job.status = "done"
        job.save(update_fields=["status"])
        resp = client.post(
            f"/api/v1/recognition-jobs/{job.id}/cancel/", **{WS_HEADER: str(ws.id)}
        )
        assert resp.status_code == 409


@pytest.mark.django_db
class TestCallback:
    URL = "/api/v1/recognition-jobs/{id}/callback/"

    def test_callback_rejects_wrong_token(self, anon_client, job):
        resp = anon_client.post(
            self.URL.format(id=job.id),
            data={"event": "started"},
            format="json",
            HTTP_X_CALLBACK_TOKEN="wrong",
        )
        assert resp.status_code == 403

    def test_callback_rejects_missing_token(self, anon_client, job):
        resp = anon_client.post(
            self.URL.format(id=job.id),
            data={"event": "started"},
            format="json",
        )
        assert resp.status_code == 403

    def test_started_sets_running(self, anon_client, job):
        resp = anon_client.post(
            self.URL.format(id=job.id),
            data={"event": "started", "filename": "s.pdf"},
            format="json",
            HTTP_X_CALLBACK_TOKEN=job.cancellation_token,
        )
        assert resp.status_code == 200
        job.refresh_from_db()
        assert job.status == "running"
        assert job.started_at is not None

    def test_page_done_accumulates_items(self, anon_client, job):
        for i in range(3):
            resp = anon_client.post(
                self.URL.format(id=job.id),
                data={
                    "event": "page_done",
                    "page": i + 1,
                    "items": [{"name": f"it{i}", "unit": "шт", "quantity": 1}],
                    "partial_count": i + 1,
                },
                format="json",
                HTTP_X_CALLBACK_TOKEN=job.cancellation_token,
            )
            assert resp.status_code == 200
        job.refresh_from_db()
        assert job.pages_done == 3
        assert job.items_count == 3
        assert len(job.items) == 3

    def test_finished_creates_estimate_items(self, anon_client, ws, estimate, job):
        payload = {
            "event": "finished",
            "status": "done",
            "items": [
                {
                    "name": "Дефлектор",
                    "model_name": "DV-355",
                    "unit": "шт",
                    "quantity": 5,
                    "section_name": "Вентиляция",
                    "page_number": 1,
                },
            ],
            "pages_stats": {"total": 1, "processed": 1, "skipped": 0, "error": 0},
            "pages_summary": [],
            "errors": [],
            "llm_costs": {"total_usd": 0.12},
        }
        resp = anon_client.post(
            self.URL.format(id=job.id),
            data=payload,
            format="json",
            HTTP_X_CALLBACK_TOKEN=job.cancellation_token,
        )
        assert resp.status_code == 200
        job.refresh_from_db()
        assert job.status == "done"
        assert job.items_count == 1
        assert job.llm_costs == {"total_usd": 0.12}
        assert job.apply_result["created"] == 1
        # Items создались в Estimate
        assert EstimateItem.objects.filter(estimate=estimate, name="Дефлектор").exists()
        assert EstimateSection.objects.filter(
            estimate=estimate, name="Вентиляция"
        ).exists()

    def test_failed_records_error(self, anon_client, job):
        resp = anon_client.post(
            self.URL.format(id=job.id),
            data={"event": "failed", "error": "DeepSeek 500", "code": "llm_unavailable"},
            format="json",
            HTTP_X_CALLBACK_TOKEN=job.cancellation_token,
        )
        assert resp.status_code == 200
        job.refresh_from_db()
        assert job.status == "failed"
        assert "DeepSeek 500" in job.error_message

    def test_cancelled_marks_completed(self, anon_client, job):
        resp = anon_client.post(
            self.URL.format(id=job.id),
            data={"event": "cancelled"},
            format="json",
            HTTP_X_CALLBACK_TOKEN=job.cancellation_token,
        )
        assert resp.status_code == 200
        job.refresh_from_db()
        assert job.status == "cancelled"
        assert job.completed_at is not None

    def test_callback_after_terminal_is_idempotent(self, anon_client, job):
        job.status = "done"
        job.save(update_fields=["status"])
        resp = anon_client.post(
            self.URL.format(id=job.id),
            data={"event": "page_done", "page": 1, "items": []},
            format="json",
            HTTP_X_CALLBACK_TOKEN=job.cancellation_token,
        )
        assert resp.status_code == 200
        assert resp.data.get("ignored") == "already_terminal"

    def test_callback_unknown_event_400(self, anon_client, job):
        resp = anon_client.post(
            self.URL.format(id=job.id),
            data={"event": "weird"},
            format="json",
            HTTP_X_CALLBACK_TOKEN=job.cancellation_token,
        )
        assert resp.status_code == 400

    def test_callback_404_for_missing_job(self, anon_client):
        resp = anon_client.post(
            self.URL.format(id="00000000-0000-0000-0000-000000000000"),
            data={"event": "started"},
            format="json",
            HTTP_X_CALLBACK_TOKEN="x",
        )
        assert resp.status_code == 404
