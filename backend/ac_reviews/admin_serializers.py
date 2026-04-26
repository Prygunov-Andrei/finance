"""Сериализаторы админского API отзывов (/api/hvac/rating/reviews/).

Ф8B-2: модератор только модерирует — `status` writable, тело отзыва
(rating, pros, cons, comment, author_name) остаётся read-only. Фронт
получает денормализованные поля модели (бренд / inner_unit / slug).
"""
from __future__ import annotations

from rest_framework import serializers

from .models import Review


class AdminReviewSerializer(serializers.ModelSerializer):
    model_brand = serializers.CharField(source="model.brand.name", read_only=True)
    model_inner_unit = serializers.CharField(source="model.inner_unit", read_only=True)
    model_slug = serializers.CharField(source="model.slug", read_only=True)

    class Meta:
        model = Review
        fields = (
            "id",
            "model",
            "model_brand",
            "model_inner_unit",
            "model_slug",
            "author_name",
            "rating",
            "pros",
            "cons",
            "comment",
            "status",
            "ip_address",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "model",
            "model_brand",
            "model_inner_unit",
            "model_slug",
            "author_name",
            "rating",
            "pros",
            "cons",
            "comment",
            "ip_address",
            "created_at",
            "updated_at",
        )
