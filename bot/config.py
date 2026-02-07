from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Настройки Telegram-бота."""

    BOT_TOKEN: str = ""
    WEBHOOK_URL: str = ""  # https://your-domain.com/bot/webhook
    WEBHOOK_PATH: str = "/bot/webhook"
    WEBAPP_HOST: str = "0.0.0.0"
    WEBAPP_PORT: int = 8081

    # PostgreSQL (та же база что у Django)
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "finans_assistant"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"

    # Redis (для Celery)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Mini App URL
    MINI_APP_URL: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
