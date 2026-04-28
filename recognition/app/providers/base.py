"""Base LLM provider interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TextCompletion:
    """Результат text_complete: содержимое + телеметрия по токенам.

    Используется для ведения LLM-метрик (tokens in/out, cost per document)
    в SpecParser → QA отчёт. Поля prompt_tokens / completion_tokens могут
    быть 0 если провайдер не вернул usage (test-стабы и т.п.).

    `cached_tokens` (TD-01) — сколько prompt-токенов попало в OpenAI prompt
    cache (prompt_tokens_details.cached_tokens). Эти токены тарифицируются
    × 0.5 на gpt-4o family (ephemeral 5-минутный cache). 0 = cache miss или
    провайдер без prompt caching.
    """

    content: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0


@dataclass
class UsageEntry:
    """E18-1: единичная запись в usage_log провайдера. Bucket задаёт тип
    LLM-вызова — extract (text-only normalize), multimodal (vision/multimodal
    retry, vision_counter), classify (legacy Vision-fallback на сканах).

    Parser в _finalize читает usage_log и группирует по bucket → строит
    LLMCosts (см. schemas/spec.py).
    """

    bucket: str  # "extract" | "multimodal" | "classify"
    model: str
    prompt_tokens: int
    completion_tokens: int
    cached_tokens: int = 0


class BaseLLMProvider(ABC):
    def __init__(self) -> None:
        # E18-1: usage_log — list of UsageEntry, per-request lifecycle.
        # Provider создаётся в `app/deps.get_provider` per-request, поэтому
        # log изолирован между запросами (один parser = один provider).
        self.usage_log: list[UsageEntry] = []

    def _record_usage(
        self,
        bucket: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        cached_tokens: int = 0,
    ) -> None:
        self.usage_log.append(
            UsageEntry(
                bucket=bucket,
                model=model,
                prompt_tokens=int(prompt_tokens or 0),
                completion_tokens=int(completion_tokens or 0),
                cached_tokens=int(cached_tokens or 0),
            )
        )

    @abstractmethod
    async def vision_complete(self, image_b64: str, prompt: str) -> str:
        """Send image + prompt to LLM Vision, return text response."""
        ...

    async def text_complete(
        self,
        prompt: str,
        *,
        max_tokens: int | None = None,
        temperature: float = 0.0,
        system_prompt: str | None = None,
    ) -> TextCompletion:
        """Text-in → text-out completion. Используется для column-aware
        нормализации структурированных rows (E15.04, gpt-4o с it2).

        Default-имплементация падает с NotImplementedError — конкретный
        провайдер обязан переопределить, если планирует обрабатывать
        текстовые задачи. Возвращаем `TextCompletion` (а не голый str)
        чтобы пробросить usage-метрики наверх.
        """
        raise NotImplementedError(
            f"{type(self).__name__} does not implement text_complete"
        )

    async def multimodal_complete(
        self,
        prompt: str,
        *,
        image_b64: str,
        max_tokens: int | None = None,
        temperature: float = 0.0,
        system_prompt: str | None = None,
    ) -> TextCompletion:
        """E15.05 it2 (R27) — text-prompt + PNG image → structured JSON.

        Отличается от `vision_complete` тем, что возвращает `TextCompletion`
        с usage-метриками (для корректного cost tracking), принимает
        max_tokens/temperature kwargs и ДОЛЖЕН использовать vision-качественную
        модель (gpt-4o full, не mini) — Phase 2 retry после низкого confidence
        требует максимум доступного качества.

        Default — NotImplementedError: провайдер обязан переопределить для
        работы multimodal-fallback пути в SpecParser.
        """
        raise NotImplementedError(
            f"{type(self).__name__} does not implement multimodal_complete"
        )

    async def aclose(self) -> None:  # pragma: no cover - default no-op
        return None
