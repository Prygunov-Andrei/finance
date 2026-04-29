"""Wave 11 регрессии после визуального обзора Wave 10.

1. MethodologySerializer.get_criteria должен пропускать критерии с
   is_key_measurement=True даже когда MethodologyCriterion.is_active=False
   (engine при is_active=False исключает их из total_index — но фронт
   обязан их показать в hero и блоке «Ключевые замеры» детальной).
2. ParameterScoreSerializer.Meta.fields должен содержать is_key_measurement.
"""
from __future__ import annotations

import pytest

from ac_catalog.serializers import (
    MethodologySerializer,
    ParameterScoreSerializer,
)
from ac_catalog.tests.factories import ACModelFactory
from ac_methodology.tests.factories import (
    ActiveMethodologyVersionFactory,
    CriterionFactory,
    MethodologyCriterionFactory,
)
from ac_scoring.tests.factories import (
    CalculationResultFactory,
    CalculationRunFactory,
)


@pytest.mark.django_db
def test_methodology_includes_inactive_key_measurement():
    """Критерий c is_key_measurement=True попадает в API даже при
    MethodologyCriterion.is_active=False — иначе noise пропадает с фронта."""
    mv = ActiveMethodologyVersionFactory()

    crit_active = CriterionFactory(code="c1", is_key_measurement=False)
    crit_key_inactive = CriterionFactory(code="noise", is_key_measurement=True)
    crit_plain_inactive = CriterionFactory(code="legacy", is_key_measurement=False)

    MethodologyCriterionFactory(
        methodology=mv, criterion=crit_active, is_active=True, weight=10,
        display_order=1,
    )
    MethodologyCriterionFactory(
        methodology=mv, criterion=crit_key_inactive, is_active=False, weight=0,
        display_order=2,
    )
    # Обычный inactive (без key_measurement) — НЕ должен попасть.
    MethodologyCriterionFactory(
        methodology=mv, criterion=crit_plain_inactive, is_active=False, weight=0,
        display_order=3,
    )

    data = MethodologySerializer(mv, context={}).data
    codes = [c["code"] for c in data["criteria"]]

    assert "c1" in codes
    assert "noise" in codes, "noise (key_measurement=True, is_active=False) должен попадать"
    assert "legacy" not in codes, "обычный inactive не должен попадать"

    noise_data = next(c for c in data["criteria"] if c["code"] == "noise")
    assert noise_data["is_key_measurement"] is True


@pytest.mark.django_db
def test_methodology_only_active_when_no_key_measurement():
    """Без ключевых замеров фильтр работает по-старому — только is_active=True."""
    mv = ActiveMethodologyVersionFactory()
    crit_a = CriterionFactory(code="a", is_key_measurement=False)
    crit_b = CriterionFactory(code="b", is_key_measurement=False)
    MethodologyCriterionFactory(methodology=mv, criterion=crit_a, is_active=True)
    MethodologyCriterionFactory(methodology=mv, criterion=crit_b, is_active=False)

    data = MethodologySerializer(mv, context={}).data
    codes = [c["code"] for c in data["criteria"]]
    assert codes == ["a"]


@pytest.mark.django_db
def test_parameter_score_serializer_includes_is_key_measurement():
    """ParameterScoreSerializer должен возвращать is_key_measurement
    через source criterion.is_key_measurement — фронт подсвечивает по нему
    блок «Ключевые замеры»."""
    crit = CriterionFactory(code="noise", is_key_measurement=True)
    model = ACModelFactory()
    run = CalculationRunFactory()
    cr = CalculationResultFactory(run=run, model=model, criterion=crit)

    data = ParameterScoreSerializer(cr).data

    assert "is_key_measurement" in data
    assert data["is_key_measurement"] is True


@pytest.mark.django_db
def test_parameter_score_serializer_false_for_regular_criterion():
    crit = CriterionFactory(code="cop", is_key_measurement=False)
    model = ACModelFactory()
    run = CalculationRunFactory()
    cr = CalculationResultFactory(run=run, model=model, criterion=crit)

    data = ParameterScoreSerializer(cr).data
    assert data["is_key_measurement"] is False
