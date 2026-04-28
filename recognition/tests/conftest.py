"""Shared fixtures for recognition tests."""

import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("RECOGNITION_API_KEY", "test-key")
# TD-04: LLM_API_KEY — основной env var. OPENAI_API_KEY оставлен как
# deprecated alias (settings._resolve_api_key подхватит).
os.environ.setdefault("LLM_API_KEY", "sk-test")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")

from app.deps import get_provider  # noqa: E402
from app.main import app  # noqa: E402
from app.providers.base import BaseLLMProvider  # noqa: E402


class _InertProvider(BaseLLMProvider):
    """Default test provider — raises if hit. Tests that need responses override via fixture."""

    async def vision_complete(self, image_b64: str, prompt: str) -> str:  # noqa: ARG002
        raise RuntimeError("provider not configured in this test")

    async def aclose(self) -> None:
        return None


@pytest.fixture()
def inert_provider() -> BaseLLMProvider:
    return _InertProvider()


@pytest.fixture()
def client(inert_provider: BaseLLMProvider):
    app.dependency_overrides[get_provider] = lambda: inert_provider
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers() -> dict[str, str]:
    return {"X-API-Key": "test-key"}
