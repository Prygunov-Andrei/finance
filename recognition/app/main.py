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


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging(settings.log_level)
    # E18-1: singleton provider убран — теперь per-request через
    # `app.deps.get_provider`. Прогрев connection pool потерян (как и сам pool
    # между запросами); компромисс ради override через X-LLM-* headers.
    app.state.provider_name = f"openai-{settings.llm_model}"
    yield


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
