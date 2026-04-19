from __future__ import annotations

from rest_framework import serializers

from ac_brands.models import Brand
from ac_catalog.i18n import DEFAULT_LANGUAGE, get_localized_field
from ac_methodology.models import MethodologyCriterion, MethodologyVersion
from ac_scoring.engine import compute_scores_for_model, max_possible_total_index
from ac_scoring.engine.computation import _build_model_context, _get_scorer
from ac_scoring.models import CalculationResult

from .models import ACModel, ACModelPhoto, ACModelSupplier, ModelRawValue, ModelRegion


class BrandSerializer(serializers.ModelSerializer):
    logo = serializers.SerializerMethodField()

    class Meta:
        model = Brand
        fields = ["id", "name", "logo"]
        read_only_fields = ["id", "name"]

    def get_logo(self, obj: Brand) -> str:
        if not obj.logo:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.logo.url)
        return obj.logo.url


class RegionSerializer(serializers.ModelSerializer):
    region_display = serializers.CharField(source="get_region_code_display", read_only=True)

    class Meta:
        model = ModelRegion
        fields = ["region_code", "region_display"]
        read_only_fields = fields


class ParameterScoreSerializer(serializers.ModelSerializer):
    criterion_code = serializers.CharField(source="criterion.code", read_only=True)
    criterion_name = serializers.CharField(source="criterion.name_ru", read_only=True)
    unit = serializers.CharField(source="criterion.unit", read_only=True)

    class Meta:
        model = CalculationResult
        fields = [
            "criterion_code", "criterion_name", "unit",
            "raw_value", "normalized_score", "weighted_score", "above_reference",
        ]
        read_only_fields = fields


class RawValueSerializer(serializers.ModelSerializer):
    criterion_code = serializers.SerializerMethodField()
    criterion_name = serializers.SerializerMethodField()
    verification_display = serializers.CharField(source="get_verification_status_display", read_only=True)

    class Meta:
        model = ModelRawValue
        fields = [
            "criterion_code", "criterion_name",
            "raw_value", "numeric_value",
            "source", "source_url",
            "verification_status", "verification_display",
        ]
        read_only_fields = fields

    def get_criterion_code(self, obj: ModelRawValue) -> str:
        if obj.criterion:
            return obj.criterion.code
        return obj.criterion_code

    def get_criterion_name(self, obj: ModelRawValue) -> str:
        if obj.criterion:
            return obj.criterion.name_ru
        return obj.criterion_code


class ACModelPhotoSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ACModelPhoto
        fields = ["id", "image_url", "alt", "order"]
        read_only_fields = fields

    def get_image_url(self, obj: ACModelPhoto) -> str:
        request = self.context.get("request")
        if obj.image and request:
            return request.build_absolute_uri(obj.image.url)
        if obj.image:
            return obj.image.url
        return ""


class ACModelSupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = ACModelSupplier
        fields = ["id", "name", "url", "order"]
        read_only_fields = fields


class ACModelListSerializer(serializers.ModelSerializer):
    brand = serializers.CharField(source="brand.name", read_only=True)
    brand_logo = serializers.SerializerMethodField()
    region_availability = RegionSerializer(source="regions", many=True, read_only=True)
    index_max = serializers.SerializerMethodField()
    noise_score = serializers.SerializerMethodField()
    has_noise_measurement = serializers.SerializerMethodField()
    scores = serializers.SerializerMethodField()

    class Meta:
        model = ACModel
        fields = [
            "id", "slug", "brand", "brand_logo", "inner_unit", "series",
            "nominal_capacity", "total_index", "index_max",
            "publish_status", "region_availability",
            "price", "noise_score", "has_noise_measurement", "scores",
            "is_ad", "ad_position",
        ]
        read_only_fields = fields

    def get_brand_logo(self, obj: ACModel) -> str:
        if not obj.brand.logo:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.brand.logo.url)
        return obj.brand.logo.url

    def get_index_max(self, _obj: ACModel) -> float:
        return float(self.context.get("index_max", 100.0))

    def _get_scores_cache(self, obj: ACModel) -> dict:
        if not hasattr(obj, "_scores_cache"):
            mc_list = self.context.get("criteria", [])
            if not mc_list:
                obj._scores_cache = {}
                return obj._scores_cache

            raw_values_map = {rv.criterion_id: rv for rv in obj.raw_values.all() if rv.criterion_id}
            model_ctx = _build_model_context(obj)
            scores = {}
            for mc in mc_list:
                rv = raw_values_map.get(mc.criterion_id)
                raw = rv.raw_value if rv else ""
                scorer = _get_scorer(mc)
                if scorer:
                    ctx = {**model_ctx}
                    if rv:
                        ctx["lab_status"] = rv.lab_status
                    result = scorer.calculate(mc, raw, **ctx)
                    scores[mc.code] = round(result.normalized_score, 2)
            obj._scores_cache = scores
        return obj._scores_cache

    def get_scores(self, obj: ACModel) -> dict:
        return self._get_scores_cache(obj)

    def _get_noise_score(self, obj: ACModel) -> float | None:
        """Считает noise_score независимо от _get_scores_cache.

        Нужно, чтобы таб «Самые тихие кондиционеры» работал даже если
        в активной методике у noise снят чек-бокс is_active (и параметр
        исключён из расчёта общего индекса).
        """
        if hasattr(obj, "_noise_score_cache"):
            return obj._noise_score_cache

        noise_mc = self.context.get("noise_mc")
        score: float | None = None
        if noise_mc:
            rv = next(
                (r for r in obj.raw_values.all()
                 if r.criterion_id == noise_mc.criterion_id),
                None,
            )
            raw = rv.raw_value if rv else ""
            scorer = _get_scorer(noise_mc)
            if scorer:
                model_ctx = _build_model_context(obj)
                if rv:
                    model_ctx["lab_status"] = rv.lab_status
                result = scorer.calculate(noise_mc, raw, **model_ctx)
                score = round(result.normalized_score, 2)
        obj._noise_score_cache = score
        return score

    def get_noise_score(self, obj: ACModel) -> float | None:
        return self._get_noise_score(obj)

    def get_has_noise_measurement(self, obj: ACModel) -> bool:
        score = self._get_noise_score(obj)
        return score is not None and score > 0


class ACModelDetailSerializer(serializers.ModelSerializer):
    brand = BrandSerializer(read_only=True)
    region_availability = RegionSerializer(source="regions", many=True, read_only=True)
    parameter_scores = serializers.SerializerMethodField()
    raw_values = RawValueSerializer(many=True, read_only=True)
    methodology_version = serializers.SerializerMethodField()
    index_max = serializers.SerializerMethodField()
    photos = ACModelPhotoSerializer(many=True, read_only=True)
    suppliers = ACModelSupplierSerializer(many=True, read_only=True)

    class Meta:
        model = ACModel
        fields = [
            "id", "slug", "brand", "series", "inner_unit", "outer_unit",
            "nominal_capacity", "total_index", "index_max",
            "publish_status", "region_availability",
            "price", "pros_text", "cons_text",
            "youtube_url", "rutube_url", "vk_url",
            "photos", "suppliers",
            "parameter_scores", "raw_values",
            "methodology_version",
        ]
        read_only_fields = fields

    def _get_methodology_for_detail(self, obj: ACModel) -> MethodologyVersion | None:
        results = list(obj.calculation_results.all())
        if results:
            latest = max(results, key=lambda r: r.run_id)
            return latest.run.methodology
        return MethodologyVersion.objects.filter(is_active=True).first()

    def get_parameter_scores(self, obj: ACModel) -> list[dict]:
        methodology = self._get_methodology_for_detail(obj)
        if methodology is None:
            return []
        _total, rows = compute_scores_for_model(obj, methodology)
        for r in rows:
            r["is_active"] = True

        # Дополнительно добираем неактивные критерии — чтобы пользователь
        # видел параметры с «Вклад в индекс: 0.00», если у модели есть замер.
        # Пустые raw_value пропускаем.
        raw_map = {
            rv.criterion_id: rv
            for rv in obj.raw_values.all()
            if rv.criterion_id
        }
        model_ctx = _build_model_context(obj)
        inactive_mcs = (
            methodology.methodology_criteria
            .filter(is_active=False)
            .select_related("criterion")
        )
        for mc in inactive_mcs:
            rv = raw_map.get(mc.criterion_id)
            if not rv or not (rv.raw_value or "").strip():
                continue
            scorer = _get_scorer(mc)
            if not scorer:
                continue
            ctx = {**model_ctx, "lab_status": rv.lab_status}
            result = scorer.calculate(mc, rv.raw_value, **ctx)
            rows.append({
                "criterion": mc,
                "raw_value": str(rv.raw_value),
                "compressor_model": rv.compressor_model or "",
                "normalized_score": round(result.normalized_score, 2),
                "weighted_score": 0.0,
                "above_reference": result.above_reference,
                "is_active": False,
            })

        lang = self.context.get("lang") or DEFAULT_LANGUAGE
        rows.sort(key=lambda r: (r["criterion"].display_order, r["criterion"].code))
        return [
            {
                "criterion_code": r["criterion"].code,
                "criterion_name": get_localized_field(r["criterion"], "name", lang),
                "criterion_description": get_localized_field(r["criterion"], "description", lang) or "",
                "compressor_model": (r.get("compressor_model") or "").strip(),
                "unit": r["criterion"].unit or "",
                "raw_value": r["raw_value"],
                "normalized_score": r["normalized_score"],
                "weighted_score": r["weighted_score"],
                "above_reference": r["above_reference"],
                "is_active": r["is_active"],
            }
            for r in rows
        ]

    def get_methodology_version(self, obj: ACModel) -> str | None:
        methodology = self._get_methodology_for_detail(obj)
        return methodology.version if methodology else None

    def get_index_max(self, obj: ACModel) -> float:
        return float(max_possible_total_index(self._get_methodology_for_detail(obj)))


class MethodologyCriterionSerializer(serializers.ModelSerializer):
    code = serializers.CharField(source="criterion.code", read_only=True)
    name_ru = serializers.CharField(source="criterion.name_ru", read_only=True)
    name_en = serializers.CharField(source="criterion.name_en", read_only=True)
    description_ru = serializers.CharField(source="criterion.description_ru", read_only=True)
    unit = serializers.CharField(source="criterion.unit", read_only=True)
    value_type = serializers.CharField(source="criterion.value_type", read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = MethodologyCriterion
        fields = [
            "code", "name_ru", "name_en", "description_ru",
            "unit", "value_type", "scoring_type", "weight",
            "min_value", "median_value", "max_value",
            "region_scope", "is_public",
            "display_order", "photo_url",
        ]
        read_only_fields = fields

    def get_photo_url(self, obj: MethodologyCriterion) -> str:
        photo = obj.criterion.photo
        if not photo:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(photo.url)
        return photo.url


class MethodologySerializer(serializers.ModelSerializer):
    criteria = serializers.SerializerMethodField()

    class Meta:
        model = MethodologyVersion
        fields = [
            "version", "name", "description", "is_active",
            "tab_description_index", "tab_description_quiet", "tab_description_custom",
            "criteria",
        ]
        read_only_fields = fields

    def get_criteria(self, obj: MethodologyVersion) -> list:
        # Отдаём только активные параметры — неактивные (включая снятый noise)
        # не должны участвовать в «Пользовательском рейтинге» и на публичной
        # странице методики. Таб «Самые тихие» использует отдельный noise_mc
        # из context ACModelListView — не зависит от этого endpoint'а.
        qs = (
            obj.methodology_criteria
            .filter(is_active=True)
            .select_related("criterion")
            .order_by("display_order", "criterion__code")
        )
        return MethodologyCriterionSerializer(qs, many=True, context=self.context).data
