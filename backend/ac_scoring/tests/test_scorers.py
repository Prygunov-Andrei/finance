from __future__ import annotations

import pytest

from ac_methodology.models import Criterion, MethodologyCriterion, MethodologyVersion
from ac_scoring.scorers.binary import BinaryScorer
from ac_scoring.scorers.brand_age import BrandAgeScorer
from ac_scoring.scorers.categorical import CategoricalScorer
from ac_scoring.scorers.custom_scale import CustomScaleScorer
from ac_scoring.scorers.fallback import FallbackScorer
from ac_scoring.scorers.formula import FormulaScorer
from ac_scoring.scorers.lab import LabScorer
from ac_scoring.scorers.numeric import NumericScorer

# Поля, принадлежащие standalone Criterion
_CRITERION_FIELDS = {"name_ru", "value_type", "unit", "is_active"}

# Поля, принадлежащие MethodologyCriterion
_MC_FIELDS = {
    "scoring_type", "weight", "display_order", "min_value", "median_value",
    "max_value", "is_inverted", "median_by_capacity", "custom_scale_json",
    "formula_json", "is_required_lab", "is_required_checklist",
    "is_required_catalog", "use_in_lab", "use_in_checklist", "use_in_catalog",
    "region_scope", "is_public", "is_active",
}


@pytest.fixture
def methodology(db):
    return MethodologyVersion.objects.create(version="test", name="Test", is_active=True)


def _make_criterion(methodology, code="test", **kwargs):
    """Create standalone Criterion + MethodologyCriterion, return MC (scorers receive MC)."""
    criterion_kwargs = {"name_ru": kwargs.pop("name_ru", "Test")}
    value_type = kwargs.pop("value_type", "numeric")

    mc_defaults = {
        "scoring_type": "min_median_max",
        "weight": 10,
        "display_order": 1,
        "is_active": True,
    }
    mc_defaults.update(kwargs)

    criterion, _ = Criterion.objects.get_or_create(
        code=code, defaults={"name_ru": criterion_kwargs["name_ru"], "value_type": value_type},
    )
    mc = MethodologyCriterion.objects.create(methodology=methodology, criterion=criterion, **mc_defaults)
    return mc


# ── NumericScorer (normal) ────────────────────────────────────────────

@pytest.mark.django_db
class TestNumericScorer:
    def test_at_min(self, methodology):
        c = _make_criterion(methodology, min_value=0, max_value=100, median_value=50)
        assert NumericScorer().calculate(c, "0").normalized_score == 0

    def test_at_max(self, methodology):
        c = _make_criterion(methodology, min_value=0, max_value=100, median_value=50)
        r = NumericScorer().calculate(c, "100")
        assert r.normalized_score == 100
        assert r.above_reference is False

    def test_above_max(self, methodology):
        c = _make_criterion(methodology, min_value=0, max_value=100, median_value=50)
        r = NumericScorer().calculate(c, "120")
        assert r.normalized_score == 100
        assert r.above_reference is True

    def test_at_median(self, methodology):
        c = _make_criterion(methodology, min_value=0, max_value=100, median_value=50)
        r = NumericScorer().calculate(c, "50")
        assert r.normalized_score == 50.0

    def test_between_min_and_median(self, methodology):
        c = _make_criterion(methodology, min_value=0, max_value=100, median_value=50)
        r = NumericScorer().calculate(c, "25")
        assert r.normalized_score == 25.0

    def test_invalid_value(self, methodology):
        c = _make_criterion(methodology, min_value=0, max_value=100)
        assert NumericScorer().calculate(c, "abc").normalized_score == 0

    def test_no_median(self, methodology):
        c = _make_criterion(methodology, min_value=0, max_value=100, median_value=None)
        r = NumericScorer().calculate(c, "50")
        assert r.normalized_score == 50.0


# ── NumericScorer (inverted) ──────────────────────────────────────────

@pytest.mark.django_db
class TestNumericScorerInverted:
    def test_at_min_best(self, methodology):
        c = _make_criterion(methodology, min_value=28, max_value=46, median_value=33,
                            is_inverted=True)
        r = NumericScorer().calculate(c, "28")
        assert r.normalized_score == 100

    def test_at_max_worst(self, methodology):
        c = _make_criterion(methodology, min_value=28, max_value=46, median_value=33,
                            is_inverted=True)
        assert NumericScorer().calculate(c, "46").normalized_score == 0

    def test_at_median(self, methodology):
        c = _make_criterion(methodology, min_value=28, max_value=46, median_value=33,
                            is_inverted=True)
        assert NumericScorer().calculate(c, "33").normalized_score == 50.0

    def test_better_than_median(self, methodology):
        c = _make_criterion(methodology, min_value=28, max_value=46, median_value=33,
                            is_inverted=True)
        r = NumericScorer().calculate(c, "30")
        assert r.normalized_score == pytest.approx(80.0, abs=0.1)

    def test_worse_than_median(self, methodology):
        c = _make_criterion(methodology, min_value=28, max_value=46, median_value=33,
                            is_inverted=True)
        r = NumericScorer().calculate(c, "40")
        assert r.normalized_score == pytest.approx(23.08, abs=0.1)

    def test_below_min_capped_100(self, methodology):
        c = _make_criterion(methodology, min_value=28, max_value=46, median_value=33,
                            is_inverted=True)
        r = NumericScorer().calculate(c, "20")
        assert r.normalized_score == 100
        assert r.above_reference is True


# ── NumericScorer (capacity-dependent median) ─────────────────────────

@pytest.mark.django_db
class TestNumericScorerCapacityMedian:
    def test_picks_closest_capacity(self, methodology):
        c = _make_criterion(
            methodology, min_value=0.1, max_value=0.5, median_value=0.21,
            median_by_capacity={"2.0": 0.18, "2.5": 0.21, "3.5": 0.30},
        )
        r = NumericScorer().calculate(c, "0.21", nominal_capacity=3.5)
        assert r.normalized_score == pytest.approx(27.5, abs=0.1)

    def test_uses_exact_capacity(self, methodology):
        c = _make_criterion(
            methodology, min_value=0.1, max_value=0.5, median_value=0.21,
            median_by_capacity={"2.0": 0.18, "2.5": 0.21, "3.5": 0.30},
        )
        r = NumericScorer().calculate(c, "0.21", nominal_capacity=2.5)
        assert r.normalized_score == 50.0

    def test_falls_back_to_scalar_without_capacity(self, methodology):
        c = _make_criterion(
            methodology, min_value=0.1, max_value=0.5, median_value=0.21,
            median_by_capacity={"2.0": 0.18, "2.5": 0.21, "3.5": 0.30},
        )
        r = NumericScorer().calculate(c, "0.21")
        assert r.normalized_score == 50.0


# ── BinaryScorer ──────────────────────────────────────────────────────

@pytest.mark.django_db
class TestBinaryScorer:
    @pytest.mark.parametrize("val", ["да", "yes", "есть", "1", "true", "+"])
    def test_truthy(self, methodology, val):
        c = _make_criterion(methodology, value_type="binary", scoring_type="binary")
        assert BinaryScorer().calculate(c, val).normalized_score == 100

    @pytest.mark.parametrize("val", ["нет", "no", "0", ""])
    def test_falsy(self, methodology, val):
        c = _make_criterion(methodology, value_type="binary", scoring_type="binary")
        assert BinaryScorer().calculate(c, val).normalized_score == 0


# ── CategoricalScorer ─────────────────────────────────────────────────

@pytest.mark.django_db
class TestCategoricalScorer:
    def test_keyword_match(self, methodology):
        c = _make_criterion(methodology, value_type="categorical", scoring_type="universal_scale")
        assert CategoricalScorer().calculate(c, "нет").normalized_score == 0
        assert CategoricalScorer().calculate(c, "есть").normalized_score == 70

    def test_custom_scale_override(self, methodology):
        c = _make_criterion(
            methodology, value_type="categorical", scoring_type="universal_scale",
            custom_scale_json={"инвертор": 100, "он-офф": 30},
        )
        assert CategoricalScorer().calculate(c, "инвертор").normalized_score == 100


# ── CustomScaleScorer ─────────────────────────────────────────────────

@pytest.mark.django_db
class TestCustomScaleScorer:
    def test_dict_scale(self, methodology):
        c = _make_criterion(
            methodology, scoring_type="custom_scale",
            custom_scale_json={"100В": 100, "150В": 70, "230В": 0},
        )
        assert CustomScaleScorer().calculate(c, "100В").normalized_score == 100
        assert CustomScaleScorer().calculate(c, "230В").normalized_score == 0

    def test_interval_scale(self, methodology):
        c = _make_criterion(
            methodology, scoring_type="custom_scale",
            custom_scale_json=[
                {"from": 0, "to": 80, "score": 15},
                {"from": 80, "to": 95, "score": 70},
                {"from": 95, "to": 999, "score": 100},
            ],
        )
        assert CustomScaleScorer().calculate(c, "50").normalized_score == 15
        assert CustomScaleScorer().calculate(c, "90").normalized_score == 70

    def test_no_scale(self, methodology):
        c = _make_criterion(methodology, scoring_type="custom_scale", custom_scale_json=None)
        assert CustomScaleScorer().calculate(c, "anything").normalized_score == 0


# ── FormulaScorer ─────────────────────────────────────────────────────

@pytest.mark.django_db
class TestFormulaScorer:
    def test_with_intervals(self, methodology):
        c = _make_criterion(
            methodology, scoring_type="formula",
            formula_json=[
                {"from": 0, "to": 50, "score": 0},
                {"from": 50, "to": 100, "score": 100},
            ],
        )
        assert FormulaScorer().calculate(c, "25").normalized_score == 0
        assert FormulaScorer().calculate(c, "75").normalized_score == 100

    def test_no_formula_json(self, methodology):
        c = _make_criterion(methodology, scoring_type="formula", formula_json=None)
        assert FormulaScorer().calculate(c, "50").normalized_score == 0


# ── LabScorer ─────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestLabScorer:
    def test_not_measured(self, methodology):
        c = _make_criterion(methodology, value_type="lab")
        assert LabScorer().calculate(c, "50", lab_status="not_measured").normalized_score == 0

    def test_measured_numeric(self, methodology):
        c = _make_criterion(methodology, value_type="lab", min_value=0, max_value=100)
        r = LabScorer().calculate(c, "50", lab_status="measured")
        assert r.normalized_score == 50.0


# ── FallbackScorer (compressor power) ─────────────────────────────────

@pytest.mark.django_db
class TestFallbackScorer:
    def test_with_value_and_capacity(self, methodology):
        c = _make_criterion(
            methodology, scoring_type="formula", value_type="fallback",
            formula_json=[
                {"from": 0, "to": 80, "score": 15},
                {"from": 80, "to": 90, "score": 50},
                {"from": 90, "to": 95, "score": 70},
                {"from": 95, "to": 100, "score": 90},
                {"from": 100, "to": 999, "score": 100},
            ],
        )
        # compressor 2500W vs 2500W model → ratio = 100%
        r = FallbackScorer().calculate(c, "2500", nominal_capacity=2500)
        assert r.normalized_score == 100

    def test_underpowered_compressor(self, methodology):
        c = _make_criterion(
            methodology, scoring_type="formula", value_type="fallback",
            formula_json=[
                {"from": 0, "to": 80, "score": 15},
                {"from": 80, "to": 90, "score": 50},
                {"from": 90, "to": 95, "score": 70},
                {"from": 95, "to": 100, "score": 90},
                {"from": 100, "to": 999, "score": 100},
            ],
        )
        # compressor 2000W vs 2500W model → ratio = 80%
        r = FallbackScorer().calculate(c, "2000", nominal_capacity=2500)
        assert r.normalized_score == 50

    def test_values_must_be_in_watts(self, methodology):
        c = _make_criterion(
            methodology, scoring_type="formula", value_type="fallback",
            formula_json=[
                {"from": 0, "to": 80, "score": 15},
                {"from": 80, "to": 90, "score": 50},
                {"from": 90, "to": 95, "score": 70},
                {"from": 95, "to": 100, "score": 90},
                {"from": 100, "to": 999, "score": 100},
            ],
        )
        # Both values in watts: 2500W compressor / 2500W nominal = 100%
        r = FallbackScorer().calculate(c, "2500", nominal_capacity=2500)
        assert r.normalized_score == 100

    def test_without_value_japanese(self, methodology):
        c = _make_criterion(methodology, scoring_type="formula", value_type="fallback")
        r = FallbackScorer().calculate(c, "", fallback_score=90)
        assert r.normalized_score == 90

    def test_without_value_chinese(self, methodology):
        c = _make_criterion(methodology, scoring_type="formula", value_type="fallback")
        r = FallbackScorer().calculate(c, "", fallback_score=50)
        assert r.normalized_score == 50

    def test_without_value_no_fallback(self, methodology):
        c = _make_criterion(methodology, scoring_type="formula", value_type="fallback")
        r = FallbackScorer().calculate(c, "")
        assert r.normalized_score == 50


# ── BrandAgeScorer ────────────────────────────────────────────────────

@pytest.mark.django_db
class TestBrandAgeScorer:
    def test_oldest_brand(self, methodology):
        c = _make_criterion(
            methodology, code="age", value_type="brand_age",
            min_value=1995, max_value=2026, median_value=2010,
        )
        r = BrandAgeScorer().calculate(c, "", sales_start_year_ru=1995)
        assert r.normalized_score == 100

    def test_brand_new(self, methodology):
        c = _make_criterion(
            methodology, code="age", value_type="brand_age",
            min_value=1995, max_value=2026, median_value=2010,
        )
        r = BrandAgeScorer().calculate(c, "", sales_start_year_ru=2026)
        assert r.normalized_score == 0

    def test_median_year(self, methodology):
        c = _make_criterion(
            methodology, code="age", value_type="brand_age",
            min_value=1995, max_value=2026, median_value=2010,
        )
        r = BrandAgeScorer().calculate(c, "", sales_start_year_ru=2010)
        assert r.normalized_score == 50.0

    def test_older_than_median(self, methodology):
        c = _make_criterion(
            methodology, code="age", value_type="brand_age",
            min_value=1995, max_value=2026, median_value=2010,
        )
        r = BrandAgeScorer().calculate(c, "", sales_start_year_ru=2000)
        assert r.normalized_score == pytest.approx(83.33, abs=0.1)

    def test_no_start_year(self, methodology):
        c = _make_criterion(
            methodology, code="age", value_type="brand_age",
            min_value=1995, max_value=2026,
        )
        r = BrandAgeScorer().calculate(c, "")
        assert r.normalized_score == 0


# ── Edge-case tests (Audit Issues #17-18) ────────────────────────────

@pytest.mark.django_db
class TestEdgeCases:
    """Граничные случаи, выявленные аудитом."""

    def test_binary_inverted(self, methodology):
        """Issue #4: BinaryScorer должен уважать is_inverted."""
        c = _make_criterion(methodology, value_type="binary", scoring_type="binary", is_inverted=True)
        assert BinaryScorer().calculate(c, "да").normalized_score == 0
        assert BinaryScorer().calculate(c, "нет").normalized_score == 100

    def test_custom_scale_interval_boundary(self, methodology):
        """Issue #2: граница интервала [from, to) — value==to попадает в следующий."""
        c = _make_criterion(
            methodology, value_type="custom_scale", scoring_type="custom_scale",
            custom_scale_json=[
                {"from": 0, "to": 50, "score": 10},
                {"from": 50, "to": 100, "score": 90},
            ],
        )
        r = CustomScaleScorer().calculate(c, "50")
        assert r.normalized_score == 90  # попадает во второй интервал, не в первый

    def test_custom_scale_empty_dict(self, methodology):
        """custom_scale_json = {} — должен вернуть 0."""
        c = _make_criterion(
            methodology, value_type="custom_scale", scoring_type="custom_scale",
            custom_scale_json={},
        )
        r = CustomScaleScorer().calculate(c, "anything")
        assert r.normalized_score == 0

    def test_categorical_custom_scale_no_fallback_to_keywords(self, methodology):
        """Issue #15: если custom_scale задан, не проваливаться в QUALITY_KEYWORDS."""
        c = _make_criterion(
            methodology, value_type="categorical", scoring_type="universal_scale",
            custom_scale_json={"да": 100, "нет": 0},
        )
        # "хорошо" есть в QUALITY_KEYWORDS (70), но НЕ в custom_scale → должен быть 0
        r = CategoricalScorer().calculate(c, "хорошо")
        assert r.normalized_score == 0

    def test_fallback_nominal_capacity_zero(self, methodology):
        """Issue #9: nominal_capacity=0 не должен вызывать деление на ноль."""
        c = _make_criterion(
            methodology, value_type="fallback", scoring_type="formula",
        )
        r = FallbackScorer().calculate(c, "500", nominal_capacity=0)
        assert r.normalized_score == 0

    def test_numeric_min_greater_than_max(self, methodology):
        """Issue #6: min > max → score=0, не крэш."""
        c = _make_criterion(methodology, min_value=100, max_value=10, median_value=50)
        r = NumericScorer().calculate(c, "50")
        assert r.normalized_score == 0

    def test_lab_unknown_status_returns_zero(self, methodology):
        """Issue #16: неизвестный lab_status → 0 (whitelist подход)."""
        c = _make_criterion(
            methodology, value_type="lab", scoring_type="min_median_max",
            min_value=0, max_value=100, median_value=50,
        )
        r = LabScorer().calculate(c, "50", lab_status="some_new_status")
        assert r.normalized_score == 0

    def test_median_by_capacity_nonnumeric_keys(self, methodology):
        """Issue #8: нечисловые ключи в median_by_capacity игнорируются."""
        c = _make_criterion(
            methodology, min_value=0, max_value=100, median_value=50,
            median_by_capacity={"invalid": 30, "2.5": 60},
        )
        r = NumericScorer().calculate(c, "60", nominal_capacity=2.5)
        assert r.normalized_score == 50.0  # median=60, value=60 → 50
