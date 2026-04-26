"""Админский API методики (/api/hvac/rating/criteria/, /methodologies/).

Ф8B-1:
  - `CriterionAdminViewSet` — CRUD справочника параметров (с photo upload).
  - `MethodologyAdminViewSet` — list/retrieve версий методики + кастомное
    действие `activate` (POST /methodologies/{id}/activate/). Создание/
    редактирование/удаление версий — только через Django-admin (clone).
"""
from __future__ import annotations

from django.db.models import Count, Q, Sum
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from hvac_bridge.permissions import IsHvacAdminProxyAllowed

from .admin_serializers import (
    AdminCriterionListSerializer,
    AdminCriterionSerializer,
    AdminMethodologyDetailSerializer,
    AdminMethodologyListSerializer,
    AdminRatingPresetSerializer,
)
from .models import Criterion, MethodologyVersion, RatingPreset


class CriterionAdminViewSet(viewsets.ModelViewSet):
    """CRUD справочника параметров рейтинга. Поддерживает фильтры:
      - `value_type=numeric|binary|categorical|...`
      - `group=climate|compressor|acoustics|...`
      - `is_active=true|false`
      - `is_key_measurement=true|false`
      - `search=<q>` — по `code`, `name_ru`, `name_en`
      - `ordering=<field>` — `code`, `created_at`
    """

    permission_classes = [IsHvacAdminProxyAllowed]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["code", "name_ru", "name_en"]
    ordering_fields = ["code", "created_at"]
    ordering = ["code"]

    def get_serializer_class(self):
        if self.action == "list":
            return AdminCriterionListSerializer
        return AdminCriterionSerializer

    def get_queryset(self):
        qs = Criterion.objects.all().annotate(
            _methodologies_count=Count("methodology_entries", distinct=True),
        )
        params = self.request.query_params

        value_type = params.get("value_type")
        if value_type:
            qs = qs.filter(value_type=value_type)

        group = params.get("group")
        if group:
            qs = qs.filter(group=group)

        is_active = params.get("is_active")
        if is_active in ("true", "false"):
            qs = qs.filter(is_active=(is_active == "true"))

        is_key = params.get("is_key_measurement")
        if is_key in ("true", "false"):
            qs = qs.filter(is_key_measurement=(is_key == "true"))

        return qs


class MethodologyAdminViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only список версий методики + действие activate.

    Создание/редактирование/удаление версий — только через Django-admin
    (см. `ac_methodology.admin.methodology_version`). Здесь — только
    просмотр и переключение активной версии.
    """

    permission_classes = [IsHvacAdminProxyAllowed]

    def get_queryset(self):
        qs = MethodologyVersion.objects.all().annotate(
            _criteria_count=Count(
                "methodology_criteria",
                filter=Q(methodology_criteria__is_active=True),
                distinct=True,
            ),
            _weight_sum=Sum(
                "methodology_criteria__weight",
                filter=Q(methodology_criteria__is_active=True),
            ),
        ).order_by("-is_active", "-created_at")
        if self.action == "retrieve":
            qs = qs.prefetch_related(
                "methodology_criteria__criterion",
            )
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return AdminMethodologyListSerializer
        return AdminMethodologyDetailSerializer

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        """Сделать версию активной. Если уже активна — no-op (200).

        `MethodologyVersion.save()` атомарно сбрасывает `is_active=False`
        у остальных в той же транзакции (см. `models.py:47-58`).
        """
        version = self.get_object()
        if not version.is_active:
            version.is_active = True
            version.save()
            # После save() пересчитаем counters/связи через get_object().
            version = self.get_queryset().get(pk=version.pk)
        serializer = AdminMethodologyDetailSerializer(
            version, context={"request": request},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class RatingPresetAdminViewSet(viewsets.ModelViewSet):
    """CRUD пресетов таба «Свой рейтинг». Поддерживает фильтры:
      - `is_active=true|false`
      - `is_all_selected=true|false`
      - `search=<q>` — по `slug`, `label`
      - `ordering=<field>` — `order`, `created_at`
    """

    permission_classes = [IsHvacAdminProxyAllowed]
    serializer_class = AdminRatingPresetSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["slug", "label"]
    ordering_fields = ["order", "created_at"]
    ordering = ["order"]

    def get_queryset(self):
        qs = RatingPreset.objects.all().prefetch_related("criteria")
        params = self.request.query_params

        is_active = params.get("is_active")
        if is_active in ("true", "false"):
            qs = qs.filter(is_active=(is_active == "true"))

        is_all_selected = params.get("is_all_selected")
        if is_all_selected in ("true", "false"):
            qs = qs.filter(is_all_selected=(is_all_selected == "true"))

        return qs
