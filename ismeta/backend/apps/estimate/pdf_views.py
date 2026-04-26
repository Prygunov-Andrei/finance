"""PDF import — два режима:

- async (default, E19-2): создаём RecognitionJob → 202, дальше worker
  забирает и POST'ит на recognition с callback URL. Сметчик закрывает
  диалог и работает дальше.
- sync (?async=false, backward compat): синхронный вызов recognition,
  ждём ответ как раньше. Используется в тестах и для быстрых PDF.
"""

import logging
import secrets

from asgiref.sync import async_to_sync
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.estimate.models import Estimate
from apps.integration.recognition_client import (
    RecognitionClient,
    RecognitionClientError,
)
from apps.recognition_jobs.models import RecognitionJob
from apps.recognition_jobs.serializers import RecognitionJobSerializer

from .services.pdf_import_service import (
    PDFParseError,
    apply_parsed_items,
    parse_pdf_via_recognition,
)

logger = logging.getLogger(__name__)


def _get_workspace_id(request):
    return request.META.get("HTTP_X_WORKSPACE_ID") or request.query_params.get("workspace_id")


def _is_async_requested(request) -> bool:
    """`?async=true` (default) — async через RecognitionJob.
    `?async=false` — старый sync flow.
    """
    raw = request.query_params.get("async", "true").strip().lower()
    return raw not in ("false", "0", "no", "off")


@api_view(["POST"])
@parser_classes([MultiPartParser])
def import_pdf(request, estimate_pk):
    """POST /api/v1/estimates/{id}/import/pdf/?async=true (default).

    Async: создаёт RecognitionJob (status=queued) → возвращает 202 +
    сериализованный job. Worker подхватит и dispatch'нёт на recognition.

    Sync (`?async=false`): синхронный вызов recognition, item'ы создаются
    немедленно. Backward compat для существующих интеграций / тестов.
    """
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    file = request.FILES.get("file")
    if not file:
        return Response({"file": "Required"}, status=status.HTTP_400_BAD_REQUEST)
    if not file.name.lower().endswith(".pdf"):
        return Response({"file": "Only PDF files"}, status=status.HTTP_400_BAD_REQUEST)

    if _is_async_requested(request):
        return _create_async_job(request, estimate_pk, workspace_id, file)
    return _sync_import_pdf(estimate_pk, workspace_id, file)


def _create_async_job(request, estimate_pk, workspace_id, file):
    """Создать RecognitionJob, вернуть 202 + serialized job."""
    estimate = get_object_or_404(
        Estimate, pk=estimate_pk, workspace_id=workspace_id
    )

    profile_id_raw = request.POST.get("llm_profile_id", "")
    profile_id = int(profile_id_raw) if profile_id_raw.isdigit() else None
    # E18 пока нет — profile_id просто валидируем как int если передано;
    # FK не используется, lookup тоже (worker отправляет defaults из .env).

    pdf_bytes = file.read()
    job = RecognitionJob.objects.create(
        estimate=estimate,
        workspace_id=workspace_id,
        file_name=file.name,
        file_type="pdf",
        file_blob=pdf_bytes,
        profile_id=profile_id,
        cancellation_token=secrets.token_urlsafe(32),
        created_by=request.user if request.user.is_authenticated else None,
    )
    logger.info(
        "recognition_jobs created via import_pdf",
        extra={
            "job_id": str(job.id),
            "estimate_id": str(estimate.id),
            "file_name": file.name,
            "size_bytes": len(pdf_bytes),
        },
    )
    serializer = RecognitionJobSerializer(job)
    return Response(serializer.data, status=status.HTTP_202_ACCEPTED)


def _sync_import_pdf(estimate_pk, workspace_id, file):
    """Старый flow до E19-2: ждём recognition синхронно."""
    try:
        result = parse_pdf_via_recognition(file.read(), file.name)
    except PDFParseError as e:
        logger.error("PDF parse failed: %s", e)
        return Response({"error": str(e), "code": e.code}, status=status.HTTP_502_BAD_GATEWAY)

    items = result.get("items", [])
    if not items:
        return Response({
            "created": 0,
            "sections": 0,
            "errors": result.get("errors", ["Не удалось распознать позиции"]),
            "pages_total": result.get("pages_total", 0),
            "pages_processed": result.get("pages_processed", 0),
            "pages_summary": result.get("pages_summary", []),
        })

    try:
        applied = apply_parsed_items(str(estimate_pk), workspace_id, items)
    except Exception as e:
        logger.error("PDF apply failed: %s", e)
        return Response(
            {"error": f"Ошибка создания позиций: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response({
        "created": applied["created"],
        "sections": applied["sections"],
        "errors": result.get("errors", []),
        "pages_total": result.get("pages_total", 0),
        "pages_processed": result.get("pages_processed", 0),
        "pages_summary": result.get("pages_summary", []),
    })


@api_view(["POST"])
@parser_classes([MultiPartParser])
def probe_pdf(request, estimate_pk):
    """POST /api/v1/estimates/{id}/probe/pdf/ — прокси в Recognition /v1/probe.

    Дёшево (≤10с) считает pages_total/has_text_layer/estimated_seconds для
    прогресс-бара UI перед вызовом /import/pdf/. LLM не задействуется.
    """
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    file = request.FILES.get("file")
    if not file:
        return Response({"file": "Required"}, status=status.HTTP_400_BAD_REQUEST)
    if not file.name.lower().endswith(".pdf"):
        return Response({"file": "Only PDF files"}, status=status.HTTP_400_BAD_REQUEST)

    client = RecognitionClient()
    try:
        result = async_to_sync(client.probe)(file.read(), file.name)
    except RecognitionClientError as e:
        logger.warning("recognition probe failed: code=%s status=%s", e.code, e.status_code)
        return Response(
            {"error": str(e), "code": e.code},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response(result)
