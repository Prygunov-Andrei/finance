from __future__ import annotations

from rest_framework import serializers

from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    """Публичный сериализатор для чтения одобренных отзывов."""

    class Meta:
        model = Review
        fields = ["id", "author_name", "rating", "pros", "cons", "comment", "created_at"]
        read_only_fields = fields


class ReviewCreateSerializer(serializers.ModelSerializer):
    """Принимает форму отзыва. Honeypot — поле `website` (должно остаться пустым)."""

    website = serializers.CharField(
        required=False, allow_blank=True, write_only=True, default="",
    )

    class Meta:
        model = Review
        fields = ["model", "author_name", "rating", "pros", "cons", "comment", "website"]

    def validate_website(self, value: str) -> str:
        if value:
            raise serializers.ValidationError("spam detected")
        return value

    def validate(self, attrs):
        attrs.pop("website", None)
        return attrs
