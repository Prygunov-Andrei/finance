"""POST /v1/parse/{spec,invoice,quote} — PDF parsing endpoints."""

import asyncio
import logging
import uuid
from typing import Any, cast

import fitz
import httpx
from fastapi import APIRouter, Depends, File, Header, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ..auth import verify_api_key
from ..config import settings
from ..providers.base import BaseLLMProvider
from ..schemas.invoice import InvoiceParseResponse
from ..schemas.probe import ProbeResponse
from ..schemas.quote import QuoteParseResponse
from ..schemas.spec import SpecParseResponse
from ..services import job_registry
from ..services.invoice_parser import InvoiceParser
from ..services.pdf_text import TEXT_LAYER_MIN_CHARS_PER_PAGE
from ..services.quote_parser import QuoteParser
from ..services.spec_parser import SpecParser
from .errors import (
    FileTooLargeError,
    InvalidFileError,
    LLMUnavailableError,
    ParseFailedError,
    UnsupportedMediaTypeError,
)

PROBE_TIMEOUT_SECONDS = 10

logger = logging.getLogger(__name__)

router = APIRouter()


def get_provider(request: Request) -> BaseLLMProvider:
    provider = getattr(request.app.state, "provider", None)
    if provider is None:
        raise RuntimeError("LLM provider not initialized — lifespan not run")
    return provider  # type: ignore[no-any-return]


async def _read_pdf(file: UploadFile) -> tuple[bytes, str]:
    """Validate upload and return (content, filename). Raises §5 errors."""
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

    return content, filename


async def _run_with_timeout(
    parser: Any, content: bytes, filename: str, log_prefix: str
) -> BaseModel:
    """Run parser.parse under settings.parse_timeout_seconds. Translate errors to §5."""
    try:
        result: BaseModel = await asyncio.wait_for(
            parser.parse(content, filename=filename),
            timeout=settings.parse_timeout_seconds,
        )
        return cast(BaseModel, result)
    except TimeoutError:
        state = parser.state
        logger.warning(
            f"{log_prefix} timeout",
            extra={
                "doc_filename": filename,
                "timeout_sec": settings.parse_timeout_seconds,
                "pages_total": getattr(state, "pages_total", 0),
                "pages_processed": getattr(state, "pages_processed", 0),
                "items_count": len(getattr(state, "items", []) or []),
            },
        )
        return cast(BaseModel, parser.build_partial())
    except LLMUnavailableError:
        raise
    except ValueError as e:
        raise ParseFailedError(detail=str(e)) from e


def _log_done(kind: str, filename: str, result: BaseModel) -> None:
    data = result.model_dump()
    logger.info(
        f"{kind}_parse done",
        extra={
            "doc_filename": filename,
            "status": data.get("status"),
            "pages_total": (data.get("pages_stats") or {}).get("total", 0),
            "pages_processed": (data.get("pages_stats") or {}).get("processed", 0),
            "items_count": len(data.get("items") or []),
        },
    )


def _probe_pdf_sync(content: bytes) -> tuple[int, int, int]:
    """Open PDF and return (pages_total, text_chars_total, text_layer_pages).

    text_layer_pages — сколько страниц проходят per-page threshold
    TEXT_LAYER_MIN_CHARS_PER_PAGE. Используется и для honest has_text_layer
    (all-or-nothing совпадает с поведением SpecParser), и для mixed-PDF
    оценки времени.
    """
    doc = fitz.open(stream=content, filetype="pdf")
    try:
        pages_total = len(doc)
        chars_total = 0
        text_layer_pages = 0
        for page in doc:
            page_chars = len(page.get_text().strip())
            chars_total += page_chars
            if page_chars >= TEXT_LAYER_MIN_CHARS_PER_PAGE:
                text_layer_pages += 1
        return pages_total, chars_total, text_layer_pages
    finally:
        doc.close()


def _estimate_seconds(pages_total: int, text_layer_pages: int) -> int:
    """Grading heuristic для mixed PDF.

    Text-layer страница ~ 0.1s, Vision страница ~ 5s, +2s фикс. overhead.
    Для all-text PDF ≈ 2 + 0.1*N; для all-scan ≈ 2 + 5*N.
    """
    vision_pages = pages_total - text_layer_pages
    return max(1, round(2 + 0.1 * text_layer_pages + 5 * vision_pages))


@router.post("/v1/probe", response_model=ProbeResponse)
async def probe(
    file: UploadFile = File(...),
    _auth: None = Depends(verify_api_key),
) -> ProbeResponse:
    """Cheap PDF inspection — same validation as /parse/spec, но без LLM.

    Используется фронтом перед POST /v1/parse/spec, чтобы показать пользователю
    оценку времени (text-layer — быстро, vision — медленно) и pages_total для
    progress bar. Таймаут 10с — на гигантских PDF (500+ страниц) лучше отвалиться.
    """
    content, filename = await _read_pdf(file)

    try:
        pages_total, chars_total, text_layer_pages = await asyncio.wait_for(
            run_in_threadpool(_probe_pdf_sync, content),
            timeout=PROBE_TIMEOUT_SECONDS,
        )
    except TimeoutError as e:
        raise ParseFailedError(
            detail=f"probe timeout after {PROBE_TIMEOUT_SECONDS}s — PDF too large"
        ) from e
    except (ValueError, RuntimeError) as e:
        # PyMuPDF бросает fitz.FileDataError (наследник RuntimeError) на
        # битый PDF — отдаём 415, т.к. файл не является валидным PDF.
        raise UnsupportedMediaTypeError(detail=f"cannot open PDF: {e}") from e

    # has_text_layer=True только когда ВСЕ страницы годятся под hybrid путь —
    # симметрично per-page решению в SpecParser. Раньше сумма символов по
    # документу могла дать True на mixed PDF (1 титул + 8 сканов), но в
    # SpecParser 8 из 9 страниц уходили в Vision → progress bar ломался.
    has_text_layer = text_layer_pages == pages_total and pages_total > 0
    est = _estimate_seconds(pages_total, text_layer_pages)

    logger.info(
        "probe done",
        extra={
            "doc_filename": filename,
            "pages_total": pages_total,
            "text_chars_total": chars_total,
            "text_layer_pages": text_layer_pages,
            "has_text_layer": has_text_layer,
            "estimated_seconds": est,
        },
    )
    return ProbeResponse(
        pages_total=pages_total,
        text_layer_pages=text_layer_pages,
        has_text_layer=has_text_layer,
        text_chars_total=chars_total,
        estimated_seconds=est,
    )


@router.post("/v1/parse/spec", response_model=SpecParseResponse)
async def parse_spec(
    file: UploadFile = File(...),
    _auth: None = Depends(verify_api_key),
    provider: BaseLLMProvider = Depends(get_provider),
) -> SpecParseResponse:
    content, filename = await _read_pdf(file)
    parser = SpecParser(provider)
    result = await _run_with_timeout(parser, content, filename, "spec_parse")
    assert isinstance(result, SpecParseResponse)
    _log_done("spec", filename, result)
    return result


@router.post("/v1/parse/invoice", response_model=InvoiceParseResponse)
async def parse_invoice(
    file: UploadFile = File(...),
    _auth: None = Depends(verify_api_key),
    provider: BaseLLMProvider = Depends(get_provider),
) -> InvoiceParseResponse:
    content, filename = await _read_pdf(file)
    parser = InvoiceParser(provider)
    result = await _run_with_timeout(parser, content, filename, "invoice_parse")
    assert isinstance(result, InvoiceParseResponse)
    _log_done("invoice", filename, result)
    return result


@router.post("/v1/parse/quote", response_model=QuoteParseResponse)
async def parse_quote(
    file: UploadFile = File(...),
    _auth: None = Depends(verify_api_key),
    provider: BaseLLMProvider = Depends(get_provider),
) -> QuoteParseResponse:
    content, filename = await _read_pdf(file)
    parser = QuoteParser(provider)
    result = await _run_with_timeout(parser, content, filename, "quote_parse")
    assert isinstance(result, QuoteParseResponse)
    _log_done("quote", filename, result)
    return result


# ============================================================================
# E19-1: async spec parsing — 202 Accepted + page-level callbacks.
# ============================================================================

# Какие event'ы recognition отправляет на callback URL (поле "event" в payload):
# - started:    парсинг стартовал (после открытия PDF, до первого LLM-call).
# - page_done:  страница завершена; payload содержит {page, items, partial_count}.
# - finished:   все страницы готовы; payload — финальный SpecParseResponse-набор
#               + llm_costs (заполняется E18 позже; пока пусто).
# - failed:     исключение в парсинге; payload — {error, code}.
# - cancelled:  получен сигнал отмены через /v1/parse/spec/cancel/{job_id}.

class _AsyncAcceptedResponse(BaseModel):
    status: str
    job_id: str


class _CancelResponse(BaseModel):
    cancelled: bool


@router.post(
    "/v1/parse/spec/async",
    status_code=202,
    response_model=_AsyncAcceptedResponse,
)
async def parse_spec_async(
    request: Request,
    file: UploadFile = File(...),
    x_callback_url: str = Header(..., alias="X-Callback-URL"),
    x_job_id: str = Header("", alias="X-Job-Id"),
    x_callback_token: str = Header("", alias="X-Callback-Token"),
    _auth: None = Depends(verify_api_key),
    provider: BaseLLMProvider = Depends(get_provider),
) -> _AsyncAcceptedResponse:
    """Асинхронный парсинг спецификации.

    Принимает PDF, возвращает 202 моментально. Парсит в фоне через
    `asyncio.create_task`, шлёт callback'и на `X-Callback-URL` с заголовком
    `X-Callback-Token` (если передан). При отмене через
    `/v1/parse/spec/cancel/{job_id}` — отправляет `cancelled` callback.

    Headers:
    - X-Callback-URL: куда POST'ить callback'и (обязательно).
    - X-Job-Id: id job'а на стороне backend'а; если пусто — recognition
      генерит uuid4. Возвращается клиенту в ответе.
    - X-Callback-Token: shared-secret который кладётся в каждый callback
      как `X-Callback-Token` header (опционально).

    E18 интеграция (X-LLM-* override) — отложена до E18-1; здесь используем
    singleton provider из app.state как и sync endpoint.
    """
    content, filename = await _read_pdf(file)

    job_id = x_job_id or str(uuid.uuid4())
    logger.info(
        "spec_parse_async accepted",
        extra={
            "job_id": job_id,
            "doc_filename": filename,
            "size_bytes": len(content),
            "callback_url": x_callback_url,
        },
    )

    task = asyncio.create_task(
        _run_async_spec_job(
            job_id=job_id,
            pdf_bytes=content,
            filename=filename,
            callback_url=x_callback_url,
            callback_token=x_callback_token,
            provider=provider,
        )
    )
    await job_registry.register(job_id, task)
    return _AsyncAcceptedResponse(status="accepted", job_id=job_id)


@router.post(
    "/v1/parse/spec/cancel/{job_id}",
    status_code=200,
    response_model=_CancelResponse,
)
async def cancel_spec_job(
    job_id: str,
    _auth: None = Depends(verify_api_key),
) -> _CancelResponse:
    """Отменить running job. Возвращает {"cancelled": true} если сигнал
    отправлен (Task ещё не завершилась), иначе {"cancelled": false}.

    Сама отмена асинхронна: `cancelled` callback уйдёт после того, как
    Task поймает CancelledError.
    """
    cancelled = await job_registry.cancel(job_id)
    logger.info(
        "spec_parse_async cancel requested",
        extra={"job_id": job_id, "cancelled": cancelled},
    )
    return _CancelResponse(cancelled=cancelled)


def _make_callback_client() -> httpx.AsyncClient:
    """Factory для callback HTTP-клиента. Вынесено в отдельную функцию
    чтобы тесты могли monkeypatch'ить только канал отправки callback'ов,
    не задевая глобальный httpx.AsyncClient (который использует TestClient
    и сам ASGITransport)."""
    return httpx.AsyncClient(timeout=settings.async_callback_timeout)


async def _run_async_spec_job(
    *,
    job_id: str,
    pdf_bytes: bytes,
    filename: str,
    callback_url: str,
    callback_token: str,
    provider: BaseLLMProvider,
) -> None:
    """Background-обёртка над SpecParser. Шлёт callbacks по progress + final."""
    parser = SpecParser(provider)
    partial_count = 0

    async def send_callback(event: str, payload: dict[str, Any]) -> None:
        body = {"job_id": job_id, "event": event, **payload}
        headers = {"Content-Type": "application/json"}
        if callback_token:
            headers["X-Callback-Token"] = callback_token
        try:
            async with _make_callback_client() as client:
                await client.post(callback_url, headers=headers, json=body)
        except Exception as e:
            # ТЗ: НЕ ретраим callbacks — backend получит timeout/connection-
            # reset на свои health-check'и через polling и переведёт job в
            # failed. Только лог warning.
            logger.warning(
                "callback failed",
                extra={
                    "job_id": job_id,
                    "event": event,
                    "callback_url": callback_url,
                    "error": str(e),
                },
            )

    async def on_page_done(page_1based: int, items: list[dict]) -> None:
        nonlocal partial_count
        partial_count += len(items)
        await send_callback(
            "page_done",
            {
                "page": page_1based,
                "items": items,
                "partial_count": partial_count,
            },
        )

    try:
        await send_callback("started", {"filename": filename})
        result = await parser.parse(
            pdf_bytes,
            filename=filename,
            on_page_done=on_page_done,
        )
        # llm_costs пока пусто — добавится в E18-1, когда LLMProfile.pricing
        # будет считать стоимость по usage. Сейчас просто {} placeholder.
        await send_callback(
            "finished",
            {
                "status": result.status,
                "items": [it.model_dump() for it in result.items],
                "pages_stats": result.pages_stats.model_dump(),
                "pages_summary": [p.model_dump() for p in result.pages_summary],
                "errors": result.errors,
                "llm_costs": {},
            },
        )
        logger.info(
            "spec_parse_async finished",
            extra={
                "job_id": job_id,
                "items_count": len(result.items),
                "pages_total": result.pages_stats.total,
            },
        )
    except asyncio.CancelledError:
        logger.info("spec_parse_async cancelled", extra={"job_id": job_id})
        await send_callback("cancelled", {})
        raise
    except LLMUnavailableError as e:
        logger.warning(
            "spec_parse_async llm unavailable",
            extra={"job_id": job_id, "error": str(e)},
        )
        await send_callback(
            "failed",
            {"error": str(e), "code": "llm_unavailable"},
        )
    except Exception as e:
        logger.exception(
            "spec_parse_async failed", extra={"job_id": job_id}
        )
        await send_callback(
            "failed",
            {"error": str(e), "code": "internal_error"},
        )
    finally:
        await job_registry.cleanup(job_id)
