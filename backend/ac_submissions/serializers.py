from __future__ import annotations

from rest_framework import serializers

from ac_brands.models import Brand

from .models import ACSubmission


class BrandListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ["id", "name"]
        read_only_fields = fields


class ACSubmissionCreateSerializer(serializers.ModelSerializer):
    website = serializers.CharField(
        required=False, allow_blank=True, write_only=True, default="",
    )

    class Meta:
        model = ACSubmission
        fields = [
            "brand",
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
            "outer_he_length_mm",
            "outer_he_tube_count",
            "outer_he_tube_diameter_mm",
            "outer_he_thickness_mm",
            "video_url",
            "buy_url",
            "supplier_url",
            "submitter_email",
            "consent",
            "website",
        ]

    def validate_website(self, value: str) -> str:
        if value:
            raise serializers.ValidationError("spam detected")
        return value

    def validate_fine_filters(self, value: int) -> int:
        if value not in (0, 1, 2):
            raise serializers.ValidationError("Допустимые значения: 0, 1, 2.")
        return value

    def validate_consent(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError(
                "Необходимо согласие на обработку персональных данных.",
            )
        return value

    def validate(self, attrs):
        attrs.pop("website", None)
        if not attrs.get("brand") and not attrs.get("custom_brand_name"):
            raise serializers.ValidationError(
                {"brand": "Укажите бренд из списка или введите название вручную."},
            )
        return attrs
