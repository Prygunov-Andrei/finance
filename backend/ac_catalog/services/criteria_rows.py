"""Создание строк ModelRawValue под все критерии методики (включая неактивные)."""

from __future__ import annotations

from ac_methodology.models import MethodologyCriterion, MethodologyVersion

from ac_catalog.models import ACModel, ModelRawValue


def ensure_all_criteria_rows(ac_model: ACModel) -> int:
    """Создать пустые ModelRawValue для каждого критерия методики, если строки ещё нет."""
    methodology = MethodologyVersion.objects.filter(is_active=True).first()
    if not methodology:
        return 0

    existing_ids = set(
        ModelRawValue.objects.filter(model=ac_model).values_list(
            "criterion_id", flat=True,
        )
    )
    missing_mc = MethodologyCriterion.objects.filter(
        methodology=methodology,
    ).exclude(criterion_id__in=existing_ids).select_related("criterion")

    to_create = [ModelRawValue(model=ac_model, criterion=mc.criterion) for mc in missing_mc]
    if to_create:
        ModelRawValue.objects.bulk_create(to_create)
    return len(to_create)
