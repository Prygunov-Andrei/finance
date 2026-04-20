"""POST /v1/parse/spec — PDF specification parsing."""

import asyncio
import logging

from fastapi import APIRouter, Depends, File, Request, UploadFile

from ..auth import verify_api_key
from ..config import settings
from ..providers.base import BaseLLMProvider
from ..schemas.spec import SpecParseResponse
from ..services.spec_parser import SpecParser
from .errors import (
    FileTooLargeError,
    InvalidFileError,
    LLMUnavailableError,
    ParseFailedError,
    UnsupportedMediaTypeError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def get_provider(request: Request) -> BaseLLMProvider:
    provider = getattr(request.app.state, "provider", None)
    if provider is None:
        raise RuntimeError("LLM provider not initialized — lifespan not run")
    return provider  # type: ignore[no-any-return]


@router.post("/v1/parse/spec", response_model=SpecParseResponse)
async def parse_spec(
    file: UploadFile = File(...),
    _auth: None = Depends(verify_api_key),
    provider: BaseLLMProvider = Depends(get_provider),
) -> SpecParseResponse:
    filename = file.filename or "document.pdf"
    content_type = (file.content_type or "").lower()

    if content_type and content_type != "application/pdf":
        raise UnsupportedMediaTypeError(
            detail=f"expected application/pdf, got {content_type}"
        )
    if not filename.lower().endswith(".pdf") and not content_type:
        raise UnsupportedMediaTypeError(detail="file must be .pdf")

    content = await file.read()

    if not content:
        raise InvalidFileError(detail="empty file")

    if len(content) > settings.max_file_size_mb * 1024 * 1024:
        raise FileTooLargeError(limit_mb=settings.max_file_size_mb)

    if not content.startswith(b"%PDF"):
        raise UnsupportedMediaTypeError(detail="not a valid PDF (magic bytes)")

    parser = SpecParser(provider)

    try:
        result = await asyncio.wait_for(
            parser.parse(content, filename=filename),
            timeout=settings.parse_timeout_seconds,
        )
    except TimeoutError:
        logger.warning(
            "spec_parse timeout",
            extra={
                "doc_filename": filename,
                "timeout_sec": settings.parse_timeout_seconds,
                "pages_total": parser.state.pages_total,
                "pages_processed": parser.state.pages_processed,
                "items_count": len(parser.state.items),
            },
        )
        result = parser.build_partial()
    except LLMUnavailableError:
        raise
    except ValueError as e:
        raise ParseFailedError(detail=str(e)) from e

    logger.info(
        "spec_parse done",
        extra={
            "doc_filename": filename,
            "status": result.status,
            "pages_total": result.pages_stats.total,
            "pages_processed": result.pages_stats.processed,
            "items_count": len(result.items),
        },
    )

    return result
