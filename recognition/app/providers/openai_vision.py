"""OpenAI Vision provider (async, with retry on 429/5xx).

E15.04 — расширен `text_complete` для column-aware LLM-нормализации:
text-in → JSON-out на gpt-4o-mini, без vision-payload (раз в 6× дешевле
+ 3-5× быстрее vision-роута).
"""

import asyncio
import logging

import httpx

from ..api.errors import LLMUnavailableError
from ..config import settings
from .base import BaseLLMProvider, TextCompletion

logger = logging.getLogger(__name__)

OPENAI_URL = "https://api.openai.com/v1/chat/completions"


class OpenAIVisionProvider(BaseLLMProvider):
    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self.api_key = api_key if api_key is not None else settings.openai_api_key
        self.model = model or settings.llm_model
        self._client = httpx.AsyncClient(timeout=60.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def text_complete(
        self,
        prompt: str,
        *,
        max_tokens: int | None = None,
        temperature: float = 0.0,
    ) -> TextCompletion:
        """Text completion для column-aware нормализации (E15.04).

        Контракт: prompt должен содержать инструкцию выдать строгий JSON.
        Включён `response_format=json_object` (см. комментарий в
        vision_complete про DEV-BACKLOG #10) — обязательно нужно слово
        "json"/"JSON" в промпте, иначе OpenAI откажет.

        temperature=0 — детерминизм для golden-теста.
        """
        payload = {
            "model": self.model,
            "response_format": {"type": "json_object"},
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens or settings.llm_max_tokens,
        }
        data = await self._post_with_retry(payload)
        usage = data.get("usage") or {}
        return TextCompletion(
            content=str(data["choices"][0]["message"]["content"]),
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
        )

    async def vision_complete(self, image_b64: str, prompt: str) -> str:
        # response_format=json_object — OpenAI JSON mode: гарантирует валидный
        # JSON без markdown-обёртки. Без него gpt-4o-mini игнорирует инструкцию
        # «Ответь строго JSON» и оборачивает ответ в ```json ... ``` — json.loads
        # падает с "Expecting value: line 1 column 1 (char 0)".
        # Обнаружено на live PDF-прогоне 2026-04-21, DEV-BACKLOG #10.
        # Требование OpenAI: хотя бы одно упоминание "json"/"JSON" в messages.
        # Наши prompts уже содержат "Ответь строго JSON", поэтому безопасно.
        payload = {
            "model": self.model,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                        },
                    ],
                }
            ],
            "max_tokens": settings.llm_max_tokens,
        }
        data = await self._post_with_retry(payload)
        return str(data["choices"][0]["message"]["content"])

    async def _post_with_retry(self, payload: dict) -> dict:
        """POST в OpenAI с retry на 429/5xx и сетевых ошибках (общий код
        для vision_complete и text_complete)."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                resp = await self._client.post(OPENAI_URL, headers=headers, json=payload)
            except httpx.HTTPError as e:
                last_exc = e
                logger.warning(
                    "openai request failed", extra={"attempt": attempt, "error": str(e)}
                )
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise LLMUnavailableError(detail=f"network error: {e}") from e

            if resp.status_code == 429 or resp.status_code >= 500:
                logger.warning(
                    "openai retryable status",
                    extra={"attempt": attempt, "status_code": resp.status_code},
                )
                last_exc = httpx.HTTPStatusError(
                    f"status {resp.status_code}", request=resp.request, response=resp
                )
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                    continue
                retry_after = _parse_retry_after(resp.headers.get("Retry-After"))
                raise LLMUnavailableError(
                    detail=f"upstream status {resp.status_code}",
                    retry_after_sec=retry_after,
                )

            resp.raise_for_status()
            return resp.json()  # type: ignore[no-any-return]

        assert last_exc is not None
        raise LLMUnavailableError(detail=str(last_exc))


def _parse_retry_after(value: str | None) -> int:
    if not value:
        return 30
    try:
        return max(1, int(float(value)))
    except ValueError:
        return 30
