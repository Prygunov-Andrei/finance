"""Bulk operation views (E4.2)."""

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.estimate.models import Estimate, EstimateSection
from apps.estimate.services.estimate_service import EstimateService
from apps.estimate.services.markup_service import recalc_estimate_totals

MAX_BULK = 500


def _get_workspace_id(request):
    return request.META.get("HTTP_X_WORKSPACE_ID") or request.query_params.get("workspace_id")


@api_view(["POST"])
def bulk_create_items(request, estimate_pk):
    """POST /api/v1/estimates/{id}/items/bulk-create/"""
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    items_data = request.data.get("items", [])
    if not items_data:
        return Response({"items": "Required"}, status=status.HTTP_400_BAD_REQUEST)
    if len(items_data) > MAX_BULK:
        return Response(
            {"detail": f"Max {MAX_BULK} items per request, got {len(items_data)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    estimate = Estimate.objects.get(id=estimate_pk, workspace_id=workspace_id)

    with transaction.atomic():
        created_total = 0
        # Group by section_id
        by_section: dict[str, list[dict]] = {}
        for item in items_data:
            sid = str(item.get("section_id", ""))
            by_section.setdefault(sid, []).append(item)

        for section_id, batch in by_section.items():
            section = EstimateSection.objects.get(
                id=section_id, estimate=estimate, workspace_id=workspace_id,
            )
            created_total += EstimateService.bulk_create_items(section, estimate, workspace_id, batch)

        recalc_estimate_totals(str(estimate_pk), workspace_id)

    return Response({"created": created_total}, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
def bulk_update_items(request, estimate_pk):
    """PATCH /api/v1/estimates/{id}/items/bulk-update/"""
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    items = request.data.get("items", [])
    if not items:
        return Response({"items": "Required"}, status=status.HTTP_400_BAD_REQUEST)
    if len(items) > MAX_BULK:
        return Response(
            {"detail": f"Max {MAX_BULK} items per request"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        result = EstimateService.bulk_update_items(workspace_id, items)
        recalc_estimate_totals(str(estimate_pk), workspace_id)

    return Response(result, status=status.HTTP_200_OK)


@api_view(["POST"])
def bulk_delete_items(request, estimate_pk):
    """POST /api/v1/estimates/{id}/items/bulk-delete/"""
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    item_ids = request.data.get("item_ids", [])
    versions = request.data.get("versions", [])
    if not item_ids:
        return Response({"item_ids": "Required"}, status=status.HTTP_400_BAD_REQUEST)
    if len(item_ids) != len(versions):
        return Response({"detail": "item_ids and versions must have same length"}, status=status.HTTP_400_BAD_REQUEST)
    if len(item_ids) > MAX_BULK:
        return Response(
            {"detail": f"Max {MAX_BULK} items per request"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        result = EstimateService.bulk_delete_items(workspace_id, item_ids, versions)
        recalc_estimate_totals(str(estimate_pk), workspace_id)

    return Response(result, status=status.HTTP_200_OK)
