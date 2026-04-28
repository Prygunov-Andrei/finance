"""Async worker для RecognitionJob (E19-2).

Запускается отдельным sidecar-контейнером:
    python manage.py recognition_worker

Полит таблицу на queued jobs, забирает атомарно через
SELECT ... FOR UPDATE SKIP LOCKED, переводит в running и POST'ит на
recognition `/v1/parse/spec/async`. Дальше recognition присылает callbacks
на наш `/api/v1/recognition-jobs/{id}/callback/` — обновляет status и в
финале создаёт EstimateItem'ы.

Параллелизм ограничен `RECOGNITION_MAX_PARALLEL_JOBS` через asyncio.Semaphore.
Воркер не ждёт finish'а recognition — после POST на /async он сразу
освобождается и может взять следующий job (recognition сам параллелит).
Семафор тут как safeguard от лавинного запуска dispatch-задач если очередь
большая, а recognition отвечает медленно.
"""

from __future__ import annotations

import asyncio
import logging

import httpx
from asgiref.sync import sync_to_async
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import RecognitionJob

logger = logging.getLogger(__name__)


def _pick_next_queued_job() -> RecognitionJob | None:
    """Атомарно берёт самый старый queued job + переводит в running.

    SELECT FOR UPDATE SKIP LOCKED гарантирует что параллельные worker'ы
    не возьмут один и тот же job (для случая если решим масштабировать
    до multiple воркеров; пока 1 воркер).
    """
    with transaction.atomic():
        job = (
            RecognitionJob.objects.select_for_update(skip_locked=True)
            .filter(status=RecognitionJob.STATUS_QUEUED)
            .order_by("created_at")
            .first()
        )
        if job is None:
            return None
        job.status = RecognitionJob.STATUS_RUNNING
        job.started_at = timezone.now()
        job.save(update_fields=["status", "started_at"])
        return job


def _mark_failed(job_id, message: str) -> None:
    """Пометить job как failed (используется когда POST на recognition не удался)."""
    RecognitionJob.objects.filter(pk=job_id).update(
        status=RecognitionJob.STATUS_FAILED,
        completed_at=timezone.now(),
        error_message=message[:8000],
    )


def _build_llm_headers_for_job(job: RecognitionJob) -> dict[str, str]:
    """E18-2: lookup LLMProfile по job.profile_id и построить X-LLM-* headers.

    Если profile_id пуст или профиль удалён — возвращаем пустой dict
    (recognition использует свои env-defaults).
    """
    if not job.profile_id:
        return {}
    from apps.llm_profiles.models import LLMProfile
    from apps.llm_profiles.proxy import build_llm_headers

    profile = LLMProfile.objects.filter(id=job.profile_id).first()
    if not profile:
        logger.warning(
            "recognition_jobs profile_not_found",
            extra={"job_id": str(job.id), "profile_id": job.profile_id},
        )
        return {}
    return build_llm_headers(profile)


async def _post_to_recognition(job: RecognitionJob) -> tuple[int | None, str]:
    """Чистый HTTP-call на recognition /v1/parse/spec/async.

    Возвращает (status_code, body|error). status_code=None при transport error.
    Без DB-операций — чтобы можно было тестировать unit'ом без транзакций.

    E18-2: если у job есть profile_id — пробрасываем X-LLM-* headers
    (api_key расшифровывается из LLMProfile.api_key_encrypted).
    """
    callback_url = (
        f"{settings.BACKEND_INTERNAL_URL.rstrip('/')}"
        f"/api/v1/recognition-jobs/{job.id}/callback/"
    )
    headers = {
        "X-API-Key": settings.RECOGNITION_API_KEY,
        "X-Callback-URL": callback_url,
        "X-Job-Id": str(job.id),
        "X-Callback-Token": job.cancellation_token,
    }
    llm_headers = await sync_to_async(_build_llm_headers_for_job)(job)
    headers.update(llm_headers)
    files = {
        "file": (
            job.file_name,
            bytes(job.file_blob),
            "application/pdf",
        )
    }
    url = f"{settings.RECOGNITION_URL.rstrip('/')}/v1/parse/spec/async"
    try:
        # Только handshake POST — recognition отвечает 202 моментально.
        # Долгий парсинг идёт у них в background, к нам приходит через callbacks.
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, files=files)
    except httpx.HTTPError as exc:
        return None, f"recognition unreachable: {exc}"
    return resp.status_code, resp.text


async def _dispatch_job(job: RecognitionJob) -> None:
    """POST на recognition /v1/parse/spec/async.

    Если recognition вернул ≠ 202 или не доступен — переводим job в failed
    сразу (callback не придёт, иначе job залипнет в running навсегда).
    """
    status_code, body = await _post_to_recognition(job)
    if status_code is None:
        logger.exception(
            "recognition_jobs dispatch transport error",
            extra={"job_id": str(job.id), "error": body},
        )
        await sync_to_async(_mark_failed)(job.id, body)
        return
    if status_code != 202:
        body_short = body[:500]
        logger.warning(
            "recognition_jobs dispatch non-202",
            extra={
                "job_id": str(job.id),
                "status_code": status_code,
                "body": body_short,
            },
        )
        await sync_to_async(_mark_failed)(
            job.id, f"recognition {status_code}: {body_short}"
        )
        return
    logger.info(
        "recognition_jobs dispatched",
        extra={"job_id": str(job.id), "file_name": job.file_name},
    )


async def _run_with_semaphore(
    job: RecognitionJob, sema: asyncio.Semaphore
) -> None:
    async with sema:
        await _dispatch_job(job)


async def run_worker(stop_event: asyncio.Event | None = None) -> None:
    """Главный loop воркера.

    Пулит RecognitionJob.queued → dispatch → ждёт. `stop_event` нужен только
    для тестов (graceful shutdown).
    """
    sema = asyncio.Semaphore(settings.RECOGNITION_MAX_PARALLEL_JOBS)
    poll_interval = settings.RECOGNITION_WORKER_POLL_INTERVAL
    # Держим strong-ref на dispatch-task'и, иначе GC может убить их раньше
    # завершения (см. asyncio.create_task docs / RUF006).
    pending: set[asyncio.Task] = set()
    logger.info(
        "recognition_jobs worker started",
        extra={
            "max_parallel": settings.RECOGNITION_MAX_PARALLEL_JOBS,
            "poll_interval": poll_interval,
        },
    )
    while True:
        if stop_event is not None and stop_event.is_set():
            logger.info("recognition_jobs worker stopped by event")
            return
        job = await sync_to_async(_pick_next_queued_job)()
        if job is None:
            try:
                if stop_event is not None:
                    await asyncio.wait_for(stop_event.wait(), timeout=poll_interval)
                    return
                else:
                    await asyncio.sleep(poll_interval)
            except TimeoutError:
                continue
            continue
        # Запускаем dispatch в фоновую таску — не блокируем pick loop.
        task = asyncio.create_task(_run_with_semaphore(job, sema))
        pending.add(task)
        task.add_done_callback(pending.discard)
