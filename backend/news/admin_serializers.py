from rest_framework import serializers

from .models import FeaturedNewsSettings, NewsCategory


class FeaturedNewsSettingsSerializer(serializers.ModelSerializer):
    """Сериализатор singleton-настроек featured-новости.

    `category` — slug активной NewsCategory (FK с to_field='slug'). Допускает null.
    """

    category = serializers.SlugRelatedField(
        slug_field="slug",
        queryset=NewsCategory.objects.filter(is_active=True),
        allow_null=True,
        required=False,
    )
    category_name = serializers.CharField(
        source="category.name", read_only=True, default=None,
    )
    category_slug = serializers.CharField(
        source="category.slug", read_only=True, default=None,
    )

    class Meta:
        model = FeaturedNewsSettings
        fields = (
            "id",
            "category",
            "category_name",
            "category_slug",
            "updated_at",
        )
        read_only_fields = ("id", "updated_at", "category_name", "category_slug")
