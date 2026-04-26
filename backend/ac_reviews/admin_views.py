"""Админский API модерации отзывов (/api/hvac/rating/reviews/).

Ф8B-2:
  - `ReviewAdminViewSet` — list/retrieve/PATCH/DELETE. POST запрещён
    (отзывы создаются только публично через `ReviewCreateView`). PUT
    запрещён — модератор меняет только `status`, не тело.
  - `ReviewBulkUpdateView` — `POST /reviews/bulk-update/` для массового
    переключения статуса.
"""
from __future__ import annotations

from rest_framework import filters, mixins, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from hvac_bridge.permissions import IsHvacAdminProxyAllowed

from .admin_serializers import AdminReviewSerializer
from .models import Review


class ReviewAdminViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """list/retrieve/PATCH/DELETE отзывов. Поддерживает фильтры:
      - `status=pending|approved|rejected`
      - `model=<id>`
      - `rating=1..5`
      - `search=<q>` — по `author_name`, `comment`, `pros`, `cons`
      - `ordering=<field>` — `created_at`, `rating` (default `-created_at`)
    """

    permission_classes = [IsHvacAdminProxyAllowed]
    serializer_class = AdminReviewSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["author_name", "comment", "pros", "cons"]
    ordering_fields = ["created_at", "rating"]
    ordering = ["-created_at"]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Review.objects.select_related("model", "model__brand").all()
        params = self.request.query_params

        status_param = params.get("status")
        if status_param in dict(Review.Status.choices):
            qs = qs.filter(status=status_param)

        model_id = params.get("model")
        if model_id and str(model_id).isdigit():
            qs = qs.filter(model_id=int(model_id))

        rating = params.get("rating")
        if rating and str(rating).isdigit():
            qs = qs.filter(rating=int(rating))

        return qs


class ReviewBulkUpdateView(APIView):
    """`POST /reviews/bulk-update/` — массово переключить статус.

    Body: `{"review_ids": [1, 2, 3], "status": "approved"}`.
    Ответ: `{"updated": <int>, "errors": []}`.
    """

    permission_classes = [IsHvacAdminProxyAllowed]

    def post(self, request):
        review_ids = request.data.get("review_ids")
        new_status = request.data.get("status")

        if not isinstance(review_ids, list) or not all(
            isinstance(i, int) and not isinstance(i, bool) for i in review_ids
        ):
            return Response(
                {"detail": "review_ids должен быть списком целых чисел."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid_statuses = [c[0] for c in Review.Status.choices]
        if new_status not in valid_statuses:
            return Response(
                {"detail": f"status должен быть один из {valid_statuses}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated = Review.objects.filter(id__in=review_ids).update(status=new_status)
        return Response(
            {"updated": updated, "errors": []},
            status=status.HTTP_200_OK,
        )
