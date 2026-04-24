"""Serializers для Estimate API (E4.1)."""

from rest_framework import serializers

from apps.estimate.models import Estimate, EstimateItem, EstimateSection
from apps.estimate.schemas import MarkupConfig

# TD-02 (#29): cap для Estimate.note — чтобы не злоупотребляли free-form стикером.
ESTIMATE_NOTE_MAX_LENGTH = 5000


class EstimateListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Estimate
        fields = [
            "id", "name", "status", "folder_name", "version_number",
            "total_equipment", "total_materials", "total_works", "total_amount",
            "man_hours", "updated_at",
        ]


class EstimateDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Estimate
        fields = [
            "id", "workspace", "folder_name", "name", "status",
            "version_number", "parent_version", "version",
            "default_material_markup", "default_work_markup",
            "total_equipment", "total_materials", "total_works", "total_amount",
            "man_hours", "profitability_percent", "advance_amount", "estimated_days",
            "note",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "workspace", "version", "created_by", "created_at", "updated_at",
            "total_equipment", "total_materials", "total_works", "total_amount", "man_hours",
        ]

    def validate_default_material_markup(self, value):
        if value:
            MarkupConfig.model_validate(value)
        return value

    def validate_default_work_markup(self, value):
        if value:
            MarkupConfig.model_validate(value)
        return value

    def validate_note(self, value):
        if value is None:
            return ""
        if len(value) > ESTIMATE_NOTE_MAX_LENGTH:
            raise serializers.ValidationError(
                f"Заметка не должна превышать {ESTIMATE_NOTE_MAX_LENGTH} символов "
                f"(передано {len(value)})."
            )
        return value


class EstimateCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Estimate
        fields = ["name", "folder_name", "default_material_markup", "default_work_markup"]

    def validate_default_material_markup(self, value):
        if value:
            MarkupConfig.model_validate(value)
        return value

    def validate_default_work_markup(self, value):
        if value:
            MarkupConfig.model_validate(value)
        return value


class EstimateSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = EstimateSection
        fields = [
            "id", "estimate", "name", "sort_order", "version",
            "material_markup", "work_markup", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "estimate", "version", "created_at", "updated_at"]

    def validate_material_markup(self, value):
        if value:
            MarkupConfig.model_validate(value)
        return value

    def validate_work_markup(self, value):
        if value:
            MarkupConfig.model_validate(value)
        return value


class EstimateItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = EstimateItem
        fields = [
            "id", "section", "estimate", "row_id", "sort_order",
            "name", "unit", "quantity",
            "equipment_price", "material_price", "work_price",
            "equipment_total", "material_total", "work_total", "total",
            "version", "match_source",
            "material_markup", "work_markup", "tech_specs", "custom_data",
            "is_deleted", "is_key_equipment", "procurement_status", "man_hours",
            "created_at", "updated_at",
        ]


class EstimateItemCreateSerializer(serializers.Serializer):
    """Для POST — без computed полей."""

    section_id = serializers.UUIDField()
    name = serializers.CharField(max_length=500)
    unit = serializers.CharField(max_length=50, default="шт")
    quantity = serializers.DecimalField(max_digits=14, decimal_places=4, default=0)
    equipment_price = serializers.DecimalField(max_digits=19, decimal_places=2, default=0)
    material_price = serializers.DecimalField(max_digits=19, decimal_places=2, default=0)
    work_price = serializers.DecimalField(max_digits=19, decimal_places=2, default=0)
    sort_order = serializers.IntegerField(default=0)
    match_source = serializers.CharField(default="manual")
    is_key_equipment = serializers.BooleanField(default=False)
    procurement_status = serializers.CharField(default="none")
    man_hours = serializers.DecimalField(max_digits=10, decimal_places=2, default=0)
    tech_specs = serializers.JSONField(default=dict)
    custom_data = serializers.JSONField(default=dict)
