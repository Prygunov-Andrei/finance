"""Configuration via pydantic-settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    recognition_api_key: str = "dev-recognition-key-change-me"
    openai_api_key: str = ""
    log_level: str = "INFO"
    max_file_size_mb: int = 50
    parse_timeout_seconds: int = 300
    llm_model: str = "gpt-4o-mini"
    llm_max_tokens: int = 4000
    # E15.04: column-aware text-layer pipeline → LLM normalization. False
    # отключает LLM-нормализацию и оставляет только legacy line-based
    # `parse_page_items` (используется в тестах без OPENAI_API_KEY и для
    # быстрого rollback в случае проблем).
    llm_normalize_enabled: bool = True
    llm_normalize_max_tokens: int = 6000  # достаточно для ~30 items/стр в JSON
    dpi: int = 200
    max_page_retries: int = 2
    port: int = 8003

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
