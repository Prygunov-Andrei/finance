"""Unit-тесты для моделей ac_methodology."""
from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError

from ac_methodology.models import Criterion, MethodologyCriterion
from ac_methodology.tests.factories import (
    ActiveMethodologyVersionFactory,
    CriterionFactory,
    MethodologyCriterionFactory,
    MethodologyVersionFactory,
)


@pytest.mark.django_db
def test_methodology_version_str_inactive():
    mv = MethodologyVersionFactory(name="MD", version="2.0", is_active=False)
    assert str(mv) == "MD (v2.0)"


@pytest.mark.django_db
def test_methodology_version_str_active_marker():
    mv = MethodologyVersionFactory(name="MD", version="2.1", is_active=True)
    assert "[АКТИВНА]" in str(mv)


@pytest.mark.django_db
def test_methodology_version_save_enforces_single_active():
    a = ActiveMethodologyVersionFactory(version="A")
    b = ActiveMethodologyVersionFactory(version="B")
    a.refresh_from_db()
    b.refresh_from_db()
    assert b.is_active is True
    assert a.is_active is False


@pytest.mark.django_db
def test_methodology_version_save_keeps_self_active_on_update():
    mv = ActiveMethodologyVersionFactory(version="C")
    mv.name = "renamed"
    mv.save()
    mv.refresh_from_db()
    assert mv.is_active is True


@pytest.mark.django_db
def test_criterion_str():
    c = CriterionFactory(code="noise_min", name_ru="Шум")
    assert str(c) == "Шум (noise_min)"


@pytest.mark.django_db
def test_methodology_criterion_clean_min_greater_than_max_raises():
    mc = MethodologyCriterionFactory.build(
        methodology=MethodologyVersionFactory(),
        criterion=CriterionFactory(),
        min_value=10,
        max_value=5,
    )
    with pytest.raises(ValidationError) as exc:
        mc.clean()
    assert "min_value" in exc.value.message_dict


@pytest.mark.django_db
def test_methodology_criterion_clean_median_outside_min_max():
    mc = MethodologyCriterionFactory.build(
        methodology=MethodologyVersionFactory(),
        criterion=CriterionFactory(),
        min_value=0,
        max_value=10,
        median_value=20,
    )
    with pytest.raises(ValidationError) as exc:
        mc.clean()
    assert "median_value" in exc.value.message_dict


@pytest.mark.django_db
def test_methodology_criterion_clean_negative_weight():
    mc = MethodologyCriterionFactory.build(
        methodology=MethodologyVersionFactory(),
        criterion=CriterionFactory(),
        weight=-1,
    )
    with pytest.raises(ValidationError) as exc:
        mc.clean()
    assert "weight" in exc.value.message_dict


@pytest.mark.django_db
def test_methodology_criterion_clean_incompatible_scoring_for_binary():
    binary_crit = CriterionFactory(
        code="bool_feat", value_type=Criterion.ValueType.BINARY,
    )
    mc = MethodologyCriterionFactory.build(
        methodology=MethodologyVersionFactory(),
        criterion=binary_crit,
        scoring_type=MethodologyCriterion.ScoringType.MIN_MEDIAN_MAX,
        min_value=0,
        max_value=1,
    )
    with pytest.raises(ValidationError) as exc:
        mc.clean()
    assert "scoring_type" in exc.value.message_dict


@pytest.mark.django_db
def test_methodology_criterion_clean_min_median_max_requires_bounds():
    mc = MethodologyCriterionFactory.build(
        methodology=MethodologyVersionFactory(),
        criterion=CriterionFactory(),
        scoring_type=MethodologyCriterion.ScoringType.MIN_MEDIAN_MAX,
        min_value=None,
        max_value=None,
    )
    with pytest.raises(ValidationError) as exc:
        mc.clean()
    assert "min_value" in exc.value.message_dict


@pytest.mark.django_db
def test_methodology_criterion_clean_custom_scale_requires_json():
    mc = MethodologyCriterionFactory.build(
        methodology=MethodologyVersionFactory(),
        criterion=CriterionFactory(),
        scoring_type=MethodologyCriterion.ScoringType.CUSTOM_SCALE,
        min_value=None,
        max_value=None,
        custom_scale_json=None,
    )
    with pytest.raises(ValidationError) as exc:
        mc.clean()
    assert "custom_scale_json" in exc.value.message_dict


@pytest.mark.django_db
def test_methodology_criterion_clean_formula_requires_json():
    mc = MethodologyCriterionFactory.build(
        methodology=MethodologyVersionFactory(),
        criterion=CriterionFactory(),
        scoring_type=MethodologyCriterion.ScoringType.FORMULA,
        min_value=None,
        max_value=None,
        formula_json=None,
    )
    with pytest.raises(ValidationError) as exc:
        mc.clean()
    assert "formula_json" in exc.value.message_dict


@pytest.mark.django_db
def test_methodology_criterion_proxy_properties():
    c = CriterionFactory(
        code="cap_min", name_ru="Мощность", name_en="Capacity",
        unit="kW", value_type=Criterion.ValueType.NUMERIC,
    )
    mc = MethodologyCriterionFactory(criterion=c)
    assert mc.code == "cap_min"
    assert mc.name_ru == "Мощность"
    assert mc.name_en == "Capacity"
    assert mc.unit == "kW"
    assert mc.value_type == Criterion.ValueType.NUMERIC


# ── M4.4: Criterion.group ──────────────────────────────────────────────


@pytest.mark.django_db
def test_criterion_group_default_is_other():
    """Без явного указания группа = «other» (показывается последним блоком)."""
    c = CriterionFactory(code="some_new_param")
    assert c.group == Criterion.Group.OTHER


@pytest.mark.django_db
def test_criterion_group_choices_valid():
    """Невалидное значение группы режется на full_clean()."""
    c = CriterionFactory(code="x", group="not_a_real_group")
    with pytest.raises(ValidationError) as exc:
        c.full_clean()
    assert "group" in exc.value.message_dict


@pytest.mark.django_db
def test_criterion_group_accepts_known_values():
    """Все 6 enum-значений группы валидны."""
    for value in [g[0] for g in Criterion.Group.choices]:
        c = CriterionFactory(code=f"check_{value}", group=value)
        c.full_clean()  # без исключений
        assert c.group == value
