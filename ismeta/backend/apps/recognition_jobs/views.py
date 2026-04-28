"""DRF ViewSet для RecognitionJob (E19-2).

Endpoints:
- GET    /api/v1/recognition-jobs/          — список (фильтры status/estimate_id).
- GET    /api/v1/recognition-jobs/{id}/     — details.
- POST   /api/v1/recognition-jobs/{id}/cancel/   — отмена (running → POST на recognition).
- POST   /api/v1/recognition-jobs/{id}/callback/ — приём callback'ов от recognition.

Создание job'а — через `apps/estimate/pdf_views.py::import_pdf?async=true`,
не через POST на этот ViewSet (PDF blob кладётся вместе с FK на Estimate).
"""

from __future__ import annotations

import logging
from hmac import compare_digest

import httpx
from django.conf import settings
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from .models import RecognitionJob
from .serializers import RecognitionJobSerializer

logger = logging.getLogger(__name__)


class RecognitionJobCursorPagination(CursorPagination):
    """Глобальный default DEFAULT_PAGINATION_CLASS=CursorPagination ordering'ом
    `-created`; у нас поле называется `created_at`, переопределяем."""

    ordering = "-created_at"
    page_size = 100


class RecognitionJobViewSet(viewsets.ReadOnlyModelViewSet):
    """List + retrieve RecognitionJob; cancel + callback — extra actions.

    Permission_classes намеренно НЕ переопределены — используется global из
    settings.REST_FRAMEWORK (IsAuthenticated в prod, AllowAny в DEV через
    ISMETA_AUTH_DISABLED=true). Это согласовано с другими ismeta ViewSets
    (EstimateViewSet, MaterialViewSet и т.д.) — они тоже используют global.
    Workspace filter работает через DEFAULT_FILTER_BACKENDS глобально.
    """

    serializer_class = RecognitionJobSerializer
    pagination_class = RecognitionJobCursorPagination
    queryset = RecognitionJob.objects.select_related(
        "estimate", "workspace", "created_by"
    )

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
            if statuses:
                queryset = queryset.filter(status__in=statuses)
        estimate_id = self.request.query_params.get("estimate_id")
        if estimate_id:
            queryset = queryset.filter(estimate_id=estimate_id)
        return queryset

    @action(
        detail=True,
        methods=["post"],
        url_path="cancel",
        # Использует global permission (как list/retrieve) — синхронно с прочими
        # ismeta endpoints. AllowAny в DEV, IsAuthenticated в prod.
    )
    def cancel(self, request: Request, pk: str | None = None) -> Response:
        """Отменить job. Если running → POST на recognition /cancel/{id}.

        Возвращает 409 если job уже в terminal статусе.
        """
        job = self.get_object()
        if not job.is_active:
            return Response(
                {"detail": f"Job в статусе {job.status}, отмена невозможна"},
                status=status.HTTP_409_CONFLICT,
            )
        if job.status == RecognitionJob.STATUS_RUNNING:
            try:
                with httpx.Client(timeout=10.0) as client:
                    client.post(
                        f"{settings.RECOGNITION_URL}/v1/parse/spec/cancel/{job.id}",
                        headers={"X-API-Key": settings.RECOGNITION_API_KEY},
                    )
            except httpx.HTTPError as exc:
                logger.warning(
                    "recognition cancel failed",
                    extra={"job_id": str(job.id), "error": str(exc)},
                )
        job.status = RecognitionJob.STATUS_CANCELLED
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "completed_at"])
        return Response({"id": str(job.id), "status": job.status})

    @action(
        detail=True,
        methods=["post"],
        url_path="callback",
        # Recognition не имеет JWT — аутентификация по shared-token (X-Callback-Token).
        permission_classes=[AllowAny],
        authentication_classes=[],
    )
    def callback(self, request: Request, pk: str | None = None) -> Response:
        """Recognition присылает события: started / page_done / finished / failed / cancelled.

        Auth: X-Callback-Token (constant-time comparison c job.cancellation_token).

        Workspace filter намеренно НЕ применяется — recognition не знает
        workspace_id, его аутентифицирует token.
        """
        if pk is None:
            return Response({"detail": "missing_id"}, status=status.HTTP_404_NOT_FOUND)
        try:
            job = RecognitionJob.objects.get(pk=pk)
        except RecognitionJob.DoesNotExist:
            return Response({"detail": "not_found"}, status=status.HTTP_404_NOT_FOUND)

        token_header = request.headers.get("X-Callback-Token", "")
        if not job.cancellation_token or not compare_digest(
            token_header, job.cancellation_token
        ):
            logger.warning(
                "recognition_jobs callback forbidden",
                extra={"job_id": str(job.id), "token_match": False},
            )
            return Response({"detail": "forbidden"}, status=status.HTTP_403_FORBIDDEN)

        event = request.data.get("event")
        logger.info(
            "recognition_jobs callback",
            extra={"job_id": str(job.id), "event": event, "status": job.status},
        )

        # Идемпотентность: если job уже в terminal статусе, поздние callbacks
        # игнорируются (например, cancelled пришёл после finished от той же
        # cancellation race).
        if job.is_terminal and event != "started":
            return Response({"ok": True, "ignored": "already_terminal"})

        if event == "started":
            if job.status != RecognitionJob.STATUS_RUNNING:
                job.status = RecognitionJob.STATUS_RUNNING
                if not job.started_at:
                    job.started_at = timezone.now()
                job.save(update_fields=["status", "started_at"])
        elif event == "page_done":
            page_items = request.data.get("items") or []
            existing = job.items or []
            existing.extend(page_items)
            job.items = existing
            job.items_count = len(existing)
            job.pages_done = (job.pages_done or 0) + 1
            job.save(update_fields=["items", "items_count", "pages_done"])
        elif event == "finished":
            self._finalize_finished(job, request.data)
        elif event == "failed":
            job.status = RecognitionJob.STATUS_FAILED
            job.completed_at = timezone.now()
            job.error_message = str(request.data.get("error", ""))[:8000]
            job.save(
                update_fields=["status", "completed_at", "error_message"]
            )
        elif event == "cancelled":
            job.status = RecognitionJob.STATUS_CANCELLED
            job.completed_at = timezone.now()
            job.save(update_fields=["status", "completed_at"])
        else:
            return Response(
                {"detail": f"unknown event {event!r}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"ok": True})

    @staticmethod
    def _finalize_finished(job: RecognitionJob, payload: dict) -> None:
        """finished — финальный snapshot от recognition: items, pages_stats,
        pages_summary, llm_costs. Создаём EstimateItem'ы через тот же путь
        что синхронный flow (apply_parsed_items).
        """
        from apps.estimate.services.pdf_import_service import apply_parsed_items

        items = payload.get("items") or []
        pages_stats = payload.get("pages_stats") or {}
        job.items = items
        job.items_count = len(items)
        job.pages_total = pages_stats.get("total")
        if pages_stats.get("processed") is not None:
            # pages_done уже накопился из page_done callbacks; но если кто-то
            # пропустил callback — синхронизируем по финальному counter'у.
            job.pages_done = max(job.pages_done or 0, pages_stats.get("processed", 0))
        job.pages_summary = payload.get("pages_summary") or []
        job.llm_costs = payload.get("llm_costs") or {}
        job.error_message = ""

        try:
            apply_result = apply_parsed_items(
                str(job.estimate_id), str(job.workspace_id), items
            )
            job.apply_result = apply_result
            job.status = RecognitionJob.STATUS_DONE
        except Exception as exc:  # нужно поймать всё, иначе job залипнет в running
            logger.exception(
                "recognition_jobs apply failed",
                extra={"job_id": str(job.id)},
            )
            job.status = RecognitionJob.STATUS_FAILED
            job.error_message = f"apply_parsed_items: {exc}"[:8000]
        job.completed_at = timezone.now()
        job.save()

        # E18-2: ImportLog после успешного apply (status=done).
        # Пишем только при успехе — failed apply не должен порождать
        # «успешный» лог cost'а. Ошибки создания лога не должны ломать job.
        if job.status == RecognitionJob.STATUS_DONE:
            try:
                from apps.llm_profiles.models import ImportLog

                total_usd = (
                    job.llm_costs.get("total_usd")
                    if isinstance(job.llm_costs, dict)
                    else None
                )
                ImportLog.objects.create(
                    estimate_id=job.estimate_id,
                    file_type=job.file_type or "pdf",
                    file_name=job.file_name or "",
                    profile_id=job.profile_id,
                    cost_usd=total_usd,
                    items_created=len(items),
                    pages_processed=job.pages_done or 0,
                    llm_metadata=job.llm_costs or {},
                    created_by=job.created_by,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "recognition_jobs import_log create failed",
                    extra={"job_id": str(job.id), "error": str(exc)},
                )


