"""Sync ModelRawValue for brand_age criteria from Brand.sales_start_year_ru."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ac_catalog.models import ACModel, ModelRawValue
from ac_methodology.models import Criterion, MethodologyCriterion, MethodologyVersion

if TYPE_CHECKING:
    from ac_brands.models import Brand


def active_brand_age_criterion_ids() -> list[int]:
    """Return standalone Criterion PKs for active brand_age criteria."""
    methodology = MethodologyVersion.objects.filter(is_active=True).first()
    if methodology is None:
        return []
    return list(
        MethodologyCriterion.objects.filter(
            methodology=methodology,
            is_active=True,
            criterion__value_type=Criterion.ValueType.BRAND_AGE,
        ).values_list("criterion_id", flat=True)
    )


def _year_raw_value(brand: "Brand") -> str:
    y = brand.sales_start_year_ru
    return str(y) if y is not None else ""


def sync_brand_age_for_model(ac_model: ACModel) -> int:
    """
    Set raw_value for all brand_age criteria on this model from the linked Brand.
    Returns number of ModelRawValue rows updated or created.
    """
    crit_ids = active_brand_age_criterion_ids()
    if not crit_ids:
        return 0

    val = _year_raw_value(ac_model.brand)
    n = 0
    for crit_id in crit_ids:
        updated = ModelRawValue.objects.filter(
            model=ac_model, criterion_id=crit_id,
        ).update(raw_value=val)
        if updated:
            n += updated
        else:
            ModelRawValue.objects.create(
                model=ac_model, criterion_id=crit_id, raw_value=val,
            )
            n += 1
    return n


def sync_brand_age_for_brand(brand: "Brand") -> int:
    """
    Update raw_value for all models of this brand (active methodology, brand_age criteria).
    Returns number of rows updated.
    """
    crit_ids = active_brand_age_criterion_ids()
    if not crit_ids:
        return 0

    val = _year_raw_value(brand)
    return ModelRawValue.objects.filter(
        model__brand=brand, criterion_id__in=crit_ids,
    ).update(raw_value=val)


def flag_active_methodology_recalc() -> None:
    MethodologyVersion.objects.filter(is_active=True).update(needs_recalculation=True)
