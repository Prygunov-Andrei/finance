"""GET /v1/healthz — per specs/15-recognition-api.md §4."""

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/v1/healthz")
async def healthz(request: Request) -> dict[str, str]:
    app = request.app
    provider_name = getattr(app.state, "provider_name", "unknown")
    return {
        "status": "ok",
        "version": app.version,
        "provider": provider_name,
    }
