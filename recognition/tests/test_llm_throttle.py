"""Tests for E19-1: process-level LLM concurrency semaphore."""

from __future__ import annotations

import asyncio

import pytest

from app.services import llm_throttle


@pytest.fixture(autouse=True)
async def _reset_throttle() -> None:
    """Каждый тест получает свежий семафор. Тесты не должны видеть
    состояние, оставленное соседями."""
    await llm_throttle.reset_for_tests()
    yield
    await llm_throttle.reset_for_tests()


@pytest.mark.asyncio
async def test_lazy_creation_uses_settings_default() -> None:
    from app.config import settings

    sema = await llm_throttle.get_global_semaphore()
    assert isinstance(sema, asyncio.Semaphore)
    assert llm_throttle.get_capacity() == settings.llm_global_concurrency


@pytest.mark.asyncio
async def test_set_capacity_recreates_semaphore() -> None:
    sema_a = await llm_throttle.get_global_semaphore()
    await llm_throttle.set_capacity(7)
    sema_b = await llm_throttle.get_global_semaphore()
    assert sema_a is not sema_b
    assert llm_throttle.get_capacity() == 7


@pytest.mark.asyncio
async def test_semaphore_caps_concurrent_holders() -> None:
    """capacity=2 → не более двух одновременных acquire'ов; третий ждёт."""
    await llm_throttle.set_capacity(2)
    sema = await llm_throttle.get_global_semaphore()

    in_flight = 0
    peak = 0
    started = asyncio.Event()
    release = asyncio.Event()

    async def worker(idx: int) -> None:
        nonlocal in_flight, peak
        async with sema:
            in_flight += 1
            peak = max(peak, in_flight)
            if idx == 1:
                started.set()
            await release.wait()
            in_flight -= 1

    tasks = [asyncio.create_task(worker(i)) for i in range(5)]
    # Дождаться что первые два «вошли», и проверить что больше двух
    # параллельно не работает.
    await started.wait()
    await asyncio.sleep(0.05)
    assert peak == 2

    release.set()
    await asyncio.gather(*tasks)
    assert peak == 2  # больше не выросло после release


@pytest.mark.asyncio
async def test_returns_same_semaphore_across_calls() -> None:
    """Без set_capacity — лениво созданный семафор шарится между вызовами."""
    s1 = await llm_throttle.get_global_semaphore()
    s2 = await llm_throttle.get_global_semaphore()
    assert s1 is s2


@pytest.mark.asyncio
async def test_provider_uses_global_throttle(monkeypatch: pytest.MonkeyPatch) -> None:
    """OpenAIVisionProvider._post_with_retry должен гейтить request через
    глобальный семафор (E19-1). Если capacity=1 — два конкурентных
    вызова сериализуются."""
    from app.providers.openai_vision import OpenAIVisionProvider

    await llm_throttle.set_capacity(1)

    in_flight = 0
    peak = 0

    async def fake_unguarded(self: OpenAIVisionProvider, payload: dict) -> dict:
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.05)
        in_flight -= 1
        return {"choices": [{"message": {"content": "{}"}}], "usage": {}}

    monkeypatch.setattr(
        OpenAIVisionProvider,
        "_post_with_retry_unguarded",
        fake_unguarded,
    )

    provider = OpenAIVisionProvider(api_key="sk-test", model="gpt-4o-mini")
    try:
        await asyncio.gather(
            provider._post_with_retry({"model": "x"}),
            provider._post_with_retry({"model": "y"}),
            provider._post_with_retry({"model": "z"}),
        )
    finally:
        await provider.aclose()

    assert peak == 1
