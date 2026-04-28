"""FastAPI dependencies for recognition service.

E18-1: per-request LLM provider override через X-LLM-* headers.

Master spec: ismeta/specs/16-llm-profiles.md.

Заголовки:
- X-LLM-Base-URL: OpenAI-совместимый base URL (https://api.openai.com,
  https://api.deepseek.com и т.п.). Default — settings.openai_api_base.
- X-LLM-API-Key: API ключ. Default — settings.llm_api_key.
- X-LLM-Extract-Model: текстовая модель для column-aware normalize. Default —
  settings.llm_extract_model.
- X-LLM-Multimodal-Model: vision-модель для multimodal retry / vision_counter.
  Default — settings.llm_multimodal_model.
- X-LLM-Classify-Model: модель для legacy Vision-fallback (classify/extract
  на сканах). Default — settings.llm_classify_model.
- X-LLM-Vision-Counter-Enabled: "true"/"false"/"1"/"0". Отключает cheap
  vision-counter safety-net (для providers без vision). Default —
  settings.llm_vision_counter_enabled.
- X-LLM-Multimodal-Retry-Enabled: аналогично — отключает Phase 2 retry.
  Default — settings.llm_multimodal_retry_enabled.

Если ни один header не передан — поведение полностью идентично singleton
провайдеру до E18-1 (defaults из env).
"""

from __future__ import annotations

from fastapi import Request

from .config import settings
from .providers.base import BaseLLMProvider
from .providers.openai_vision import OpenAIVisionProvider


def _bool_header(request: Request, header: str, default: bool) -> bool:
    """Парсер boolean-header'а: "true"/"1" → True, "false"/"0" → False,
    отсутствие/мусор → default. Регистронезависимо."""
    raw = request.headers.get(header)
    if raw is None:
        return default
    val = raw.strip().lower()
    if val in {"true", "1", "yes", "on"}:
        return True
    if val in {"false", "0", "no", "off"}:
        return False
    return default


def get_provider(request: Request) -> BaseLLMProvider:
    """Per-request LLM provider. Если переданы X-LLM-* headers — создаёт
    провайдер с override; иначе — provider с defaults из settings.

    Lifecycle: caller (endpoint / background task) обязан вызвать
    `await provider.aclose()` после использования (httpx.AsyncClient
    держит TCP/TLS соединения).
    """
    base_url = request.headers.get("X-LLM-Base-URL") or settings.openai_api_base
    api_key = request.headers.get("X-LLM-API-Key") or settings.llm_api_key
    extract_model = (
        request.headers.get("X-LLM-Extract-Model") or settings.llm_extract_model
    )
    multimodal_model = (
        request.headers.get("X-LLM-Multimodal-Model") or settings.llm_multimodal_model
    )
    classify_model = (
        request.headers.get("X-LLM-Classify-Model") or settings.llm_classify_model
    )
    vision_counter = _bool_header(
        request,
        "X-LLM-Vision-Counter-Enabled",
        settings.llm_vision_counter_enabled,
    )
    multimodal_retry = _bool_header(
        request,
        "X-LLM-Multimodal-Retry-Enabled",
        settings.llm_multimodal_retry_enabled,
    )
    return OpenAIVisionProvider(
        api_key=api_key,
        api_base=base_url,
        extract_model=extract_model,
        multimodal_model=multimodal_model,
        classify_model=classify_model,
        vision_counter_enabled=vision_counter,
        multimodal_retry_enabled=multimodal_retry,
    )
