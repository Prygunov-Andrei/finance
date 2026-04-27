"""Сериализаторы админского API заявок (/api/hvac/rating/submissions/).

Ф8C: модератор работает только со статусом / заметками / привязкой
бренда. Тело заявки (характеристики, фото, контакты автора) — read-only.
"""
from __future__ import annotations

from rest_framework import serializers

from .models import ACSubmission, SubmissionPhoto


def _file_url(file_field) -> str:
    """Относительный URL медиа-файла (например `/media/submissions/foo.png`).

    НЕ используем `request.build_absolute_uri` — за BFF proxy
    (`/api/ac-rating-admin/[...path]/`) Django видит HTTP и собирает
    `http://hvac-info.com/...`, что блокируется браузером как mixed
    content на HTTPS-странице. Возвращаем относительный — браузер сам
    соберёт `https://hvac-info.com/media/...` с текущей схемой.
    """
    if not file_field:
        return ""
    return file_field.url


class AdminSubmissionPhotoSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = SubmissionPhoto
        fields = ("id", "image_url", "order")
        read_only_fields = fields

    def get_image_url(self, obj):
        return _file_url(obj.image)


class AdminSubmissionListSerializer(serializers.ModelSerializer):
    brand_name = serializers.SerializerMethodField()
    photos_count = serializers.SerializerMethodField()
    primary_photo_url = serializers.SerializerMethodField()
    converted_model_id = serializers.IntegerField(
        source="converted_model.id", read_only=True, default=None,
    )

    class Meta:
        model = ACSubmission
        fields = (
            "id",
            "status",
            "brand_name",
            "series",
            "inner_unit",
            "outer_unit",
            "nominal_capacity_watt",
            "price",
            "submitter_email",
            "photos_count",
            "primary_photo_url",
            "converted_model_id",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_brand_name(self, obj):
        if obj.brand:
            return obj.brand.name
        return obj.custom_brand_name or "—"

    def get_photos_count(self, obj):
        return obj.photos.count()

    def get_primary_photo_url(self, obj):
        photo = obj.photos.first()
        if not photo:
            return ""
        return _file_url(photo.image)


class AdminSubmissionDetailSerializer(serializers.ModelSerializer):
    """Полная заявка для модератора. Writable: status, admin_notes, brand."""

    photos = AdminSubmissionPhotoSerializer(many=True, read_only=True)
    brand_name = serializers.SerializerMethodField()
    converted_model_id = serializers.IntegerField(
        source="converted_model.id", read_only=True, default=None,
    )

    class Meta:
        model = ACSubmission
        fields = (
            # Идентификаторы / статус / писать можно
            "id",
            "status",
            "admin_notes",
            "brand",
            "brand_name",
            # Тело заявки (read-only)
            "custom_brand_name",
            "series",
            "inner_unit",
            "outer_unit",
            "compressor_model",
            "nominal_capacity_watt",
            "price",
            "drain_pan_heater",
            "erv",
            "fan_speed_outdoor",
            "remote_backlight",
            "fan_speeds_indoor",
            "fine_filters",
            "ionizer_type",
            "russian_remote",
            "uv_lamp",
            "inner_he_length_mm",
            "inner_he_tube_count",
            "inner_he_tube_diameter_mm",
            "inner_he_surface_area",
            "outer_he_length_mm",
            "outer_he_tube_count",
            "outer_he_tube_diameter_mm",
            "outer_he_thickness_mm",
            "outer_he_surface_area",
            "video_url",
            "buy_url",
            "supplier_url",
            # Метаданные автора
            "submitter_email",
            "consent",
            "ip_address",
            # Конверсия
            "converted_model",
            "converted_model_id",
            # Связанное
            "photos",
            # Тайм-штампы
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "brand_name",
            "custom_brand_name",
            "series",
            "inner_unit",
            "outer_unit",
            "compressor_model",
            "nominal_capacity_watt",
            "price",
            "drain_pan_heater",
            "erv",
            "fan_speed_outdoor",
            "remote_backlight",
            "fan_speeds_indoor",
            "fine_filters",
            "ionizer_type",
            "russian_remote",
            "uv_lamp",
            "inner_he_length_mm",
            "inner_he_tube_count",
            "inner_he_tube_diameter_mm",
            "inner_he_surface_area",
            "outer_he_length_mm",
            "outer_he_tube_count",
            "outer_he_tube_diameter_mm",
            "outer_he_thickness_mm",
            "outer_he_surface_area",
            "video_url",
            "buy_url",
            "supplier_url",
            "submitter_email",
            "consent",
            "ip_address",
            "converted_model",
            "converted_model_id",
            "photos",
            "created_at",
            "updated_at",
        )

    def get_brand_name(self, obj):
        if obj.brand:
            return obj.brand.name
        return obj.custom_brand_name or "—"
