"""Тесты эндпоинта POST /api/hvac/rating/models/{id}/generate-pros-cons/.

LLM-провайдер мокаем целиком (через `get_pros_cons_provider`) — реальный
вызов OpenAI/Gemini в тестах запрещён.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from ac_brands.tests.factories import BrandFactory
from ac_catalog.models import ACModel
from ac_catalog.tests.factories import ACModelFactory, ModelRawValueFactory
from ac_methodology.tests.factories import (
    ActiveMethodologyVersionFactory,
    CriterionFactory,
    MethodologyCriterionFactory,
)
from personnel.models import Employee, default_erp_permissions


# ── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def anon_client():
    return APIClient()


@pytest.fixture
def staff_client(db):
    user = User.objects.create_user(
        username="pc_staff", password="x", is_staff=True,
    )
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def regular_client(db):
    user = User.objects.create_user(username="pc_reg", password="x")
    Employee.objects.create(
        full_name="Reg", user=user, erp_permissions=default_erp_permissions(),
    )
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def model_with_scores(db):
    """Модель с активной методикой и набором raw_values для скоринга."""
    methodology = ActiveMethodologyVersionFactory(version="pc-1.0")
    brand = BrandFactory(name="Daikin", sales_start_year_ru=2003)
    model = ACModelFactory(
        brand=brand,
        series="FTXM",
        inner_unit="ftxm-25",
        outer_unit="rxm-25",
        nominal_capacity=2500.0,
    )

    crit_high = CriterionFactory(
        code="warranty", name_ru="Гарантия", unit="лет",
    )
    crit_low = CriterionFactory(
        code="noise_min", name_ru="Минимальный шум", unit="дБ",
    )
    MethodologyCriterionFactory(
        methodology=methodology, criterion=crit_high,
        weight=20.0, min_value=1, max_value=7,
    )
    MethodologyCriterionFactory(
        methodology=methodology, criterion=crit_low,
        weight=20.0, min_value=18, max_value=40,
    )

    ModelRawValueFactory(
        model=model, criterion=crit_high, raw_value="7",
    )
    ModelRawValueFactory(
        model=model, criterion=crit_low, raw_value="40",
    )
    return model


def _ok_llm_response() -> dict:
    return {
        "pros": [
            "Тихий компрессор",
            "Сильный обогрев",
            "Длинная гарантия",
        ],
        "cons": [
            "Без WiFi",
            "Тяжёлый блок",
            "Шумит на максимуме",
        ],
    }


# ── Permissions ──────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_generate_pros_cons_anonymous_401(anon_client, model_with_scores):
    resp = anon_client.post(
        f"/api/hvac/rating/models/{model_with_scores.id}/generate-pros-cons/"
    )
    assert resp.status_code == 401


@pytest.mark.django_db
def test_generate_pros_cons_regular_user_403(regular_client, model_with_scores):
    resp = regular_client.post(
        f"/api/hvac/rating/models/{model_with_scores.id}/generate-pros-cons/"
    )
    assert resp.status_code == 403


# ── Happy path ───────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_generate_pros_cons_happy_path(staff_client, model_with_scores):
    fake_provider = MagicMock()
    fake_provider.chat_completion.return_value = _ok_llm_response()
    fake_provider.model_name = "gpt-4o-mini"

    with patch(
        "ac_catalog.admin_views.get_pros_cons_provider",
        return_value=fake_provider,
    ):
        resp = staff_client.post(
            f"/api/hvac/rating/models/{model_with_scores.id}/generate-pros-cons/"
        )

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["generated"]["pros"] == _ok_llm_response()["pros"]
    assert body["generated"]["cons"] == _ok_llm_response()["cons"]
    assert "gpt-4o-mini" in body["provider"]
    assert body["model"]["pros_text"].startswith("Тихий компрессор")

    model_with_scores.refresh_from_db()
    assert "Тихий компрессор" in model_with_scores.pros_text
    assert "Без WiFi" in model_with_scores.cons_text

    # Проверяем что LLM получил корректный response_format и system_prompt.
    args, kwargs = fake_provider.chat_completion.call_args
    assert kwargs.get("response_format") == "json"
    assert "Ты — редактор" in args[0]
    assert "warranty" in args[1]


@pytest.mark.django_db
def test_generate_pros_cons_truncates_to_three(staff_client, model_with_scores):
    """LLM может вернуть >3 строк — мы режем до 3."""
    fake_provider = MagicMock()
    fake_provider.chat_completion.return_value = {
        "pros": ["1", "2", "3", "4", "5"],
        "cons": ["a", "b", "c", "d"],
    }
    fake_provider.model_name = "gpt-4o-mini"

    with patch(
        "ac_catalog.admin_views.get_pros_cons_provider",
        return_value=fake_provider,
    ):
        resp = staff_client.post(
            f"/api/hvac/rating/models/{model_with_scores.id}/generate-pros-cons/"
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["generated"]["pros"] == ["1", "2", "3"]
    assert body["generated"]["cons"] == ["a", "b", "c"]


# ── Edge cases: scoring невозможен ───────────────────────────────────────


@pytest.mark.django_db
def test_generate_pros_cons_no_active_methodology_400(staff_client):
    """Активной методики нет вообще — ничего не вычислить."""
    model = ACModelFactory()
    ModelRawValueFactory(model=model, criterion=CriterionFactory(code="x"))

    resp = staff_client.post(
        f"/api/hvac/rating/models/{model.id}/generate-pros-cons/"
    )
    assert resp.status_code == 400
    assert "методики" in resp.json()["detail"]


@pytest.mark.django_db
def test_generate_pros_cons_no_raw_values_400(staff_client):
    """Активная методика есть, но у модели нет raw_values."""
    ActiveMethodologyVersionFactory(version="pc-empty")
    model = ACModelFactory()

    resp = staff_client.post(
        f"/api/hvac/rating/models/{model.id}/generate-pros-cons/"
    )
    assert resp.status_code == 400
    assert "raw_values" in resp.json()["detail"]


# ── Edge cases: LLM ──────────────────────────────────────────────────────


@pytest.mark.django_db
def test_generate_pros_cons_llm_invalid_response_503(staff_client, model_with_scores):
    """LLM вернул не dict — 503."""
    fake_provider = MagicMock()
    fake_provider.chat_completion.return_value = "не json"
    fake_provider.model_name = "gpt-4o-mini"

    with patch(
        "ac_catalog.admin_views.get_pros_cons_provider",
        return_value=fake_provider,
    ):
        resp = staff_client.post(
            f"/api/hvac/rating/models/{model_with_scores.id}/generate-pros-cons/"
        )
    assert resp.status_code == 503
    body = resp.json()
    assert body["detail"] == "AI временно недоступен"


@pytest.mark.django_db
def test_generate_pros_cons_llm_missing_keys_503(staff_client, model_with_scores):
    """LLM вернул dict, но без pros/cons — 503."""
    fake_provider = MagicMock()
    fake_provider.chat_completion.return_value = {"foo": "bar"}
    fake_provider.model_name = "gpt-4o-mini"

    with patch(
        "ac_catalog.admin_views.get_pros_cons_provider",
        return_value=fake_provider,
    ):
        resp = staff_client.post(
            f"/api/hvac/rating/models/{model_with_scores.id}/generate-pros-cons/"
        )
    assert resp.status_code == 503


@pytest.mark.django_db
def test_generate_pros_cons_llm_raises_503(staff_client, model_with_scores):
    """LLM-вызов кинул исключение (timeout, network) — 503, а не 500."""
    fake_provider = MagicMock()
    fake_provider.chat_completion.side_effect = TimeoutError("read timeout")
    fake_provider.model_name = "gpt-4o-mini"

    with patch(
        "ac_catalog.admin_views.get_pros_cons_provider",
        return_value=fake_provider,
    ):
        resp = staff_client.post(
            f"/api/hvac/rating/models/{model_with_scores.id}/generate-pros-cons/"
        )
    assert resp.status_code == 503
    body = resp.json()
    assert "read timeout" in body["error"]


@pytest.mark.django_db
def test_generate_pros_cons_provider_init_failure_503(staff_client, model_with_scores):
    """Если фабрика провайдера упала (нет API-ключа в ENV) — 503, не 500."""
    with patch(
        "ac_catalog.admin_views.get_pros_cons_provider",
        side_effect=ValueError("no api key in env OPENAI_API_KEY"),
    ):
        resp = staff_client.post(
            f"/api/hvac/rating/models/{model_with_scores.id}/generate-pros-cons/"
        )
    assert resp.status_code == 503
    body = resp.json()
    assert "OPENAI_API_KEY" in body["error"]


@pytest.mark.django_db
def test_generate_pros_cons_does_not_overwrite_on_failure(staff_client, model_with_scores):
    """При 503/400 поля pros_text/cons_text не должны меняться."""
    model_with_scores.pros_text = "старые плюсы"
    model_with_scores.cons_text = "старые минусы"
    model_with_scores.save(update_fields=["pros_text", "cons_text"])

    fake_provider = MagicMock()
    fake_provider.chat_completion.side_effect = TimeoutError()
    fake_provider.model_name = "gpt-4o-mini"

    with patch(
        "ac_catalog.admin_views.get_pros_cons_provider",
        return_value=fake_provider,
    ):
        resp = staff_client.post(
            f"/api/hvac/rating/models/{model_with_scores.id}/generate-pros-cons/"
        )
    assert resp.status_code == 503
    model_with_scores.refresh_from_db()
    assert model_with_scores.pros_text == "старые плюсы"
    assert model_with_scores.cons_text == "старые минусы"
