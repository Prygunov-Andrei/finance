from __future__ import annotations

import pytest

from ac_brands.models import Brand, BrandOriginClass
from ac_catalog.models import ACModel, EquipmentType, ModelRawValue
from ac_methodology.models import Criterion, MethodologyCriterion, MethodologyVersion
from ac_catalog.sync_brand_age import sync_brand_age_for_model
from ac_scoring.engine import (
    max_possible_total_index,
    recalculate_all,
    refresh_all_ac_model_total_indices,
    update_model_total_index,
    validate_weights,
)
from ac_scoring.models import CalculationResult, CalculationRun


def _make_mc(methodology, code, name_ru="Test", value_type="binary", **mc_kwargs):
    """Helper: create standalone Criterion + MethodologyCriterion."""
    mc_defaults = {"scoring_type": "binary", "weight": 0, "display_order": 1, "is_active": True}
    mc_defaults.update(mc_kwargs)
    criterion, _ = Criterion.objects.get_or_create(
        code=code, defaults={"name_ru": name_ru, "value_type": value_type},
    )
    return MethodologyCriterion.objects.create(
        methodology=methodology, criterion=criterion, **mc_defaults,
    )


@pytest.fixture
def methodology(db):
    return MethodologyVersion.objects.create(version="test", name="Test", is_active=True)


@pytest.fixture
def brand(db):
    return Brand.objects.create(name="TestBrand")


@pytest.fixture
def eq_type(db):
    return EquipmentType.objects.create(name="Сплит")


@pytest.fixture
def ac_model(brand, eq_type):
    return ACModel.objects.create(
        brand=brand, inner_unit="Model-X", equipment_type=eq_type,
        nominal_capacity=2.5,
    )


@pytest.mark.django_db
class TestMaxPossibleTotalIndex:
    def test_sums_weights_of_scorable_criteria(self, methodology):
        _make_mc(methodology, "a", "A", "binary", scoring_type="binary", weight=60, display_order=1)
        _make_mc(methodology, "b", "B", "binary", scoring_type="binary", weight=40, display_order=2)
        assert max_possible_total_index(methodology) == pytest.approx(100.0)

    def test_skips_criteria_without_scorer(self, methodology):
        _make_mc(methodology, "ok", "OK", "binary", scoring_type="binary", weight=50, display_order=1)
        _make_mc(methodology, "bad", "Bad", "string", scoring_type="unknown_type_xyz", weight=50, display_order=2)
        assert max_possible_total_index(methodology) == pytest.approx(50.0)

    def test_none_methodology_defaults_to_hundred(self):
        assert max_possible_total_index(None) == 100.0


@pytest.mark.django_db
class TestWeightValidation:
    def test_valid_weights(self, methodology):
        _make_mc(methodology, "a", "A", "binary", scoring_type="binary", weight=60, display_order=1)
        _make_mc(methodology, "b", "B", "binary", scoring_type="binary", weight=40, display_order=2)
        validate_weights(methodology)


@pytest.mark.django_db
class TestRecalculateAll:
    def test_basic_calculation(self, methodology, ac_model):
        mc1 = _make_mc(methodology, "noise", "Шум", "numeric",
                        scoring_type="min_median_max", weight=50,
                        min_value=20, median_value=30, max_value=40, display_order=1)
        mc2 = _make_mc(methodology, "erv", "ЭРВ", "binary",
                        scoring_type="binary", weight=50, display_order=2)
        ModelRawValue.objects.create(model=ac_model, criterion=mc1.criterion, raw_value="30")
        ModelRawValue.objects.create(model=ac_model, criterion=mc2.criterion, raw_value="да")

        run = recalculate_all()
        ac_model.refresh_from_db()

        assert run.status == CalculationRun.Status.COMPLETED
        assert run.models_processed == 1
        assert CalculationResult.objects.filter(run=run).count() == 2

        noise_result = CalculationResult.objects.get(run=run, criterion=mc1.criterion)
        assert noise_result.normalized_score == 50.0
        assert noise_result.weighted_score == pytest.approx(25.0, abs=0.01)

        erv_result = CalculationResult.objects.get(run=run, criterion=mc2.criterion)
        assert erv_result.normalized_score == 100.0

        assert ac_model.total_index == pytest.approx(75.0, abs=0.01)

    def test_no_active_methodology(self, db):
        MethodologyVersion.objects.filter(is_active=True).update(is_active=False)
        with pytest.raises(ValueError, match="активной методики"):
            recalculate_all()

    def test_selected_models(self, methodology, ac_model, brand, eq_type):
        mc = _make_mc(methodology, "x", "X", "binary",
                       scoring_type="binary", weight=100, display_order=1)
        other = ACModel.objects.create(brand=brand, inner_unit="Other", equipment_type=eq_type)
        ModelRawValue.objects.create(model=ac_model, criterion=mc.criterion, raw_value="да")

        run = recalculate_all(model_ids=[ac_model.pk])
        assert run.models_processed == 1

    def test_inverted_noise(self, methodology, ac_model):
        mc = _make_mc(methodology, "noise_inv", "Шум (инв.)", "numeric",
                       scoring_type="min_median_max", weight=100,
                       min_value=28, median_value=33, max_value=46,
                       is_inverted=True, display_order=1)
        ModelRawValue.objects.create(model=ac_model, criterion=mc.criterion, raw_value="30")

        run = recalculate_all()
        result = CalculationResult.objects.get(run=run, criterion=mc.criterion)
        assert result.normalized_score == pytest.approx(80.0, abs=0.1)

    def test_capacity_dependent_median(self, methodology, ac_model):
        mc = _make_mc(methodology, "hx_inner", "Теплообменник", "numeric",
                       scoring_type="min_median_max", weight=100,
                       min_value=0.1, max_value=0.5, median_value=0.21,
                       median_by_capacity={"2.0": 0.18, "2.5": 0.21, "3.5": 0.30},
                       display_order=1)
        ModelRawValue.objects.create(model=ac_model, criterion=mc.criterion, raw_value="0.21")

        run = recalculate_all()
        result = CalculationResult.objects.get(run=run, criterion=mc.criterion)
        assert result.normalized_score == 50.0

    def test_fallback_compressor_with_origin(self, methodology, eq_type):
        origin, _ = BrandOriginClass.objects.get_or_create(
            origin_type="japanese", defaults={"fallback_score": 90},
        )
        jp_brand = Brand.objects.create(name="JapanBrand", origin_class=origin)
        model = ACModel.objects.create(
            brand=jp_brand, inner_unit="JP-Model", equipment_type=eq_type,
            nominal_capacity=2.5,
        )
        mc = _make_mc(methodology, "comp", "Компрессор", "fallback",
                       scoring_type="formula", weight=100, display_order=1,
                       formula_json=[
                           {"from": 0, "to": 80, "score": 15},
                           {"from": 80, "to": 90, "score": 50},
                           {"from": 90, "to": 95, "score": 70},
                           {"from": 95, "to": 100, "score": 90},
                           {"from": 100, "to": 999, "score": 100},
                       ])
        run = recalculate_all()
        result = CalculationResult.objects.get(run=run, criterion=mc.criterion, model=model)
        assert result.normalized_score == 90

    def test_brand_age_scorer_in_engine(self, methodology, eq_type):
        origin, _ = BrandOriginClass.objects.get_or_create(
            origin_type="japanese", defaults={"fallback_score": 90},
        )
        jp_brand = Brand.objects.create(
            name="OldBrand", origin_class=origin, sales_start_year_ru=2000,
        )
        model = ACModel.objects.create(
            brand=jp_brand, inner_unit="JP-Age", equipment_type=eq_type,
        )
        mc = _make_mc(methodology, "brand_age", "Возраст", "brand_age",
                       scoring_type="min_median_max", weight=100,
                       min_value=1995, max_value=2026, median_value=2010,
                       display_order=1)
        run = recalculate_all()
        result = CalculationResult.objects.get(run=run, criterion=mc.criterion, model=model)
        assert result.normalized_score == pytest.approx(83.33, abs=0.1)

    def test_sync_brand_age_for_model_updates_raw_value(self, methodology, eq_type):
        origin, _ = BrandOriginClass.objects.get_or_create(
            origin_type="japanese", defaults={"fallback_score": 90},
        )
        brand = Brand.objects.create(
            name="SyncBrandAge", origin_class=origin, sales_start_year_ru=2012,
        )
        model = ACModel.objects.create(
            brand=brand, inner_unit="Sync-X", equipment_type=eq_type,
        )
        mc = _make_mc(methodology, "brand_age_ru", "Возраст", "brand_age",
                       scoring_type="min_median_max", weight=100,
                       min_value=1995, max_value=2026, median_value=2010,
                       display_order=1)
        rv = ModelRawValue.objects.create(
            model=model, criterion=mc.criterion, raw_value="should_be_replaced",
        )
        sync_brand_age_for_model(model)
        rv.refresh_from_db()
        assert rv.raw_value == "2012"

        brand.sales_start_year_ru = 2000
        brand.save()
        rv.refresh_from_db()
        assert rv.raw_value == "2000"


@pytest.mark.django_db
def test_update_model_total_index_without_calculation_run(methodology, ac_model):
    mc1 = _make_mc(methodology, "noise", "Шум", "numeric",
                    scoring_type="min_median_max", weight=50,
                    min_value=20, median_value=30, max_value=40, display_order=1)
    mc2 = _make_mc(methodology, "erv", "ЭРВ", "binary",
                    scoring_type="binary", weight=50, display_order=2)
    ModelRawValue.objects.create(model=ac_model, criterion=mc1.criterion, raw_value="30")
    ModelRawValue.objects.create(model=ac_model, criterion=mc2.criterion, raw_value="да")

    runs_before = CalculationRun.objects.count()
    assert update_model_total_index(ac_model) is True
    ac_model.refresh_from_db()
    assert ac_model.total_index == pytest.approx(75.0, abs=0.02)
    assert CalculationRun.objects.count() == runs_before


@pytest.mark.django_db
def test_refresh_all_ac_model_total_indices(methodology, ac_model):
    mc = _make_mc(methodology, "x", "X", "binary",
                   scoring_type="binary", weight=100, display_order=1)
    ModelRawValue.objects.create(model=ac_model, criterion=mc.criterion, raw_value="да")
    ACModel.objects.filter(pk=ac_model.pk).update(total_index=0)
    assert refresh_all_ac_model_total_indices() == 1
    ac_model.refresh_from_db()
    assert ac_model.total_index == pytest.approx(100.0, abs=0.02)
