"""PDF import — один endpoint: upload PDF → parse → create items."""

import logging

from asgiref.sync import async_to_sync
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.integration.recognition_client import (
    RecognitionClient,
    RecognitionClientError,
)

from .services.pdf_import_service import (
    PDFParseError,
    apply_parsed_items,
    parse_pdf_via_recognition,
)

logger = logging.getLogger(__name__)


def _get_workspace_id(request):
    return request.META.get("HTTP_X_WORKSPACE_ID") or request.query_params.get("workspace_id")


@api_view(["POST"])
@parser_classes([MultiPartParser])
def import_pdf(request, estimate_pk):
    """POST /api/v1/estimates/{id}/import/pdf/ — upload PDF → parse → create items.

    Один endpoint без preview/apply. Загрузил — получил результат.
    """
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    file = request.FILES.get("file")
    if not file:
        return Response({"file": "Required"}, status=status.HTTP_400_BAD_REQUEST)
    if not file.name.lower().endswith(".pdf"):
        return Response({"file": "Only PDF files"}, status=status.HTTP_400_BAD_REQUEST)

    # 1. Parse через Recognition Service (E15.02b)
    try:
        result = parse_pdf_via_recognition(file.read(), file.name)
    except PDFParseError as e:
        logger.error("PDF parse failed: %s", e)
        # 401 invalid_api_key → 502 (upstream misconfigured, frontend ничего не
        # может с этим сделать). Прочие — тоже 502.
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

    # 2. Создать позиции сразу
    try:
        applied = apply_parsed_items(str(estimate_pk), workspace_id, items)
    except Exception as e:
        logger.error("PDF apply failed: %s", e)
        return Response({"error": f"Ошибка создания позиций: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
        # Как в import/pdf/ — любая ошибка upstream → 502 (frontend не может
        # повлиять на recognition). Код ошибки пробрасываем для лога/отладки.
        return Response(
            {"error": str(e), "code": e.code},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response(result)
