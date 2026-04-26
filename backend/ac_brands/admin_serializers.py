"""Сериализаторы админского API брендов (/api/hvac/rating/brands/).

Writable-аналоги публичных сериализаторов из `ac_catalog.serializers`.
Поля строго по фактической схеме `ac_brands.models.Brand` (Ф8A).
"""
from __future__ import annotations

from rest_framework import serializers

from ac_brands.models import Brand, BrandOriginClass


def _absolute_url(request, file_field) -> str:
    if not file_field:
        return ""
    url = file_field.url
    if request is not None:
        return request.build_absolute_uri(url)
    return url


class BrandOriginClassAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = BrandOriginClass
        fields = ("id", "origin_type", "fallback_score")
        read_only_fields = ("id",)


class AdminBrandSerializer(serializers.ModelSerializer):
    models_count = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()
    logo_dark_url = serializers.SerializerMethodField()
    origin_class_name = serializers.CharField(
        source="origin_class.origin_type", read_only=True, default=None,
    )

    class Meta:
        model = Brand
        fields = (
            "id", "name",
            "logo", "logo_dark",
            "logo_url", "logo_dark_url",
            "is_active",
            "origin_class", "origin_class_name",
            "sales_start_year_ru",
            "models_count",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {
            "logo": {"required": False, "allow_null": True},
            "logo_dark": {"required": False, "allow_null": True},
        }

    def get_models_count(self, obj: Brand) -> int:
        return obj.models.count()

    def get_logo_url(self, obj: Brand) -> str:
        return _absolute_url(self.context.get("request"), obj.logo)

    def get_logo_dark_url(self, obj: Brand) -> str:
        return _absolute_url(self.context.get("request"), obj.logo_dark)
