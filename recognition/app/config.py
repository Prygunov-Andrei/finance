"""Configuration via pydantic-settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    recognition_api_key: str = "dev-recognition-key-change-me"
    openai_api_key: str = ""
    # OpenAI-compatible API base URL. Default = OpenAI; override на DeepSeek
    # («https://api.deepseek.com») или другой OpenAI-совместимый endpoint.
    openai_api_base: str = "https://api.openai.com"
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
    # DeepSeek V4 thinking mode: "" (не передавать, использовать дефолт модели),
    # "disabled" (быстрый non-thinking, экономит max_tokens для content),
    # "enabled" (reasoning_content генерится перед content — нужно поднять
    # llm_normalize_max_tokens до 16000-32000). Применяется только к моделям
    # начинающимся с "deepseek-v4-".
    llm_thinking_mode: str = ""
    llm_thinking_effort: str = ""  # "" / "high" / "max"
    # TD-04: детерминизм run-to-run. temperature=0 уже стоит на всех endpoints,
    # но без seed и top_p OpenAI/DeepSeek всё равно сэмплируют из top tokens →
    # разные runs дают ±1 phantom item (Spec-4 стр 10/87 split «Дроссель клапан
    # 400х300» на 2 row'а). seed=42 — фиксированный default; top_p=0.0 локает
    # выбор лучшего token (greedy) поверх temperature=0. Известное ограничение:
    # DeepSeek thinking_mode=enabled может игнорировать seed (CoT-stochasticity);
    # см. docs/recognition/known-issues.md.
    llm_seed: int = 42
    llm_top_p: float = 0.0
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
    # E15-06 it3 hotfix: ограничение на concurrent OpenAI calls. На больших
    # PDF (19+ стр) 19 text + 19 vision + retries = 38-60 одновременных
    # запросов к OpenAI API → rate-limit 429 даже на gpt-4o. Semaphore
    # внутри SpecParser гейтит jobs. 6 — безопасный default для tier-1 API.
    llm_max_concurrency: int = 6
    # E19-1: process-level semaphore — суммарный потолок одновременных LLM-
    # вызовов по всем running async-job'ам. llm_max_concurrency — per-job
    # внутри одного PDF. С двумя параллельными jobs (default backend queue)
    # без global cap получаем 2 × 6 = 12 одновременных calls и упираемся в
    # rate-limit DeepSeek/OpenAI. 4 — безопасный default, поднимаем через .env.
    llm_global_concurrency: int = 4
    # E19-1: timeout на POST callback'а recognition → backend. Recognition не
    # ретраит: если backend упал — лог warning, parse продолжается.
    async_callback_timeout: float = 10.0
    dpi: int = 200
    max_page_retries: int = 2
    port: int = 8003

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
