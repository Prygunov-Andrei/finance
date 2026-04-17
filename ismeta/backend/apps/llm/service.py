"""LLM service — единый интерфейс для вызова LLM из ISMeta."""

import logging
from decimal import Decimal

from django.conf import settings

from .models import LLMUsage
from .providers.base import AbstractProvider
from .providers.cassette_provider import CassetteProvider
from .providers.mock_provider import MockProvider
from .providers.openai_provider import OpenAIProvider
from .types import LLMResponse

logger = logging.getLogger(__name__)

# Стоимость за 1M токенов (USD)
COST_RATES = {
    "gpt-4o": {"in": 2.50, "out": 10.00},
    "gpt-4o-mini": {"in": 0.15, "out": 0.60},
    "claude-sonnet-4-20250514": {"in": 3.00, "out": 15.00},
}
DEFAULT_RATE = {"in": 5.00, "out": 15.00}

# Конфигурация задач (из settings или дефолт)
DEFAULT_TASK_CONFIG = {
    "matching": {"provider": "openai", "model": "gpt-4o-mini", "max_tokens": 2000},
    "validation": {"provider": "openai", "model": "gpt-4o", "max_tokens": 4000},
    "chat": {"provider": "openai", "model": "gpt-4o", "max_tokens": 8000},
}


def _get_task_config(task_type: str) -> dict:
    tasks = getattr(settings, "ISMETA_LLM_TASKS", DEFAULT_TASK_CONFIG)
    return tasks.get(task_type, DEFAULT_TASK_CONFIG.get(task_type, DEFAULT_TASK_CONFIG["matching"]))


def _get_provider(provider_name: str) -> AbstractProvider:
    mode = getattr(settings, "ISMETA_LLM_MODE", "mock")
    if mode == "mock":
        return MockProvider()
    if mode == "cassette":
        return CassetteProvider()
    # real mode
    if provider_name == "openai":
        return OpenAIProvider()
    raise ValueError(f"Unknown LLM provider: {provider_name} (mode={mode})")


def calc_cost(model: str, tokens_in: int, tokens_out: int) -> Decimal:
    """Публичный API: стоимость вызова в USD."""
    rates = COST_RATES.get(model, DEFAULT_RATE)
    cost = (tokens_in * rates["in"] + tokens_out * rates["out"]) / 1_000_000
    return Decimal(str(cost)).quantize(Decimal("0.000001"))


# Обратная совместимость (тесты ссылаются на _calc_cost)
_calc_cost = calc_cost


class LLMService:
    """Unified LLM gateway для ISMeta."""

    def __init__(self, workspace_id: str, task_type: str, estimate_id: str | None = None):
        self.workspace_id = workspace_id
        self.task_type = task_type
        self.estimate_id = estimate_id
        self._config = _get_task_config(task_type)
        self._provider = _get_provider(self._config["provider"])

    def complete_sync(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        model: str | None = None,
    ) -> LLMResponse:
        """Синхронный вызов LLM. Записывает usage."""
        model = model or self._config["model"]
        max_tokens = self._config.get("max_tokens", 2000)

        response = self._provider.complete(
            messages=messages,
            model=model,
            max_tokens=max_tokens,
            tools=tools,
        )

        cost = _calc_cost(model, response.tokens_in, response.tokens_out)

        LLMUsage.objects.create(
            workspace_id=self.workspace_id,
            task_type=self.task_type,
            provider=self._config["provider"],
            model=model,
            tokens_in=response.tokens_in,
            tokens_out=response.tokens_out,
            cost_usd=cost,
            latency_ms=response.latency_ms,
            estimate_id=self.estimate_id,
        )

        logger.info(
            "LLM call: task=%s model=%s in=%d out=%d cost=$%.6f latency=%dms",
            self.task_type, model, response.tokens_in, response.tokens_out, cost, response.latency_ms,
        )

        return response
