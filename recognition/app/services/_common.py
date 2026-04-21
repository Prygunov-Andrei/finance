"""Shared helpers for PDF parsers (spec / invoice / quote)."""

import json
import logging
from collections.abc import Callable, Hashable

from ..config import settings
from ..providers.base import BaseLLMProvider
from ..schemas.spec import PagesStats

logger = logging.getLogger(__name__)


def _strip_markdown_fence(response: str) -> str:
    """Снять markdown code fence, если LLM вернул ```json ... ``` вместо чистого JSON.

    OpenAI JSON mode (`response_format={"type":"json_object"}`) это исключает,
    но мы оставляем defensive-strip на случай других провайдеров или падения
    JSON mode. См. DEV-BACKLOG #10.
    """
    s = response.strip()
    if not s.startswith("```"):
        return s
    # убрать открывающий ```[json|...] и закрывающий ```
    # строка может быть: ```json\n{...}\n```  или  ```\n{...}\n```
    if "\n" in s:
        first_newline = s.index("\n")
        s = s[first_newline + 1 :]
    else:
        s = s[3:]
    if s.rstrip().endswith("```"):
        s = s.rstrip()[:-3]
    return s.strip()


async def vision_json(
    provider: BaseLLMProvider,
    image_b64: str,
    prompt: str,
    *,
    retries: int | None = None,
    log_ctx: str = "vision_json",
) -> dict:
    """Call provider.vision_complete and parse JSON response with retry.

    Returns parsed dict on success. Raises ValueError after `retries` failed attempts.
    Defensive: снимаем markdown code fence если LLM его всё равно добавил
    (см. DEV-BACKLOG #10 — gpt-4o-mini иногда игнорирует response_format).
    """
    attempts = retries if retries is not None else settings.max_page_retries
    last_exc: Exception | None = None
    for attempt in range(attempts):
        try:
            response = await provider.vision_complete(image_b64, prompt)
            response = _strip_markdown_fence(response)
            parsed = json.loads(response)
            if not isinstance(parsed, dict):
                raise ValueError(f"expected JSON object, got {type(parsed).__name__}")
            return parsed
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            last_exc = e
            logger.warning(
                "vision_json attempt failed",
                extra={"log_ctx": log_ctx, "attempt": attempt + 1, "error": str(e)},
            )
    raise ValueError(f"{log_ctx}: {last_exc}")


def determine_status[T](errors: list[str], items: list[T]) -> str:
    if errors and items:
        return "partial"
    if errors and not items:
        return "error"
    return "done"


def pages_stats(total: int, processed: int, skipped: int, error_count: int) -> PagesStats:
    return PagesStats(total=total, processed=processed, skipped=skipped, error=error_count)


def dedupe_by_key[T](
    items: list[T],
    key_fn: Callable[[T], Hashable],
    merge_fn: Callable[[T, T], None],
) -> list[T]:
    """Collapse items sharing `key_fn(item)`. `merge_fn(target, duplicate)` mutates target."""
    seen: dict[Hashable, int] = {}
    result: list[T] = []
    for item in items:
        key = key_fn(item)
        if key in seen:
            merge_fn(result[seen[key]], item)
        else:
            seen[key] = len(result)
            result.append(item)
    return result
