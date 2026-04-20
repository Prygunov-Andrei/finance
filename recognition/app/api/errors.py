"""Exception classes and handlers — JSON error responses per specs/15-recognition-api.md §5."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class RecognitionError(Exception):
    """Base class for domain errors with a fixed JSON body."""

    status_code: int = 500
    body: dict[str, Any] = {"error": "internal_error"}

    def __init__(self, detail: str | None = None, **extra: Any) -> None:
        super().__init__(detail or self.body.get("error", ""))
        self.detail = detail
        self.extra = extra

    def as_body(self) -> dict[str, Any]:
        body: dict[str, Any] = dict(self.body)
        if self.detail is not None:
            body["detail"] = self.detail
        body.update(self.extra)
        return body


class InvalidFileError(RecognitionError):
    status_code = 400
    body = {"error": "invalid_file"}


class InvalidApiKeyError(RecognitionError):
    status_code = 401
    body = {"error": "invalid_api_key"}


class FileTooLargeError(RecognitionError):
    status_code = 413
    body = {"error": "file_too_large"}

    def __init__(self, limit_mb: int) -> None:
        super().__init__(limit_mb=limit_mb)


class UnsupportedMediaTypeError(RecognitionError):
    status_code = 415
    body = {"error": "unsupported_media_type"}


class ParseFailedError(RecognitionError):
    status_code = 422
    body = {"error": "parse_failed"}


class LLMUnavailableError(RecognitionError):
    status_code = 502
    body = {"error": "llm_unavailable"}

    def __init__(self, detail: str | None = None, retry_after_sec: int = 30) -> None:
        super().__init__(detail=detail, retry_after_sec=retry_after_sec)


async def recognition_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RecognitionError)
    return JSONResponse(status_code=exc.status_code, content=exc.as_body())


async def validation_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return JSONResponse(
        status_code=400,
        content={"error": "invalid_file", "detail": "missing or invalid file field"},
    )


async def http_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    if exc.status_code == 401:
        return JSONResponse(status_code=401, content={"error": "invalid_api_key"})
    detail = exc.detail if isinstance(exc.detail, str) else "unexpected error"
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "internal_error", "detail": detail},
    )


async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": str(exc) or exc.__class__.__name__},
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RecognitionError, recognition_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
