"""PDF import views — preview + apply."""

import json
import uuid

from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from .services.pdf_import_service import PDFParseError, apply_parsed_items, parse_pdf_via_erp


def _get_workspace_id(request):
    return request.META.get("HTTP_X_WORKSPACE_ID") or request.query_params.get("workspace_id")


@api_view(["POST"])
@parser_classes([MultiPartParser])
def import_pdf_preview(request, estimate_pk):
    """POST /api/v1/estimates/{id}/import/pdf/ — upload PDF → preview."""
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    file = request.FILES.get("file")
    if not file:
        return Response({"file": "Required"}, status=status.HTTP_400_BAD_REQUEST)
    if not file.name.lower().endswith(".pdf"):
        return Response({"file": "Only PDF files"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        result = parse_pdf_via_erp(file.read(), file.name)
    except PDFParseError as e:
        return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    # Сохраняем preview в cache (5 мин) для apply
    preview_id = str(uuid.uuid4())
    cache.set(f"pdf-preview:{preview_id}", json.dumps(result), timeout=300)

    return Response({
        "preview_id": preview_id,
        "items": result.get("items", []),
        "pages_total": result.get("pages_total", 0),
        "pages_processed": result.get("pages_processed", 0),
        "pages_skipped": result.get("pages_skipped", 0),
        "errors": result.get("errors", []),
        "status": result.get("status", "done"),
    })


@api_view(["POST"])
def import_pdf_apply(request, estimate_pk, preview_id):
    """POST /api/v1/estimates/{id}/import/pdf/{preview_id}/apply/ — применить preview."""
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    cached = cache.get(f"pdf-preview:{preview_id}")
    if not cached:
        return Response(
            {"error": "Preview expired or not found. Re-upload PDF."},
            status=status.HTTP_404_NOT_FOUND,
        )

    result = json.loads(cached)
    items = result.get("items", [])

    applied = apply_parsed_items(str(estimate_pk), workspace_id, items)
    cache.delete(f"pdf-preview:{preview_id}")

    return Response({
        "created": applied["created"],
        "sections": applied["sections"],
        "pages_processed": result.get("pages_processed", 0),
    })
