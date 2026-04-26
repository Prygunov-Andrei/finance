from __future__ import annotations

from rest_framework import serializers

from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    """Публичный сериализатор для чтения одобренных отзывов.

    Поле `status` намеренно НЕ выводим публично — это внутренняя информация модерации.
    """

    class Meta:
        model = Review
        fields = ["id", "author_name", "rating", "pros", "cons", "comment", "created_at"]
        read_only_fields = fields


class ReviewCreateSerializer(serializers.ModelSerializer):
    """Принимает форму отзыва. Honeypot — поле `website` (должно остаться пустым).

    `status` read-only: всегда pending после создания, фронт показывает «На модерации».
    """

    website = serializers.CharField(
        required=False, allow_blank=True, write_only=True, default="",
    )

    class Meta:
        model = Review
        fields = [
            "id",
            "model",
            "author_name",
            "rating",
            "pros",
            "cons",
            "comment",
            "status",
            "website",
        ]
        read_only_fields = ["id", "status"]

    def validate_website(self, value: str) -> str:
        if value:
            raise serializers.ValidationError("spam detected")
        return value

    def validate(self, attrs):
        attrs.pop("website", None)
        return attrs
