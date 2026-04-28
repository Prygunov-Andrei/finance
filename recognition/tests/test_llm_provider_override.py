"""E18-1: per-request LLM provider override через X-LLM-* headers."""

from __future__ import annotations

import io

import fitz
import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from app.config import settings
from app.deps import _bool_header, get_provider
from app.main import app
from app.providers.openai_vision import OpenAIVisionProvider


def _fake_request(headers: dict[str, str]) -> Request:
    """Минимальный ASGI scope для прокидывания headers в Request."""
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    scope = {"type": "http", "headers": raw}
    return Request(scope)


def _make_real_pdf(pages: int = 1) -> bytes:
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), f"Page {i + 1}")
    out = doc.tobytes()
    doc.close()
    return out


class TestBoolHeader:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("true", True),
            ("True", True),
            ("1", True),
            ("yes", True),
            ("on", True),
            ("false", False),
            ("0", False),
            ("no", False),
            ("off", False),
        ],
    )
    def test_parses_known_values(self, raw: str, expected: bool) -> None:
        req = _fake_request({"X-Test": raw})
        # default = противоположность ожидаемого, чтобы убедиться что parser
        # действительно прочитал header а не вернул default.
        assert _bool_header(req, "X-Test", not expected) is expected

    def test_missing_header_returns_default(self) -> None:
        req = _fake_request({})
        assert _bool_header(req, "X-Test", True) is True
        assert _bool_header(req, "X-Test", False) is False

    def test_garbage_returns_default(self) -> None:
        req = _fake_request({"X-Test": "maybe"})
        assert _bool_header(req, "X-Test", True) is True


class TestGetProviderDefaults:
    def test_no_headers_uses_settings(self) -> None:
        req = _fake_request({})
        provider = get_provider(req)
        assert isinstance(provider, OpenAIVisionProvider)
        assert provider.api_base == settings.openai_api_base.rstrip("/")
        assert provider.api_key == settings.llm_api_key
        assert provider.extract_model == settings.llm_extract_model
        assert provider.multimodal_model == settings.llm_multimodal_model
        assert provider.classify_model == settings.llm_classify_model
        assert provider.vision_counter_enabled == settings.llm_vision_counter_enabled
        assert provider.multimodal_retry_enabled == settings.llm_multimodal_retry_enabled


class TestGetProviderOverride:
    def test_base_url_and_api_key_override(self) -> None:
        req = _fake_request(
            {
                "X-LLM-Base-URL": "https://api.deepseek.com",
                "X-LLM-API-Key": "sk-deepseek-secret",
            }
        )
        provider = get_provider(req)
        assert provider.api_base == "https://api.deepseek.com"
        assert provider.api_key == "sk-deepseek-secret"
        # Дефолты сохраняются для остальных параметров.
        assert provider.extract_model == settings.llm_extract_model

    def test_models_override(self) -> None:
        req = _fake_request(
            {
                "X-LLM-Extract-Model": "deepseek-chat",
                "X-LLM-Multimodal-Model": "gpt-4o",
                "X-LLM-Classify-Model": "gpt-4o-mini",
            }
        )
        provider = get_provider(req)
        assert provider.extract_model == "deepseek-chat"
        assert provider.multimodal_model == "gpt-4o"
        assert provider.classify_model == "gpt-4o-mini"

    def test_vision_counter_disable(self) -> None:
        req = _fake_request({"X-LLM-Vision-Counter-Enabled": "false"})
        provider = get_provider(req)
        assert provider.vision_counter_enabled is False

    def test_multimodal_retry_disable(self) -> None:
        req = _fake_request({"X-LLM-Multimodal-Retry-Enabled": "0"})
        provider = get_provider(req)
        assert provider.multimodal_retry_enabled is False

    def test_chat_url_uses_overridden_base(self) -> None:
        req = _fake_request({"X-LLM-Base-URL": "https://api.deepseek.com/"})
        provider = get_provider(req)
        # Trailing slash должен быть отрезан (rstrip).
        assert provider._chat_url() == "https://api.deepseek.com/v1/chat/completions"
        assert provider._models_url() == "https://api.deepseek.com/v1/models"


class TestEndpointAcceptsHeaders:
    """Smoke: реальный endpoint проксирует headers через get_provider.

    Используем dependency_override чтобы перехватить созданный per-request
    провайдер и проверить что его настройки = override из headers (без
    реальных HTTP-запросов в OpenAI).
    """

    def test_parse_spec_passes_override_to_provider(self) -> None:
        captured: dict[str, OpenAIVisionProvider] = {}

        async def _fake_complete(*args, **kwargs):  # type: ignore[no-untyped-def]
            # Будет вызван если LLM-pipeline всё-таки трогает provider —
            # для этого теста не нужен реальный response.
            from app.providers.base import TextCompletion

            return TextCompletion(content='{"items": [], "expected_count": 0}')

        # Override get_provider — capturing real provider. Сохраняем
        # сигнатуру (request: Request), иначе FastAPI воспринимает аргумент
        # как Body и валится с 400.
        def capturing_get_provider(request: Request):  # type: ignore[no-untyped-def]
            from app.deps import get_provider as real_get_provider

            p = real_get_provider(request)
            captured["provider"] = p
            # Подменяем сетевые методы no-op'ами чтобы не делать реальных calls.
            p.text_complete = _fake_complete  # type: ignore[method-assign]
            return p

        app.dependency_overrides[get_provider] = capturing_get_provider
        try:
            with TestClient(app) as client:
                pdf = _make_real_pdf(1)
                resp = client.post(
                    "/v1/parse/spec",
                    files={"file": ("test.pdf", io.BytesIO(pdf), "application/pdf")},
                    headers={
                        "X-API-Key": "test-key",
                        "X-LLM-Base-URL": "https://api.deepseek.com",
                        "X-LLM-API-Key": "sk-test-deepseek",
                        "X-LLM-Extract-Model": "deepseek-chat",
                    },
                )
            # Не настаиваем на конкретном статусе — pipeline может вернуть done/partial,
            # важно что provider создан с override.
            assert resp.status_code == 200
            assert "provider" in captured
            p = captured["provider"]
            assert p.api_base == "https://api.deepseek.com"
            assert p.api_key == "sk-test-deepseek"
            assert p.extract_model == "deepseek-chat"
            # llm_costs всегда присутствует в ответе (E18-1).
            body = resp.json()
            assert "llm_costs" in body
            assert "total_usd" in body["llm_costs"]
        finally:
            app.dependency_overrides.clear()
