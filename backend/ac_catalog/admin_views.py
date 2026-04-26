"""Админский API каталога моделей кондиционеров (/api/hvac/rating/...).

Ф8A — CRUD для `ACModel`, photo upload/reorder, recalculate, справочники
EquipmentType / Region. Вся бизнес-логика расчёта индекса переиспользует
`ac_scoring.engine.update_model_total_index` (тот же путь, что Django-admin
action и signal).
"""
from __future__ import annotations

from django.core.files.uploadedfile import UploadedFile
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import filters, generics, status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from ac_methodology.models import MethodologyVersion
from ac_scoring.engine import update_model_total_index
from hvac_bridge.permissions import IsHvacAdminProxyAllowed

from .admin_serializers import (
    AdminACModelDetailSerializer,
    AdminACModelListSerializer,
    AdminACModelPhotoSerializer,
    EquipmentTypeAdminSerializer,
)
from .models import ACModel, ACModelPhoto, EquipmentType, ModelRegion


MAX_PHOTOS = 6


class ACModelAdminViewSet(viewsets.ModelViewSet):
    """CRUD моделей кондиционеров для ERP-операторов.

    Список фильтров (query string):
      - `brand=<id>` (повторяется для multi)
      - `publish_status=draft|review|published|archived`
      - `equipment_type=<id>`
      - `region=<code>` (`ru`/`eu`)
      - `search=<q>` — по `inner_unit`, `outer_unit`, `series`, `brand__name`
      - `ordering=<field>` — `total_index`, `inner_unit`, `created_at` (с `-` для DESC)
    """

    permission_classes = [IsHvacAdminProxyAllowed]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["inner_unit", "outer_unit", "series", "brand__name"]
    ordering_fields = ["total_index", "inner_unit", "created_at"]
    ordering = ["-total_index"]

    def get_serializer_class(self):
        if self.action == "list":
            return AdminACModelListSerializer
        return AdminACModelDetailSerializer

    def get_queryset(self):
        qs = ACModel.objects.select_related(
            "brand", "brand__origin_class", "equipment_type",
        ).prefetch_related(
            "photos", "suppliers", "regions",
            "raw_values__criterion",
        )

        params = self.request.query_params

        brands = params.getlist("brand")
        if brands:
            qs = qs.filter(brand_id__in=[b for b in brands if str(b).isdigit()])

        publish_status = params.get("publish_status")
        if publish_status:
            qs = qs.filter(publish_status=publish_status)

        equipment_type = params.get("equipment_type")
        if equipment_type and str(equipment_type).isdigit():
            qs = qs.filter(equipment_type_id=int(equipment_type))

        region = params.get("region")
        if region:
            qs = qs.filter(regions__region_code=region).distinct()

        return qs


class ACModelRecalculateView(APIView):
    """Пересчитать `total_index` одной модели (использует тот же путь,
    что Django-admin action: `ac_scoring.engine.update_model_total_index`).
    """

    permission_classes = [IsHvacAdminProxyAllowed]

    def post(self, request, pk: int):
        model = get_object_or_404(
            ACModel.objects.select_related("brand", "brand__origin_class"),
            pk=pk,
        )
        if not MethodologyVersion.objects.filter(is_active=True).exists():
            return Response(
                {"detail": "Нет активной методики — пересчёт невозможен."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        updated = update_model_total_index(model)
        # update_model_total_index пересохраняет total_index, но instance в
        # памяти — старый. Перечитываем из БД для актуального ответа.
        model.refresh_from_db()
        serializer = AdminACModelDetailSerializer(
            model, context={"request": request},
        )
        return Response(
            {
                "recalculated": bool(updated),
                "model": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class ACModelPhotoListCreateView(generics.ListCreateAPIView):
    """`GET /models/{model_id}/photos/`  — список фото модели.
    `POST /models/{model_id}/photos/` — multipart upload с лимитом MAX_PHOTOS.
    """

    permission_classes = [IsHvacAdminProxyAllowed]
    serializer_class = AdminACModelPhotoSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return ACModelPhoto.objects.filter(model_id=self.kwargs["model_id"])

    def create(self, request, *args, **kwargs):
        model = get_object_or_404(ACModel, pk=self.kwargs["model_id"])

        if model.photos.count() >= MAX_PHOTOS:
            return Response(
                {"detail": f"Достигнут лимит фото на модель ({MAX_PHOTOS})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        image = request.data.get("image")
        if not isinstance(image, UploadedFile):
            return Response(
                {"image": ["Файл изображения обязателен (multipart/form-data)."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # `order`: в хвост, если не указан явно.
        order = serializer.validated_data.get("order")
        if order is None:
            last = model.photos.order_by("-order").first()
            order = (last.order + 1) if last is not None else 0
        photo = ACModelPhoto.objects.create(
            model=model,
            image=image,
            alt=serializer.validated_data.get("alt", ""),
            order=order,
        )
        out = self.get_serializer(photo)
        headers = self.get_success_headers(out.data)
        return Response(out.data, status=status.HTTP_201_CREATED, headers=headers)


class ACModelPhotoDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsHvacAdminProxyAllowed]
    serializer_class = AdminACModelPhotoSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return ACModelPhoto.objects.filter(model_id=self.kwargs["model_id"])


class ACModelPhotoReorderView(APIView):
    """`POST /models/{model_id}/photos/reorder/` `{"ids": [3, 1, 2]}`.

    Устанавливает `order` = индекс в массиве. Любой id, не принадлежащий
    модели, → 400 (валидация целостности payload).
    """

    permission_classes = [IsHvacAdminProxyAllowed]

    def post(self, request, model_id: int):
        model = get_object_or_404(ACModel, pk=model_id)
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            return Response(
                {"detail": "Поле 'ids' должно быть списком целых чисел."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        photos = list(model.photos.filter(id__in=ids))
        photos_by_id = {p.id: p for p in photos}
        if set(photos_by_id.keys()) != set(ids):
            return Response(
                {"detail": "Список ids не совпадает с фото этой модели."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for index, pid in enumerate(ids):
            photo = photos_by_id[pid]
            if photo.order != index:
                photo.order = index
                photo.save(update_fields=["order"])

        out = AdminACModelPhotoSerializer(
            model.photos.order_by("order", "id"),
            many=True,
            context={"request": request},
        )
        return Response({"photos": out.data}, status=status.HTTP_200_OK)


class EquipmentTypeAdminViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only справочник типов оборудования для dropdown'ов админки."""

    permission_classes = [IsHvacAdminProxyAllowed]
    serializer_class = EquipmentTypeAdminSerializer
    queryset = EquipmentType.objects.all().order_by("name")
    pagination_class = None


class ModelRegionAdminViewSet(viewsets.GenericViewSet):
    """Read-only список регионов из `ModelRegion.RegionCode.choices`.

    Отдельной таблицы Region нет — отдаём константы. Фронт использует для
    multi-select при редактировании моделей.
    """

    permission_classes = [IsHvacAdminProxyAllowed]
    pagination_class = None

    def list(self, request):
        data = [
            {"code": code, "label": label}
            for code, label in ModelRegion.RegionCode.choices
        ]
        return Response(data, status=status.HTTP_200_OK)
