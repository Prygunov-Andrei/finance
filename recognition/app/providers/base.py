"""Base LLM provider interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TextCompletion:
    """Результат text_complete: содержимое + телеметрия по токенам.

    Используется для ведения LLM-метрик (tokens in/out, cost per document)
    в SpecParser → QA отчёт. Поля prompt_tokens / completion_tokens могут
    быть 0 если провайдер не вернул usage (test-стабы и т.п.).
    """

    content: str
    prompt_tokens: int = 0
    completion_tokens: int = 0


class BaseLLMProvider(ABC):
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
    ) -> TextCompletion:
        """Text-in → text-out completion. Используется для column-aware
        нормализации структурированных rows (E15.04, gpt-4o-mini).

        Default-имплементация падает с NotImplementedError — конкретный
        провайдер обязан переопределить, если планирует обрабатывать
        текстовые задачи. Возвращаем `TextCompletion` (а не голый str)
        чтобы пробросить usage-метрики наверх.
        """
        raise NotImplementedError(
            f"{type(self).__name__} does not implement text_complete"
        )

    async def aclose(self) -> None:  # pragma: no cover - default no-op
        return None
