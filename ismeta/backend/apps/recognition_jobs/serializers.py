"""DRF serializers для RecognitionJob (E19-2).

`items` и `file_blob` НЕ включаются в list-сериализацию: items могут быть
тяжёлыми (тысячи позиций) и нужны только для apply_parsed_items, который
вызывается прямо в callback handler. file_blob — это сырой PDF, который
не нужен фронту никогда.
"""

from __future__ import annotations

from rest_framework import serializers

from .models import RecognitionJob


class RecognitionJobSerializer(serializers.ModelSerializer):
    """Полный сериалайзер для GET detail / POST create response."""

    estimate_id = serializers.UUIDField(source="estimate.id", read_only=True)
    estimate_name = serializers.CharField(source="estimate.name", read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    duration_seconds = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = RecognitionJob
        fields = [
            "id",
            "estimate_id",
            "estimate_name",
            "file_name",
            "file_type",
            "profile_id",
            "status",
            "pages_total",
            "pages_done",
            "items_count",
            "pages_summary",
            "llm_costs",
            "error_message",
            "apply_result",
            "is_active",
            "duration_seconds",
            "created_at",
            "started_at",
            "completed_at",
        ]
        read_only_fields = fields
