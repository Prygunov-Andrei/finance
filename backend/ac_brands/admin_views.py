"""Админский API брендов (/api/hvac/rating/brands/...).

Ф8A — CRUD `Brand` + перенос двух Django-admin actions:
  - `POST /brands/normalize-logos/` (light-логотипы 200×56)
  - `POST /brands/generate-dark-logos/` (dark-вариант для тёмной темы)
"""
from __future__ import annotations

from django.core.files.base import ContentFile
from django.utils.text import slugify
from rest_framework import filters, status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from hvac_bridge.permissions import IsHvacAdminProxyAllowed

from .admin_serializers import AdminBrandSerializer
from .models import Brand
from .services.dark_logo_generator import generate_dark_logo
from .services.logo_normalizer import normalize_logo_file


class BrandAdminViewSet(viewsets.ModelViewSet):
    """CRUD брендов рейтинга кондиционеров. Поддерживает фильтры:
      - `is_active=true|false`
      - `origin_class=<id>`
      - `search=<q>` — по `name`
      - `ordering=<field>` — `name`, `created_at`, `sales_start_year_ru`
    """

    permission_classes = [IsHvacAdminProxyAllowed]
    serializer_class = AdminBrandSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at", "sales_start_year_ru"]
    ordering = ["name"]

    def get_queryset(self):
        qs = Brand.objects.select_related("origin_class").all()
        params = self.request.query_params

        is_active = params.get("is_active")
        if is_active in ("true", "false"):
            qs = qs.filter(is_active=(is_active == "true"))

        origin_class = params.get("origin_class")
        if origin_class and str(origin_class).isdigit():
            qs = qs.filter(origin_class_id=int(origin_class))

        return qs


class BrandNormalizeLogosView(APIView):
    """`POST /brands/normalize-logos/`  — нормализовать логотипы (crop + canvas
    200×56). Body: `{"brand_ids": [1, 2]}` (опционально; пусто → все бренды
    с непустым `logo`). Возвращает счётчики обработанных и упавших.
    """

    permission_classes = [IsHvacAdminProxyAllowed]

    def post(self, request):
        brand_ids = request.data.get("brand_ids") or []
        qs = Brand.objects.exclude(logo="")
        if brand_ids:
            qs = qs.filter(id__in=brand_ids)

        ok = 0
        errors: list[dict] = []
        for brand in qs:
            storage = brand.logo.storage
            path = brand.logo.name
            try:
                with storage.open(path, "rb") as f:
                    src = f.read()
                normalized = normalize_logo_file(src)
            except Exception as exc:
                errors.append({"brand_id": brand.id, "error": str(exc)})
                continue
            storage.delete(path)
            storage.save(path, ContentFile(normalized))
            ok += 1

        return Response(
            {"normalized": ok, "errors": errors},
            status=status.HTTP_200_OK,
        )


class BrandGenerateDarkLogosView(APIView):
    """`POST /brands/generate-dark-logos/` — сгенерировать dark-варианты
    логотипов. Body: `{"brand_ids": [1, 2]}` (опционально).
    """

    permission_classes = [IsHvacAdminProxyAllowed]

    def post(self, request):
        brand_ids = request.data.get("brand_ids") or []
        qs = Brand.objects.exclude(logo="")
        if brand_ids:
            qs = qs.filter(id__in=brand_ids)

        ok = 0
        skipped_colored = 0
        errors: list[dict] = []
        for brand in qs:
            storage = brand.logo.storage
            path = brand.logo.name
            try:
                with storage.open(path, "rb") as f:
                    src = f.read()
            except Exception as exc:
                errors.append({"brand_id": brand.id, "error": f"read: {exc}"})
                continue

            try:
                dark_bytes = generate_dark_logo(src)
            except Exception as exc:
                errors.append({"brand_id": brand.id, "error": f"generate: {exc}"})
                continue

            if dark_bytes is None:
                skipped_colored += 1
                continue

            slug = slugify(brand.name) or "brand"
            dark_name = f"ac_rating/brands/dark/{slug}.png"
            dark_storage = brand.logo_dark.storage if brand.logo_dark else storage

            if brand.logo_dark:
                old_name = brand.logo_dark.name
                try:
                    if old_name and dark_storage.exists(old_name):
                        dark_storage.delete(old_name)
                except Exception:
                    pass

            saved_name = dark_storage.save(dark_name, ContentFile(dark_bytes))
            brand.logo_dark = saved_name
            brand.save(update_fields=["logo_dark"])
            ok += 1

        return Response(
            {
                "generated": ok,
                "skipped_colored": skipped_colored,
                "errors": errors,
            },
            status=status.HTTP_200_OK,
        )
