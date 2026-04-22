from __future__ import annotations

from rest_framework import serializers

from ac_brands.models import Brand
from ac_catalog.i18n import DEFAULT_LANGUAGE, get_localized_field
from ac_methodology.models import MethodologyCriterion, MethodologyVersion
from ac_scoring.engine import compute_scores_for_model, max_possible_total_index
from ac_scoring.engine.computation import _build_model_context, _get_scorer
from ac_scoring.models import CalculationResult

from .models import ACModel, ACModelPhoto, ACModelSupplier, ModelRawValue, ModelRegion


def _url_with_mtime(file_field) -> str:
    """Relative URL файла + query `?v=<mtime>` для cache-bust (Cloudflare/CDN).
    Когда файл перезаписывается (normalize), mtime меняется → URL уникален → edge
    cache считает ресурс новым и идёт на origin.
    """
    if not file_field:
        return ""
    url = file_field.url
    try:
        mtime = file_field.storage.get_modified_time(file_field.name)
        return f"{url}?v={int(mtime.timestamp())}"
    except Exception:
        return url


class BrandSerializer(serializers.ModelSerializer):
    logo = serializers.SerializerMethodField()
    logo_dark = serializers.SerializerMethodField()

    class Meta:
        model = Brand
        fields = ["id", "name", "logo", "logo_dark"]
        read_only_fields = ["id", "name"]

    def get_logo(self, obj: Brand) -> str:
        return _url_with_mtime(obj.logo)

    def get_logo_dark(self, obj: Brand) -> str:
        return _url_with_mtime(obj.logo_dark)


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
        return _url_with_mtime(obj.image)
        return ""


class ACModelSupplierSerializer(serializers.ModelSerializer):
    availability_display = serializers.CharField(
        source="get_availability_display", read_only=True,
    )

    class Meta:
        model = ACModelSupplier
        fields = [
            "id", "name", "url", "order",
            # M4.3 enrichment:
            "price", "city", "rating",
            "availability", "availability_display", "note",
        ]
        read_only_fields = fields


class ACModelMentionLiteSerializer(serializers.ModelSerializer):
    """Лёгкий shape ACModel для секции «Упомянутая модель» в news-detail
    (Ф7A). Не тащит photos/scores/raw_values — только идентификатор
    и минимум полей для card."""

    brand = serializers.CharField(source="brand.name", read_only=True)

    class Meta:
        model = ACModel
        fields = ["id", "slug", "brand", "inner_unit", "total_index", "price"]
        read_only_fields = fields


class ACModelListSerializer(serializers.ModelSerializer):
    brand = serializers.CharField(source="brand.name", read_only=True)
    brand_logo = serializers.SerializerMethodField()
    brand_logo_dark = serializers.SerializerMethodField()
    region_availability = RegionSerializer(source="regions", many=True, read_only=True)
    index_max = serializers.SerializerMethodField()
    noise_score = serializers.SerializerMethodField()
    has_noise_measurement = serializers.SerializerMethodField()
    scores = serializers.SerializerMethodField()
    rank = serializers.SerializerMethodField()

    class Meta:
        model = ACModel
        fields = [
            "id", "slug", "brand", "brand_logo", "brand_logo_dark",
            "inner_unit", "series",
            "nominal_capacity", "total_index", "index_max",
            "publish_status", "region_availability",
            "price", "noise_score", "has_noise_measurement", "scores",
            "is_ad", "ad_position", "rank",
        ]
        read_only_fields = fields

    def get_rank(self, obj: ACModel) -> int | None:
        """rank приходит из annotation в ACModelListView.get_queryset.
        Для архивных моделей annotation не применяется — возвращаем None."""
        rank = getattr(obj, "rank", None)
        return int(rank) if rank is not None else None

    def get_brand_logo(self, obj: ACModel) -> str:
        return _url_with_mtime(obj.brand.logo)

    def get_brand_logo_dark(self, obj: ACModel) -> str:
        return _url_with_mtime(obj.brand.logo_dark)

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
    rank = serializers.SerializerMethodField()
    median_total_index = serializers.SerializerMethodField()
    news_mentions = serializers.SerializerMethodField()

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
            "rank", "median_total_index",
            # M4.1 editorial:
            "editorial_lede", "editorial_body",
            "editorial_quote", "editorial_quote_author",
            # M4.2 unit dimensions + weight:
            "inner_unit_dimensions", "inner_unit_weight_kg",
            "outer_unit_dimensions", "outer_unit_weight_kg",
            # M5.6 — секция «Упоминания в прессе» (Ф7A HVAC news):
            "news_mentions",
        ]
        read_only_fields = fields

    def get_news_mentions(self, obj: ACModel) -> list[dict]:
        """Reverse-relation NewsPost.mentioned_ac_models (related_name='news_mentions').
        Лёгкий shape: 6 полей, без body/media — экономия payload. Максимум 5
        свежих опубликованных постов, DESC по pub_date."""
        mentions = obj.news_mentions.filter(
            is_deleted=False,
            is_no_news_found=False,
            status="published",
        ).order_by("-pub_date")[:5]
        return [
            {
                "id": n.id,
                "title": n.title,
                "category": n.category,
                "category_display": n.get_category_display(),
                "pub_date": n.pub_date.isoformat() if n.pub_date else None,
                "reading_time_minutes": n.reading_time_minutes,
            }
            for n in mentions
        ]

    def get_rank(self, obj: ACModel) -> int | None:
        from ac_catalog.stats import rank_for_model
        return rank_for_model(obj)

    def get_median_total_index(self, obj: ACModel) -> float | None:
        """Медиана по всему published каталогу. Кладётся в context
        ACModelDetailView.get_serializer_context (одно вычисление за
        запрос); если context не заполнен — считается здесь on-demand."""
        median = self.context.get("median_total_index", ...)
        if median is ...:
            from ac_catalog.stats import published_median_total_index
            return published_median_total_index()
        return median

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

    group = serializers.CharField(source="criterion.group", read_only=True)
    group_display = serializers.CharField(
        source="criterion.get_group_display", read_only=True,
    )

    class Meta:
        model = MethodologyCriterion
        fields = [
            "code", "name_ru", "name_en", "description_ru",
            "unit", "value_type", "scoring_type", "weight",
            "min_value", "median_value", "max_value",
            "region_scope", "is_public",
            "display_order", "photo_url",
            # M4.4 группа критерия в таблице «Характеристики»:
            "group", "group_display",
        ]
        read_only_fields = fields

    def get_photo_url(self, obj: MethodologyCriterion) -> str:
        return _url_with_mtime(obj.criterion.photo)


class MethodologySerializer(serializers.ModelSerializer):
    criteria = serializers.SerializerMethodField()
    stats = serializers.SerializerMethodField()

    class Meta:
        model = MethodologyVersion
        fields = [
            "version", "name", "description", "is_active",
            "tab_description_index", "tab_description_quiet", "tab_description_custom",
            "criteria", "stats",
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

    def get_stats(self, obj: MethodologyVersion) -> dict:
        """Hero-агрегаты для публичного листинга (LIST-A) + внутренние метрики.

        - total_models: count published-моделей в каталоге
        - active_criteria_count: count активных критериев в *этой* методике
        - median_total_index: медиана total_index по published-моделям
        """
        from ac_catalog.stats import published_median_total_index
        from ac_catalog.models import ACModel

        return {
            "total_models": ACModel.objects.filter(
                publish_status=ACModel.PublishStatus.PUBLISHED,
            ).count(),
            "active_criteria_count": obj.methodology_criteria.filter(
                is_active=True,
            ).count(),
            "median_total_index": published_median_total_index(),
        }
