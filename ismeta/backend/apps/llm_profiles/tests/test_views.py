"""API-тесты LLMProfile ViewSet (E18-2)."""

from __future__ import annotations

from unittest.mock import patch

import httpx
import pytest
from cryptography.fernet import Fernet
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.llm_profiles.models import LLMProfile

User = get_user_model()

TEST_FERNET_KEY = Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def _set_fernet_key(settings):
    settings.LLM_PROFILE_ENCRYPTION_KEY = TEST_FERNET_KEY


@pytest.fixture()
def user():
    return User.objects.create_user(username="profileuser", password="pw")


@pytest.fixture()
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture()
def profile(user):
    p = LLMProfile(
        name="OpenAI Default",
        base_url="https://api.openai.com",
        extract_model="gpt-4o-mini",
        is_default=True,
        created_by=user,
    )
    p.set_api_key("sk-existing-1234")
    p.save()
    return p


@pytest.mark.django_db
def test_create_profile_returns_preview_not_plain(client):
    resp = client.post(
        "/api/v1/llm-profiles/",
        {
            "name": "DeepSeek",
            "base_url": "https://api.deepseek.com",
            "extract_model": "deepseek-chat",
            "vision_supported": False,
            "api_key": "sk-deepseek-abcdefgh",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    data = resp.json()
    assert data["name"] == "DeepSeek"
    assert "api_key" not in data  # write_only — не возвращается
    assert data["api_key_preview"] == "***efgh"


@pytest.mark.django_db
def test_list_returns_preview(client, profile):
    resp = client.get("/api/v1/llm-profiles/")
    assert resp.status_code == 200, resp.content
    items = resp.json()
    assert len(items) == 1
    assert items[0]["api_key_preview"] == "***1234"
    assert "api_key" not in items[0]


@pytest.mark.django_db
def test_create_requires_api_key(client):
    resp = client.post(
        "/api/v1/llm-profiles/",
        {
            "name": "NoKey",
            "base_url": "https://api.openai.com",
            "extract_model": "gpt-4o",
            "vision_supported": True,
        },
        format="json",
    )
    assert resp.status_code == 400
    assert "api_key" in resp.json()


@pytest.mark.django_db
def test_update_without_api_key_keeps_existing(client, profile):
    resp = client.patch(
        f"/api/v1/llm-profiles/{profile.id}/",
        {"extract_model": "gpt-4o"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    profile.refresh_from_db()
    assert profile.extract_model == "gpt-4o"
    assert profile.get_api_key() == "sk-existing-1234"


@pytest.mark.django_db
def test_update_with_api_key_replaces(client, profile):
    resp = client.patch(
        f"/api/v1/llm-profiles/{profile.id}/",
        {"api_key": "sk-new-zzzz"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    profile.refresh_from_db()
    assert profile.get_api_key() == "sk-new-zzzz"
    assert resp.json()["api_key_preview"] == "***zzzz"


@pytest.mark.django_db
def test_set_default_atomic(client, profile, user):
    """Создаём второй профиль (не default), переключаем default на него."""
    p2 = LLMProfile(
        name="Other",
        base_url="https://api.openai.com",
        extract_model="gpt-4o",
    )
    p2.set_api_key("sk-other")
    p2.save()
    assert p2.is_default is False
    assert profile.is_default is True

    resp = client.post(f"/api/v1/llm-profiles/{p2.id}/set-default/")
    assert resp.status_code == 200, resp.content
    p2.refresh_from_db()
    profile.refresh_from_db()
    assert p2.is_default is True
    assert profile.is_default is False


@pytest.mark.django_db
def test_destroy_default_returns_409(client, profile):
    resp = client.delete(f"/api/v1/llm-profiles/{profile.id}/")
    assert resp.status_code == 409
    assert LLMProfile.objects.filter(id=profile.id).exists()


@pytest.mark.django_db
def test_destroy_non_default_ok(client, profile):
    p2 = LLMProfile(name="X", base_url="https://a.com", extract_model="m")
    p2.set_api_key("k")
    p2.save()
    resp = client.delete(f"/api/v1/llm-profiles/{p2.id}/")
    assert resp.status_code == 204
    assert not LLMProfile.objects.filter(id=p2.id).exists()


@pytest.mark.django_db
def test_default_endpoint(client, profile):
    resp = client.get("/api/v1/llm-profiles/default/")
    assert resp.status_code == 200
    assert resp.json()["id"] == profile.id


@pytest.mark.django_db
def test_default_endpoint_when_none(client):
    resp = client.get("/api/v1/llm-profiles/default/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_test_connection_ok(client):
    """test-connection с валидным GET /v1/models — ok=true + список моделей."""
    fake_response = httpx.Response(
        200,
        json={"data": [{"id": "gpt-4o"}, {"id": "gpt-4o-mini"}]},
        request=httpx.Request("GET", "https://api.openai.com/v1/models"),
    )

    with patch("httpx.Client.get", return_value=fake_response):
        resp = client.post(
            "/api/v1/llm-profiles/test-connection/",
            {"base_url": "https://api.openai.com", "api_key": "sk-test"},
            format="json",
        )
    assert resp.status_code == 200, resp.content
    data = resp.json()
    assert data["ok"] is True
    assert data["status_code"] == 200
    assert "gpt-4o" in (data.get("models") or [])


@pytest.mark.django_db
def test_test_connection_unauthorized(client):
    fake_response = httpx.Response(
        401,
        json={"error": "Unauthorized"},
        request=httpx.Request("GET", "https://api.openai.com/v1/models"),
    )
    with patch("httpx.Client.get", return_value=fake_response):
        resp = client.post(
            "/api/v1/llm-profiles/test-connection/",
            {"base_url": "https://api.openai.com", "api_key": "sk-bad"},
            format="json",
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["status_code"] == 401


@pytest.mark.django_db
def test_test_connection_network_error(client):
    with patch("httpx.Client.get", side_effect=httpx.ConnectError("dns fail")):
        resp = client.post(
            "/api/v1/llm-profiles/test-connection/",
            {"base_url": "https://nope.invalid", "api_key": "sk-x"},
            format="json",
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert "Соединение" in data["error"]


@pytest.mark.django_db
def test_test_connection_missing_fields(client):
    resp = client.post(
        "/api/v1/llm-profiles/test-connection/",
        {"base_url": "https://api.openai.com"},
        format="json",
    )
    assert resp.status_code == 400
