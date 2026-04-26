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
    # Публичный рейтинг отдаёт весь каталог одним ответом: SEO-страница
    # индексируется за один hit, «Свой рейтинг» считает индекс по всем
    # моделям. Глобальный PAGE_SIZE=20 из settings тут не нужен.
    pagination_class = None

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
        if price_min is not None:
            qs = qs.filter(price__gte=price_min)

        # price_max — параметр SEO-страниц /price/do-X-rub. Невалидное значение
        # из URL не должно ронять SSG: при ошибке парсинга молча игнорируем
        # фильтр (graceful fallback), а не возвращаем 400.
        # Модели без цены (price IS NULL) на price-страницах не показываем.
        price_max_raw = self.request.query_params.get("price_max")
        if price_max_raw:
            try:
                price_max_value = float(price_max_raw)
            except (ValueError, TypeError):
                price_max_value = None
            if price_max_value is not None:
                qs = qs.filter(price__isnull=False, price__lte=price_max_value)

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

    # Наследуется от ACModelListView (pagination_class уже None), но фиксируем
    # явно: архив — тоже plain array для фронта.
    pagination_class = None

    def get_queryset(self):
        qs = ACModel.objects.select_related("brand", "brand__origin_class").prefetch_related(
            "regions",
            "raw_values__criterion",
        ).filter(
            publish_status=ACModel.PublishStatus.ARCHIVED,
        ).order_by("-total_index")
        return qs
