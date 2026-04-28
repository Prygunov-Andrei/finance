"""Integration-тест: proxy в /api/v1/estimates/{id}/import/pdf/ (E18-2).

Проверяет что:
1. С llm_profile_id → recognition вызывается с правильными X-LLM-* headers.
2. Без llm_profile_id → headers не добавляются (recognition использует defaults).
3. После успешного apply создаётся ImportLog с cost_usd из llm_costs.total_usd.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.estimate.models import Estimate
from apps.llm_profiles.models import ImportLog, LLMProfile
from apps.llm_profiles.proxy import build_llm_headers
from apps.workspace.models import Workspace

User = get_user_model()

TEST_FERNET_KEY = Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def _set_fernet_key(settings):
    settings.LLM_PROFILE_ENCRYPTION_KEY = TEST_FERNET_KEY


@pytest.fixture()
def user():
    return User.objects.create_user(username="proxyuser", password="pw")


@pytest.fixture()
def workspace():
    return Workspace.objects.create(name="WS", slug="ws-proxy")


@pytest.fixture()
def estimate(workspace, user):
    return Estimate.objects.create(
        workspace=workspace, name="Smeta", created_by=user
    )


@pytest.fixture()
def profile():
    p = LLMProfile(
        name="DeepSeek",
        base_url="https://api.deepseek.com",
        extract_model="deepseek-chat",
        multimodal_model="",
        classify_model="",
        vision_supported=False,
    )
    p.set_api_key("sk-deepseek-secret-1234")
    p.save()
    return p


@pytest.fixture()
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


SAMPLE_PDF = b"%PDF-1.4\n%minimal\n"


def _mock_recognition_response() -> dict:
    return {
        "status": "done",
        "items": [
            {
                "name": "Вентилятор канальный",
                "model_name": "VKP-100",
                "unit": "шт",
                "quantity": 2,
                "section_name": "Вентиляция",
                "page_number": 1,
                "sort_order": 1,
            }
        ],
        "errors": [],
        "pages_stats": {"total": 1, "processed": 1, "skipped": 0, "error": 0},
        "pages_summary": [{"page": 1, "expected_count": 1, "parsed_count": 1}],
        "llm_costs": {
            "extract": {
                "model": "deepseek-chat",
                "calls": 1,
                "prompt_tokens": 1000,
                "completion_tokens": 200,
                "cached_tokens": 0,
                "cost_usd": 0.0023,
            },
            "multimodal": None,
            "classify": None,
            "total_usd": 0.0023,
        },
    }


@pytest.mark.django_db
def test_build_llm_headers(profile):
    headers = build_llm_headers(profile)
    assert headers["X-LLM-Base-URL"] == "https://api.deepseek.com"
    assert headers["X-LLM-API-Key"] == "sk-deepseek-secret-1234"
    assert headers["X-LLM-Extract-Model"] == "deepseek-chat"
    # multimodal_model пустой → fallback на extract_model
    assert headers["X-LLM-Multimodal-Model"] == "deepseek-chat"
    assert headers["X-LLM-Classify-Model"] == "deepseek-chat"
    assert headers["X-LLM-Vision-Counter-Enabled"] == "false"
    assert headers["X-LLM-Multimodal-Retry-Enabled"] == "false"


@pytest.mark.django_db
def test_import_pdf_with_profile_passes_headers(client, estimate, profile, workspace):
    """С llm_profile_id → RecognitionClient.parse_spec получает extra_headers."""
    captured: dict = {}

    async def fake_parse_spec(self, pdf_bytes, filename, extra_headers=None):
        captured["extra_headers"] = extra_headers
        return _mock_recognition_response()

    with patch(
        "apps.integration.recognition_client.RecognitionClient.parse_spec",
        new=fake_parse_spec,
    ):
        pdf = SimpleUploadedFile("test.pdf", SAMPLE_PDF, content_type="application/pdf")
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/import/pdf/?async=false",
            data={"file": pdf, "llm_profile_id": str(profile.id)},
            format="multipart",
            HTTP_X_WORKSPACE_ID=str(workspace.id),
        )

    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["created"] >= 1
    assert body["llm_costs"]["total_usd"] == 0.0023

    headers = captured.get("extra_headers") or {}
    assert headers["X-LLM-Base-URL"] == "https://api.deepseek.com"
    assert headers["X-LLM-API-Key"] == "sk-deepseek-secret-1234"
    assert headers["X-LLM-Extract-Model"] == "deepseek-chat"
    assert headers["X-LLM-Vision-Counter-Enabled"] == "false"

    log = ImportLog.objects.filter(estimate=estimate).first()
    assert log is not None
    assert log.profile_id == profile.id
    assert float(log.cost_usd) == 0.0023
    assert log.items_created == body["created"]
    assert log.llm_metadata["total_usd"] == 0.0023


@pytest.mark.django_db
def test_import_pdf_without_profile_no_headers(client, estimate, workspace):
    captured: dict = {}

    async def fake_parse_spec(self, pdf_bytes, filename, extra_headers=None):
        captured["extra_headers"] = extra_headers
        return _mock_recognition_response()

    with patch(
        "apps.integration.recognition_client.RecognitionClient.parse_spec",
        new=fake_parse_spec,
    ):
        pdf = SimpleUploadedFile("t.pdf", SAMPLE_PDF, content_type="application/pdf")
        resp = client.post(
            f"/api/v1/estimates/{estimate.id}/import/pdf/?async=false",
            data={"file": pdf},
            format="multipart",
            HTTP_X_WORKSPACE_ID=str(workspace.id),
        )

    assert resp.status_code == 200, resp.content
    assert captured["extra_headers"] is None

    log = ImportLog.objects.filter(estimate=estimate).first()
    assert log is not None
    assert log.profile_id is None
    assert float(log.cost_usd) == 0.0023


@pytest.mark.django_db
def test_import_pdf_unknown_profile_returns_400(client, estimate, workspace):
    pdf = SimpleUploadedFile("t.pdf", SAMPLE_PDF, content_type="application/pdf")
    resp = client.post(
        f"/api/v1/estimates/{estimate.id}/import/pdf/?async=false",
        data={"file": pdf, "llm_profile_id": "999999"},
        format="multipart",
        HTTP_X_WORKSPACE_ID=str(workspace.id),
    )
    assert resp.status_code == 400
    assert "llm_profile_id" in resp.json()


@pytest.mark.django_db
def test_import_pdf_async_stores_profile_id(client, estimate, profile, workspace):
    """Async path: profile_id попадает в RecognitionJob.profile_id."""
    pdf = SimpleUploadedFile("t.pdf", SAMPLE_PDF, content_type="application/pdf")
    resp = client.post(
        f"/api/v1/estimates/{estimate.id}/import/pdf/?async=true",
        data={"file": pdf, "llm_profile_id": str(profile.id)},
        format="multipart",
        HTTP_X_WORKSPACE_ID=str(workspace.id),
    )
    assert resp.status_code == 202, resp.content

    from apps.recognition_jobs.models import RecognitionJob

    job = RecognitionJob.objects.filter(estimate=estimate).first()
    assert job is not None
    assert job.profile_id == profile.id
