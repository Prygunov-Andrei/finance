"""Helper для построения X-LLM-* headers из LLMProfile (E18-2).

Используется pdf_views (sync flow) и recognition_jobs/worker (async flow).
"""

from __future__ import annotations

from .models import LLMProfile


def build_llm_headers(profile: LLMProfile) -> dict[str, str]:
    """Построить X-LLM-* headers для recognition из профиля.

    Расшифровывает api_key только в момент вызова — plain текст не должен
    оставаться в process state дольше необходимого.

    Если multimodal_model / classify_model не заданы — fallback на
    extract_model (recognition тогда использует одну модель для всех bucket'ов).
    """
    extract = profile.extract_model
    return {
        "X-LLM-Base-URL": profile.base_url,
        "X-LLM-API-Key": profile.get_api_key(),
        "X-LLM-Extract-Model": extract,
        "X-LLM-Multimodal-Model": profile.multimodal_model or extract,
        "X-LLM-Classify-Model": profile.classify_model or extract,
        "X-LLM-Vision-Counter-Enabled": "true" if profile.vision_supported else "false",
        "X-LLM-Multimodal-Retry-Enabled": "true" if profile.vision_supported else "false",
    }
