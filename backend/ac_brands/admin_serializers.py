"""Сериализаторы админского API брендов (/api/hvac/rating/brands/).

Writable-аналоги публичных сериализаторов из `ac_catalog.serializers`.
Поля строго по фактической схеме `ac_brands.models.Brand` (Ф8A).
"""
from __future__ import annotations

from rest_framework import serializers

from ac_brands.models import Brand, BrandOriginClass


def _file_url(file_field) -> str:
    """Относительный URL медиа-файла (например `/media/brands/aqua.png`).

    НЕ используем `request.build_absolute_uri` — за BFF proxy
    (`/api/ac-rating-admin/[...path]/`) Django видит HTTP и собирает
    `http://hvac-info.com/...`, что блокируется браузером как mixed
    content на HTTPS-странице. Возвращаем относительный — браузер сам
    соберёт `https://hvac-info.com/media/...` с текущей схемой.
    """
    if not file_field:
        return ""
    return file_field.url


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
        return _file_url(obj.logo)

    def get_logo_dark_url(self, obj: Brand) -> str:
        return _file_url(obj.logo_dark)
