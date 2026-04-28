"""Recognition Service HTTP client (ISMeta → http://recognition:8003).

Контракт: recognition/README.md + ismeta/specs/15-recognition-api.md.
Все методы возвращают dict ровно как в Response JSON соответствующего endpoint.
Ошибки §5 транслируются в RecognitionClientError с кодом и деталями.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

# Sync timeout with PARSE_TIMEOUT_SECONDS on the server (default 300, overridable
# via env). DeepSeek V4-Pro thinking high может занять 10-15 мин на большой PDF —
# поднимаем до 1800 (30 мин) чтобы backend не отдал 502 раньше recognition.
DEFAULT_TIMEOUT_SECONDS = 1800.0


class RecognitionClientError(Exception):
    """Normalized error raised by RecognitionClient on any non-2xx / transport failure."""

    def __init__(
        self,
        code: str,
        detail: str = "",
        *,
        status_code: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail
        self.status_code = status_code
        self.extra = extra or {}


class RecognitionClient:
    """Async HTTP client for the Recognition Service."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        resolved_url = base_url or str(
            getattr(settings, "RECOGNITION_URL", "http://recognition:8003") or ""
        )
        self.base_url = resolved_url.rstrip("/")
        self.api_key = api_key or str(getattr(settings, "RECOGNITION_API_KEY", "") or "")
        self.timeout = timeout

    async def probe(self, pdf_bytes: bytes, filename: str) -> dict[str, Any]:
        """Cheap PDF inspection без LLM — для прогресс-бара перед /parse/spec.

        Возвращает: pages_total, has_text_layer, text_chars_total, estimated_seconds.
        Серверный таймаут — 10с (recognition/app/api/parse.py PROBE_TIMEOUT_SECONDS).
        """
        return await self._post("/v1/probe", pdf_bytes, filename, timeout=15.0)

    async def parse_spec(
        self,
        pdf_bytes: bytes,
        filename: str,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        return await self._post(
            "/v1/parse/spec", pdf_bytes, filename, extra_headers=extra_headers
        )

    async def parse_invoice(
        self,
        pdf_bytes: bytes,
        filename: str,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        return await self._post(
            "/v1/parse/invoice", pdf_bytes, filename, extra_headers=extra_headers
        )

    async def parse_quote(
        self,
        pdf_bytes: bytes,
        filename: str,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        return await self._post(
            "/v1/parse/quote", pdf_bytes, filename, extra_headers=extra_headers
        )

    async def healthz(self) -> dict[str, Any]:
        """Liveness check, no auth required."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(f"{self.base_url}/v1/healthz")
                resp.raise_for_status()
            except httpx.HTTPError as e:
                raise RecognitionClientError(
                    "network_error", f"healthz unreachable: {e}"
                ) from e
        data = resp.json()
        assert isinstance(data, dict)
        return data

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _post(
        self,
        path: str,
        pdf_bytes: bytes,
        filename: str,
        timeout: float | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        headers: dict[str, str] = {"X-API-Key": self.api_key}
        # E18-2: X-LLM-* override headers — recognition использует их вместо
        # своих env-defaults для per-request переключения провайдера.
        if extra_headers:
            headers.update(extra_headers)
        files = {"file": (filename, pdf_bytes, "application/pdf")}
        effective_timeout = timeout if timeout is not None else self.timeout

        try:
            async with httpx.AsyncClient(timeout=effective_timeout) as client:
                resp = await client.post(url, headers=headers, files=files)
        except httpx.TimeoutException as e:
            logger.warning("recognition timeout", extra={"path": path, "error": str(e)})
            raise RecognitionClientError(
                "network_timeout", f"recognition timeout on {path}"
            ) from e
        except httpx.HTTPError as e:
            logger.warning("recognition transport error", extra={"path": path, "error": str(e)})
            raise RecognitionClientError(
                "network_error", f"recognition transport: {e}"
            ) from e

        if resp.status_code == 200:
            data = resp.json()
            if not isinstance(data, dict):
                raise RecognitionClientError(
                    "invalid_response", f"expected JSON object, got {type(data).__name__}",
                    status_code=200,
                )
            return data

        # error path: try to parse JSON body per §5
        body: dict[str, Any] = {}
        try:
            parsed = resp.json()
            if isinstance(parsed, dict):
                body = parsed
        except ValueError:
            pass

        code = str(body.get("error") or f"http_{resp.status_code}")
        detail = str(body.get("detail") or resp.text[:200])
        extra = {k: v for k, v in body.items() if k not in ("error", "detail")}
        logger.warning(
            "recognition error",
            extra={
                "path": path,
                "status_code": resp.status_code,
                "code": code,
                "detail_len": len(detail),
            },
        )
        raise RecognitionClientError(code, detail, status_code=resp.status_code, extra=extra)
