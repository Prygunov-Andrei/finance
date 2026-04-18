"""Тесты Celery-задачи ac_scoring.recalculate_all (запуск напрямую, sync)."""
from __future__ import annotations

import pytest

from ac_brands.tests.factories import BrandFactory
from ac_catalog.models import ACModel, ModelRawValue
from ac_methodology.models import Criterion, MethodologyCriterion, MethodologyVersion
from ac_scoring.tasks import recalculate_all_task


@pytest.mark.django_db
def test_recalculate_all_task_returns_summary_and_updates_total_index():
    methodology = MethodologyVersion.objects.create(
        version="task-1", name="Task test", is_active=True,
    )
    criterion = Criterion.objects.create(
        code="erv", name_ru="ЭРВ", value_type=Criterion.ValueType.BINARY,
    )
    MethodologyCriterion.objects.create(
        methodology=methodology, criterion=criterion,
        scoring_type=MethodologyCriterion.ScoringType.BINARY,
        weight=100, display_order=1,
    )

    brand = BrandFactory(name="TaskBrand")
    ac_model = ACModel.objects.create(brand=brand, inner_unit="task-x")
    ModelRawValue.objects.create(model=ac_model, criterion=criterion, raw_value="да")

    summary = recalculate_all_task(methodology_id=methodology.pk)

    assert summary["status"] == "completed"
    assert summary["models_processed"] == 1
    assert summary["run_id"] > 0

    ac_model.refresh_from_db()
    assert ac_model.total_index == pytest.approx(100.0, abs=0.01)


@pytest.mark.django_db
def test_recalculate_all_task_uses_active_methodology_when_id_omitted():
    active = MethodologyVersion.objects.create(
        version="task-active", name="Active", is_active=True,
    )
    crit = Criterion.objects.create(
        code="erv2", name_ru="ЭРВ2", value_type=Criterion.ValueType.BINARY,
    )
    MethodologyCriterion.objects.create(
        methodology=active, criterion=crit,
        scoring_type=MethodologyCriterion.ScoringType.BINARY,
        weight=100, display_order=1,
    )

    brand = BrandFactory(name="ActiveBrand")
    ACModel.objects.create(brand=brand, inner_unit="active-y")

    summary = recalculate_all_task()
    assert summary["status"] == "completed"


@pytest.mark.django_db
def test_recalculate_all_task_filters_by_model_ids():
    methodology = MethodologyVersion.objects.create(
        version="task-filter", name="Filter", is_active=True,
    )
    crit = Criterion.objects.create(
        code="erv3", name_ru="ЭРВ3", value_type=Criterion.ValueType.BINARY,
    )
    MethodologyCriterion.objects.create(
        methodology=methodology, criterion=crit,
        scoring_type=MethodologyCriterion.ScoringType.BINARY,
        weight=100, display_order=1,
    )

    brand = BrandFactory(name="FilterBrand")
    target = ACModel.objects.create(brand=brand, inner_unit="filter-target")
    ACModel.objects.create(brand=brand, inner_unit="filter-other")

    summary = recalculate_all_task(
        methodology_id=methodology.pk, model_ids=[target.pk],
    )
    assert summary["models_processed"] == 1
