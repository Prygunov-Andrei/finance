"""DRF serializers для LLMProfile + ImportLog (E18-2)."""

from __future__ import annotations

import logging

from rest_framework import serializers

from .models import ImportLog, LLMProfile

logger = logging.getLogger(__name__)


class LLMProfileSerializer(serializers.ModelSerializer):
    """ModelSerializer для LLMProfile.

    api_key — write-only (plain string на create/update); никогда не возвращается.
    api_key_preview — read-only "***last4" формат, контракт frontend.
    """

    api_key = serializers.CharField(write_only=True, required=False, allow_blank=False)
    api_key_preview = serializers.SerializerMethodField()

    class Meta:
        model = LLMProfile
        fields = [
            "id",
            "name",
            "base_url",
            "extract_model",
            "multimodal_model",
            "classify_model",
            "vision_supported",
            "is_default",
            "api_key",
            "api_key_preview",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def get_api_key_preview(self, obj: LLMProfile) -> str:
        # api_key_encrypted может быть пустой (если БД повреждена); в этом
        # случае возвращаем "***" вместо падения. encrypt/decrypt бросает
        # ImproperlyConfigured если key не задан — обработаем как «нет данных».
        try:
            plain = obj.get_api_key()
        except Exception as e:  # noqa: BLE001 — preview не должен падать на list
            logger.warning("api_key_preview decrypt failed: %s", e)
            return "***"
        return f"***{plain[-4:]}" if len(plain) >= 4 else "***"

    def validate_is_default(self, value: bool) -> bool:
        # is_default через PATCH/POST НЕ переключаем атомарно — это делает
        # set_default action. Здесь просто разрешаем флаг, но если value=True
        # И уже есть другой default — UniqueConstraint вернёт IntegrityError.
        # Frontend должен использовать /set-default/ endpoint.
        return value

    def create(self, validated_data: dict) -> LLMProfile:
        api_key = validated_data.pop("api_key", None)
        if not api_key:
            raise serializers.ValidationError({"api_key": "Required on create"})
        instance = LLMProfile(**validated_data)
        instance.set_api_key(api_key)
        instance.save()
        return instance

    def update(self, instance: LLMProfile, validated_data: dict) -> LLMProfile:
        api_key = validated_data.pop("api_key", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if api_key:
            instance.set_api_key(api_key)
        instance.save()
        return instance


class ImportLogSerializer(serializers.ModelSerializer):
    profile_name = serializers.CharField(source="profile.name", read_only=True, default="")
    estimate_name = serializers.CharField(source="estimate.name", read_only=True, default="")

    class Meta:
        model = ImportLog
        fields = [
            "id",
            "estimate",
            "estimate_name",
            "file_type",
            "file_name",
            "profile",
            "profile_name",
            "cost_usd",
            "items_created",
            "pages_processed",
            "llm_metadata",
            "created_at",
        ]
        read_only_fields = fields
