"""Material catalog views (E-MAT-01):

- GET  /api/v1/materials/search/              — справочник поиск (trigram)
- POST /api/v1/estimates/{id}/match-materials/        — подбор по всем items
- POST /api/v1/estimates/{id}/match-materials/apply/  — применить матчи
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .matching.materials import MaterialMatchingService, materials_search


def _get_workspace_id(request) -> str | None:
    value = request.META.get("HTTP_X_WORKSPACE_ID") or request.query_params.get(
        "workspace_id"
    )
    return str(value) if value else None


@api_view(["GET"])
def materials_search_view(request):
    """GET /api/v1/materials/search/?q=&limit=&workspace_id=

    Возвращает список материалов с trigram-скором (0..1). Пустой q → [].
    """
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response(
            {"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST
        )

    q = request.query_params.get("q", "").strip()
    limit_raw = request.query_params.get("limit", "20")
    try:
        limit = max(1, min(100, int(limit_raw)))
    except (TypeError, ValueError):
        limit = 20

    hits = materials_search(workspace_id, q, limit=limit)
    return Response(
        {
            "query": q,
            "results": [
                {
                    "id": str(m.id),
                    "name": m.name,
                    "unit": m.unit,
                    "price": str(m.price),
                    "brand": m.brand,
                    "model_name": m.model_name,
                    "score": str(score),
                }
                for m, score in hits
            ],
        }
    )


@api_view(["POST"])
def match_materials(request, estimate_pk):
    """POST /api/v1/estimates/{id}/match-materials/

    Возвращает подборы материалов для всех items сметы.
    Не применяет — для этого /apply/.
    """
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response(
            {"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST
        )

    result = MaterialMatchingService.match_estimate(
        str(estimate_pk), str(workspace_id)
    )
    return Response(result)


@api_view(["POST"])
def match_materials_apply(request, estimate_pk):
    """POST /api/v1/estimates/{id}/match-materials/apply/

    Тело: {"matches": [{item_id, material_price, ...}, ...]}
    Применяет matches к EstimateItem.material_price.
    """
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response(
            {"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST
        )

    matches = request.data.get("matches") or []
    if not isinstance(matches, list):
        return Response(
            {"matches": "Must be a list"}, status=status.HTTP_400_BAD_REQUEST
        )

    # estimate_pk не используется в UPDATE напрямую (проверка владения
    # через workspace_id и is_deleted), но остаётся в URL для consistency.
    _ = estimate_pk
    updated = MaterialMatchingService.apply_matches(matches, str(workspace_id))
    return Response({"updated": updated})
