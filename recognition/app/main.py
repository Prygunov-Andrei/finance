"""Recognition Service — FastAPI entrypoint."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api.errors import register_error_handlers
from .api.health import router as health_router
from .api.parse import router as parse_router
from .config import settings
from .logging_setup import configure_logging
from .middleware import request_id_middleware
from .providers.openai_vision import OpenAIVisionProvider


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging(settings.log_level)
    provider = OpenAIVisionProvider()
    app.state.provider = provider
    app.state.provider_name = f"openai-{settings.llm_model}"
    # TD-01: прогрев TCP/TLS/HTTP/2 connection pool к OpenAI. Первый
    # spec/invoice-parse запрос не платит 4-8с на handshake. Ошибка
    # non-fatal — если нет API key / сети в тестах, сервис всё равно
    # стартует.
    await provider.warm_up()
    try:
        yield
    finally:
        await provider.aclose()


app = FastAPI(
    title="ISMeta Recognition Service",
    description="PDF → structured items via LLM Vision",
    version="0.1.0",
    lifespan=lifespan,
)

app.middleware("http")(request_id_middleware)
register_error_handlers(app)
app.include_router(health_router)
app.include_router(parse_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=settings.port)
