"""Сериализаторы админского API методики (/api/hvac/rating/...).

Ф8B-1:
  - `AdminCriterionListSerializer` — краткий формат для list.
  - `AdminCriterionSerializer` — writable-сериализатор для CRUD (с photo).
  - `AdminMethodologyListSerializer` — краткий формат списка версий с
    counters (criteria_count, weight_sum) — поля проставляются через
    annotate в queryset вью.
  - `AdminMethodologyCriterionReadSerializer` — read-only nested-вариант
    для detail-сериализатора методики.
  - `AdminMethodologyDetailSerializer` — полный read-формат версии методики
    с nested methodology_criteria.

Поля строго по фактической схеме `ac_methodology.models` (урок Ф8A).
"""
from __future__ import annotations

from rest_framework import serializers

from .models import (
    Criterion,
    MethodologyCriterion,
    MethodologyVersion,
    RatingPreset,
)


def _file_url(file_field) -> str:
    """Относительный URL медиа-файла (например `/media/criteria/foo.png`).

    НЕ используем `request.build_absolute_uri` — за BFF proxy
    (`/api/ac-rating-admin/[...path]/`) Django видит HTTP и собирает
    `http://hvac-info.com/...`, что блокируется браузером как mixed
    content на HTTPS-странице. Возвращаем относительный — браузер сам
    соберёт `https://hvac-info.com/media/...` с текущей схемой.
    """
    if not file_field:
        return ""
    return file_field.url


class AdminCriterionListSerializer(serializers.ModelSerializer):
    """Список параметров: короткий набор полей + photo_url + счётчик
    методик, в которых параметр участвует."""

    photo_url = serializers.SerializerMethodField()
    methodologies_count = serializers.SerializerMethodField()

    class Meta:
        model = Criterion
        fields = (
            "id",
            "code",
            "name_ru",
            "photo_url",
            "unit",
            "value_type",
            "group",
            "is_active",
            "is_key_measurement",
            "methodologies_count",
        )
        read_only_fields = fields

    def get_photo_url(self, obj: Criterion) -> str:
        return _file_url(obj.photo)

    def get_methodologies_count(self, obj: Criterion) -> int:
        # Аннотация может быть проставлена queryset'ом (`_methodologies_count`),
        # иначе считаем «на лету» — таблица маленькая.
        annotated = getattr(obj, "_methodologies_count", None)
        if annotated is not None:
            return int(annotated)
        return obj.methodologies.count()


class AdminCriterionSerializer(serializers.ModelSerializer):
    """Writable сериализатор для retrieve/create/update.

    `photo` — стандартный ImageField (multipart). `photo_url` — read-only
    полный URL для удобства фронта.
    """

    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Criterion
        fields = (
            "id",
            "code",
            "name_ru", "name_en", "name_de", "name_pt",
            "description_ru", "description_en", "description_de", "description_pt",
            "unit",
            "photo", "photo_url",
            "value_type",
            "group",
            "is_active",
            "is_key_measurement",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "photo_url", "created_at", "updated_at")
        extra_kwargs = {
            "photo": {"required": False, "allow_null": True},
        }

    def get_photo_url(self, obj: Criterion) -> str:
        return _file_url(obj.photo)


class AdminMethodologyCriterionReadSerializer(serializers.ModelSerializer):
    """Read-only nested-сериализатор для использования внутри
    `AdminMethodologyDetailSerializer`. Возвращает все настройки скоринга
    + nested critterion (краткий).
    """

    criterion = AdminCriterionListSerializer(read_only=True)

    class Meta:
        model = MethodologyCriterion
        fields = (
            "id",
            "criterion",
            "scoring_type",
            "weight",
            "min_value", "median_value", "max_value",
            "is_inverted",
            "median_by_capacity",
            "custom_scale_json",
            "formula_json",
            "is_required_lab", "is_required_checklist", "is_required_catalog",
            "use_in_lab", "use_in_checklist", "use_in_catalog",
            "region_scope",
            "is_public",
            "display_order",
            "is_active",
        )
        read_only_fields = fields


class AdminMethodologyListSerializer(serializers.ModelSerializer):
    """Список версий методики с annotated counters."""

    criteria_count = serializers.SerializerMethodField()
    weight_sum = serializers.SerializerMethodField()

    class Meta:
        model = MethodologyVersion
        fields = (
            "id",
            "version",
            "name",
            "is_active",
            "criteria_count",
            "weight_sum",
            "needs_recalculation",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_criteria_count(self, obj: MethodologyVersion) -> int:
        annotated = getattr(obj, "_criteria_count", None)
        if annotated is not None:
            return int(annotated)
        return obj.methodology_criteria.filter(is_active=True).count()

    def get_weight_sum(self, obj: MethodologyVersion) -> float:
        annotated = getattr(obj, "_weight_sum", None)
        if annotated is None:
            from django.db.models import Sum
            annotated = obj.methodology_criteria.filter(is_active=True).aggregate(
                s=Sum("weight"),
            )["s"]
        return round(float(annotated or 0.0), 2)


class AdminRatingPresetSerializer(serializers.ModelSerializer):
    """Writable сериализатор пресета таба «Свой рейтинг».

    `criteria_ids` — write/read список id критериев (M2M `criteria`).
    `criteria_count` — read-only маркер: при `is_all_selected=True` возвращает
    -1 (фронт интерпретирует как «ВСЕ»), иначе фактическое число связанных
    критериев. M2M синхронизируется через `instance.criteria.set(...)`.
    """

    criteria_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Criterion.objects.all(),
        source="criteria",
        required=False,
    )
    criteria_count = serializers.SerializerMethodField()

    class Meta:
        model = RatingPreset
        fields = (
            "id",
            "slug",
            "label",
            "order",
            "is_active",
            "description",
            "is_all_selected",
            "criteria_ids",
            "criteria_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "criteria_count", "created_at", "updated_at")

    def get_criteria_count(self, obj: RatingPreset) -> int:
        if obj.is_all_selected:
            return -1
        return obj.criteria.count()


class AdminMethodologyDetailSerializer(serializers.ModelSerializer):
    """Полная read-only версия методики с nested critteria."""

    criteria_count = serializers.SerializerMethodField()
    weight_sum = serializers.SerializerMethodField()
    methodology_criteria = AdminMethodologyCriterionReadSerializer(
        many=True, read_only=True,
    )

    class Meta:
        model = MethodologyVersion
        fields = (
            "id",
            "version",
            "name",
            "description",
            "tab_description_index",
            "tab_description_quiet",
            "tab_description_custom",
            "is_active",
            "needs_recalculation",
            "criteria_count",
            "weight_sum",
            "methodology_criteria",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_criteria_count(self, obj: MethodologyVersion) -> int:
        annotated = getattr(obj, "_criteria_count", None)
        if annotated is not None:
            return int(annotated)
        return obj.methodology_criteria.filter(is_active=True).count()

    def get_weight_sum(self, obj: MethodologyVersion) -> float:
        annotated = getattr(obj, "_weight_sum", None)
        if annotated is None:
            from django.db.models import Sum
            annotated = obj.methodology_criteria.filter(is_active=True).aggregate(
                s=Sum("weight"),
            )["s"]
        return round(float(annotated or 0.0), 2)
