"""Configuration via pydantic-settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    recognition_api_key: str = "dev-recognition-key-change-me"
    openai_api_key: str = ""
    log_level: str = "INFO"
    max_file_size_mb: int = 50
    parse_timeout_seconds: int = 300
    # E15.05 it2: выделяем модели по задачам. По решению PO (QA-сессия 4)
    # extract гонит gpt-4o full — качество на ЕСКД-таблицах критичнее
    # цены/скорости. classify остаётся mini (задача простая, вызывается
    # только на Vision-роуте).
    llm_model: str = "gpt-4o-mini"  # backward-compat, deprecated в favor llm_*_model
    llm_extract_model: str = "gpt-4o"
    llm_classify_model: str = "gpt-4o-mini"
    llm_multimodal_model: str = "gpt-4o"
    llm_max_tokens: int = 4000
    # E15.04: column-aware text-layer pipeline → LLM normalization. False
    # отключает LLM-нормализацию и оставляет только legacy line-based
    # `parse_page_items` (используется в тестах без OPENAI_API_KEY и для
    # быстрого rollback в случае проблем).
    llm_normalize_enabled: bool = True
    llm_normalize_max_tokens: int = 6000  # достаточно для ~30 items/стр в JSON
    # E15.05 it2 (R27) — conditional multimodal Vision retry.
    llm_multimodal_retry_enabled: bool = True
    llm_multimodal_retry_threshold: float = 0.7
    # E15-06 (#52) — page-tail safety net. Если LLM сказала что видит N позиций,
    # а мы распарсили меньше — retry через multimodal. Tolerance подбирает PO.
    llm_expected_count_tolerance: int = 3
    # E15-06 it2 (#52/#9) — vision-based safety net. Отдельный cheap vision
    # call считает позиции по картинке страницы (независимо от bbox-rows).
    # Если vision_count - parsed ≥ tolerance → triggered multimodal retry.
    # Закрывает хвостовые потери, которые expected_count на bbox rows не видит.
    llm_vision_counter_enabled: bool = True
    llm_vision_count_tolerance: int = 2
    dpi: int = 200
    max_page_retries: int = 2
    port: int = 8003

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
