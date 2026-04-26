"""In-memory registry of running async parse jobs (E19-1).

Хранит `job_id -> asyncio.Task`. Используется только async-endpoint'ом
`POST /v1/parse/spec/async` + cancel-endpoint'ом. Synchronous endpoint
(`/v1/parse/spec`) registry не трогает.

Известный лимит MVP: registry in-memory. При рестарте recognition все
running jobs теряются (asyncio.Task убивается вместе с loop'ом). Backend
получит timeout/connection-reset на свои callbacks и переведёт jobs в
`failed`. Persistence — отдельная задача за пределами E19.
"""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)

_JOBS: dict[str, asyncio.Task[object]] = {}
_LOCK = asyncio.Lock()


async def register(job_id: str, task: asyncio.Task[object]) -> None:
    async with _LOCK:
        _JOBS[job_id] = task


async def cancel(job_id: str) -> bool:
    """Отменить running job. True — сигнал отправлен, False — jobа нет
    (или уже завершилась). Сама cancellation асинхронна: callback
    `cancelled` уйдёт после того, как Task поймает CancelledError."""
    async with _LOCK:
        task = _JOBS.get(job_id)
        if task is None:
            logger.info("cancel: job not found", extra={"job_id": job_id})
            return False
        if task.done():
            logger.info("cancel: job already done", extra={"job_id": job_id})
            return False
        task.cancel()
        return True


async def cleanup(job_id: str) -> None:
    async with _LOCK:
        _JOBS.pop(job_id, None)


async def active_count() -> int:
    """Для health/diagnostics."""
    async with _LOCK:
        return sum(1 for t in _JOBS.values() if not t.done())
