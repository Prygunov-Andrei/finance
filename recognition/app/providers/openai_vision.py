"""OpenAI Vision provider (async, with retry on 429/5xx).

E15.04 — расширен `text_complete` для column-aware LLM-нормализации:
text-in → JSON-out.

E15.05 it2:
- `text_complete` переключён с gpt-4o-mini на gpt-4o full (settings.llm_extract_model)
  по решению PO — качество на ЕСКД-таблицах приоритет № 1.
- Добавлен `multimodal_complete` — text prompt + PNG image → JSON. Используется
  SpecParser'ом как Phase 2 retry при низком confidence (R27).
"""

import asyncio
import logging

import httpx

from ..api.errors import LLMUnavailableError
from ..config import settings
from .base import BaseLLMProvider, TextCompletion

logger = logging.getLogger(__name__)

OPENAI_URL = "https://api.openai.com/v1/chat/completions"


def _apply_max_tokens(payload: dict, max_tokens: int) -> None:
    """E15-06 it2 (A/B gpt-5.2): новые reasoning-модели gpt-5.x требуют
    `max_completion_tokens` вместо legacy `max_tokens` (последний считается
    «unsupported parameter» и даёт 400). gpt-4o принимает и то и другое.

    Простая проверка по префиксу модели — надёжнее whitelisting'а (OpenAI
    регулярно добавляет новые варианты gpt-5.x).
    """
    model = str(payload.get("model") or "")
    if model.startswith(("gpt-5", "o1", "o3", "o4")):
        payload["max_completion_tokens"] = max_tokens
    else:
        payload["max_tokens"] = max_tokens


class OpenAIVisionProvider(BaseLLMProvider):
    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self.api_key = api_key if api_key is not None else settings.openai_api_key
        # `model` kwarg оставлен для backward-compat (старые тесты); в runtime
        # text_complete/vision/multimodal читают settings.llm_*_model напрямую.
        self.model = model or settings.llm_model
        # TD-01: HTTP/2 + persistent connections. Ключевой вин — один TCP +
        # TLS handshake на все 9+ LLM-calls одного документа (вместо 9
        # независимых холодных соединений). `keepalive_expiry=300` держит
        # соединение живым 5 минут idle (совпадает с OpenAI prompt-cache
        # TTL — логично прогревать то что потом всё равно сбросит TLS).
        self._client = httpx.AsyncClient(
            timeout=120.0,
            http2=True,
            limits=httpx.Limits(
                max_connections=10,
                max_keepalive_connections=5,
                keepalive_expiry=300,
            ),
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def warm_up(self) -> None:
        """TD-01: прогрев TCP/TLS + HTTP/2 соединения к OpenAI.

        Один короткий GET /v1/models при FastAPI startup — прогревает
        connection pool, чтобы первый реальный spec/invoice-parse запрос
        не платил 4-8с на TLS handshake + HTTP/2 negotiation. Ошибки
        non-fatal: если нет сети/ключа — продолжаем, прогретый pool не
        критичен для корректности.
        """
        try:
            resp = await self._client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=10.0,
            )
            logger.info(
                "openai connection pool warmed up",
                extra={"status_code": resp.status_code},
            )
        except Exception as e:
            logger.warning("openai warm-up failed (non-fatal): %s", e)

    async def text_complete(
        self,
        prompt: str,
        *,
        max_tokens: int | None = None,
        temperature: float = 0.0,
        system_prompt: str | None = None,
    ) -> TextCompletion:
        """Text completion для column-aware нормализации.

        Контракт: prompt должен содержать инструкцию выдать строгий JSON.
        Включён `response_format=json_object` (см. комментарий в
        vision_complete про DEV-BACKLOG #10) — обязательно нужно слово
        "json"/"JSON" в промпте, иначе OpenAI откажет.

        Модель: `settings.llm_extract_model` (E15.05 it2 default = gpt-4o).
        temperature=0 — детерминизм для golden-теста.

        TD-01 (prompt caching): если `system_prompt` передан, идёт первым
        сообщением с role=system. OpenAI gpt-4o автоматически кэширует
        одинаковые prefix-блоки ≥1024 токенов (ephemeral ~5 мин) —
        кэшированные input-tokens тарифицируются × 0.5. Проверить hit
        можно через `cached_tokens` в TextCompletion.
        """
        messages: list[dict] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        payload = {
            "model": settings.llm_extract_model,
            "response_format": {"type": "json_object"},
            "temperature": temperature,
            "messages": messages,
        }
        _apply_max_tokens(payload, max_tokens or settings.llm_max_tokens)
        data = await self._post_with_retry(payload)
        usage = data.get("usage") or {}
        cached = (usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0
        return TextCompletion(
            content=str(data["choices"][0]["message"]["content"]),
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            cached_tokens=int(cached),
        )

    async def vision_complete(self, image_b64: str, prompt: str) -> str:
        # response_format=json_object — OpenAI JSON mode: гарантирует валидный
        # JSON без markdown-обёртки. Без него gpt-4o-mini игнорирует инструкцию
        # «Ответь строго JSON» и оборачивает ответ в ```json ... ``` — json.loads
        # падает с "Expecting value: line 1 column 1 (char 0)".
        # Обнаружено на live PDF-прогоне 2026-04-21, DEV-BACKLOG #10.
        # Требование OpenAI: хотя бы одно упоминание "json"/"JSON" в messages.
        # Наши prompts уже содержат "Ответь строго JSON", поэтому безопасно.
        #
        # Этот метод используется legacy Vision-route (classify_page /
        # extract_items) — на нём оставляем classify-модель (mini).
        payload = {
            "model": settings.llm_classify_model,
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
        }
        _apply_max_tokens(payload, settings.llm_max_tokens)
        data = await self._post_with_retry(payload)
        return str(data["choices"][0]["message"]["content"])

    async def multimodal_complete(
        self,
        prompt: str,
        *,
        image_b64: str,
        max_tokens: int | None = None,
        temperature: float = 0.0,
        system_prompt: str | None = None,
    ) -> TextCompletion:
        """E15.05 it2 (R27) — Phase 2 retry: prompt + PNG → structured JSON.

        Всегда gpt-4o full (settings.llm_multimodal_model) — картинка + длинный
        prompt требуют максимума доступного качества. `detail=high` заставляет
        OpenAI обработать изображение в полном разрешении (важно для ЕСКД-шапки
        с мелким 8pt шрифтом).

        Возвращает `TextCompletion` с usage — SpecParser считает multimodal
        tokens в отдельной статье статистики.

        TD-01: `system_prompt` — то же поведение что в text_complete.
        """
        messages: list[dict] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_b64}",
                            "detail": "high",
                        },
                    },
                ],
            }
        )
        payload = {
            "model": settings.llm_multimodal_model,
            "response_format": {"type": "json_object"},
            "temperature": temperature,
            "messages": messages,
        }
        _apply_max_tokens(
            payload, max_tokens or settings.llm_normalize_max_tokens
        )
        data = await self._post_with_retry(payload)
        usage = data.get("usage") or {}
        cached = (usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0
        return TextCompletion(
            content=str(data["choices"][0]["message"]["content"]),
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            cached_tokens=int(cached),
        )

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
