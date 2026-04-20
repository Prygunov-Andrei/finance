from __future__ import annotations

from rest_framework import generics
from rest_framework.permissions import AllowAny

from ac_methodology.models import MethodologyCriterion, MethodologyVersion
from ac_scoring.engine import max_possible_total_index

from ..models import ACModel
from ..serializers import ACModelDetailSerializer, ACModelListSerializer
from ..stats import rank_subquery
from .base import LangMixin, parse_float_param


class ACModelListView(LangMixin, generics.ListAPIView):
    serializer_class = ACModelListSerializer
    permission_classes = [AllowAny]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        active = MethodologyVersion.objects.filter(is_active=True).first()
        ctx["index_max"] = max_possible_total_index(active)
        ctx["methodology"] = active
        ctx["criteria"] = list(
            MethodologyCriterion.objects.filter(
                methodology=active, is_active=True,
            ).select_related("criterion").order_by("display_order", "criterion__code")
        ) if active else []
        # noise_mc — отдельно, БЕЗ фильтра is_active. Нужен для таба
        # «Самые тихие»: он должен работать, даже если noise снят с is_active
        # в активной методике (и потому не участвует в общем индексе).
        ctx["noise_mc"] = (
            MethodologyCriterion.objects
            .filter(methodology=active, criterion__code="noise")
            .select_related("criterion")
            .first()
        ) if active else None
        return ctx

    def get_queryset(self):
        qs = ACModel.objects.select_related("brand", "brand__origin_class").prefetch_related(
            "regions",
            "raw_values__criterion",
        ).filter(
            publish_status=ACModel.PublishStatus.PUBLISHED,
        ).annotate(
            # rank коррелирует с total_index конкретной строки; фильтры ниже
            # не меняют значение rank, т.к. subquery смотрит на весь
            # published-каталог, не на внешний WHERE.
            rank=rank_subquery(),
        ).order_by("-total_index")

        brand = self.request.query_params.get("brand")
        if brand:
            qs = qs.filter(brand__name__icontains=brand)

        region = self.request.query_params.get("region")
        if region:
            qs = qs.filter(regions__region_code=region)

        capacity_min = parse_float_param(
            self.request.query_params.get("capacity_min"), "capacity_min",
        )
        capacity_max = parse_float_param(
            self.request.query_params.get("capacity_max"), "capacity_max",
        )
        if capacity_min is not None:
            qs = qs.filter(nominal_capacity__gte=capacity_min)
        if capacity_max is not None:
            qs = qs.filter(nominal_capacity__lte=capacity_max)

        price_min = parse_float_param(
            self.request.query_params.get("price_min"), "price_min",
        )
        price_max = parse_float_param(
            self.request.query_params.get("price_max"), "price_max",
        )
        if price_min is not None:
            qs = qs.filter(price__gte=price_min)
        if price_max is not None:
            qs = qs.filter(price__lte=price_max)

        return qs


class ACModelDetailView(LangMixin, generics.RetrieveAPIView):
    serializer_class = ACModelDetailSerializer
    permission_classes = [AllowAny]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        # Один вычисленный median на весь запрос (а не на каждый
        # SerializerMethodField вызов).
        from ..stats import published_median_total_index
        ctx["median_total_index"] = published_median_total_index()
        return ctx

    def get_queryset(self):
        return ACModel.objects.select_related("brand").prefetch_related(
            "regions",
            "raw_values__criterion",
            "calculation_results__run__methodology",
            "calculation_results__criterion",
            "photos",
            "suppliers",
        )


class ACModelDetailBySlugView(ACModelDetailView):
    lookup_field = "slug"


class ACModelArchiveListView(ACModelListView):
    """Список архивных моделей."""

    def get_queryset(self):
        qs = ACModel.objects.select_related("brand", "brand__origin_class").prefetch_related(
            "regions",
            "raw_values__criterion",
        ).filter(
            publish_status=ACModel.PublishStatus.ARCHIVED,
        ).order_by("-total_index")
        return qs
