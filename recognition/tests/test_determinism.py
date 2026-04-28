"""TD-04: payload должен содержать seed + top_p для run-to-run детерминизма.

Полный repeatability test (job × 2 = identical items) требует live LLM —
здесь мы проверяем только что provider пробрасывает determinism-params в
payload. На уровне модели гарантия даётся OpenAI/DeepSeek API контрактом
(seed=int + top_p=0 + temperature=0 → deterministic).

Известное ограничение DeepSeek thinking_mode — описано в
ismeta/docs/recognition/known-issues.md.
"""

from __future__ import annotations

import pytest

from app.config import settings
from app.providers.openai_vision import OpenAIVisionProvider


@pytest.mark.asyncio
async def test_text_complete_payload_has_seed_and_top_p(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    async def fake_unguarded(self: OpenAIVisionProvider, payload: dict) -> dict:
        captured.update(payload)
        return {
            "choices": [{"message": {"content": "{}"}}],
            "usage": {},
        }

    monkeypatch.setattr(
        OpenAIVisionProvider,
        "_post_with_retry_unguarded",
        fake_unguarded,
    )
    provider = OpenAIVisionProvider(api_key="sk-test", model="gpt-4o-mini")
    try:
        await provider.text_complete("hi, ответь JSON {}")
    finally:
        await provider.aclose()

    assert "seed" in captured, "TD-04: seed must be present for determinism"
    assert captured["seed"] == settings.llm_seed
    assert "top_p" in captured, "TD-04: top_p must be present for determinism"
    assert captured["top_p"] == settings.llm_top_p
    assert captured.get("temperature") == 0.0


@pytest.mark.asyncio
async def test_vision_complete_payload_has_seed_and_top_p(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    async def fake_unguarded(self: OpenAIVisionProvider, payload: dict) -> dict:
        captured.update(payload)
        return {"choices": [{"message": {"content": "{}"}}], "usage": {}}

    monkeypatch.setattr(
        OpenAIVisionProvider,
        "_post_with_retry_unguarded",
        fake_unguarded,
    )
    provider = OpenAIVisionProvider(api_key="sk-test", model="gpt-4o-mini")
    try:
        await provider.vision_complete("base64data", "JSON prompt")
    finally:
        await provider.aclose()

    assert captured["seed"] == settings.llm_seed
    assert captured["top_p"] == settings.llm_top_p


@pytest.mark.asyncio
async def test_multimodal_complete_payload_has_seed_and_top_p(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    async def fake_unguarded(self: OpenAIVisionProvider, payload: dict) -> dict:
        captured.update(payload)
        return {"choices": [{"message": {"content": "{}"}}], "usage": {}}

    monkeypatch.setattr(
        OpenAIVisionProvider,
        "_post_with_retry_unguarded",
        fake_unguarded,
    )
    provider = OpenAIVisionProvider(api_key="sk-test", model="gpt-4o")
    try:
        await provider.multimodal_complete(
            "JSON prompt", image_b64="base64data"
        )
    finally:
        await provider.aclose()

    assert captured["seed"] == settings.llm_seed
    assert captured["top_p"] == settings.llm_top_p
    assert captured.get("temperature") == 0.0


def test_settings_have_determinism_defaults() -> None:
    """seed default = 42, top_p default = 0.0 (greedy)."""
    assert settings.llm_seed == 42
    assert settings.llm_top_p == 0.0
