"""X-API-Key authentication dependency."""

from fastapi import Request

from .api.errors import InvalidApiKeyError
from .config import settings


async def verify_api_key(request: Request) -> None:
    key = request.headers.get("X-API-Key", "")
    if not key or key != settings.recognition_api_key:
        raise InvalidApiKeyError()
