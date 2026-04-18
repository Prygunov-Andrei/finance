"""Сохранение индекса модели и строк CalculationResult."""

from __future__ import annotations

from django.utils import timezone

from ac_catalog.models import ACModel
from ac_methodology.models import MethodologyVersion
from ac_scoring.models import CalculationResult, CalculationRun

from .computation import compute_scores_for_model


def update_model_total_index(ac_model: ACModel) -> bool:
    """
    Пересчитывает и сохраняет только total_index (без CalculationRun / CalculationResult).
    False, если нет активной методики.
    """
    methodology = MethodologyVersion.objects.filter(is_active=True).first()
    if methodology is None:
        return False

    try:
        ac_model = ACModel.objects.select_related("brand", "brand__origin_class").get(
            pk=ac_model.pk,
        )
    except ACModel.DoesNotExist:
        return False

    total_index, _ = compute_scores_for_model(ac_model, methodology)
    ACModel.objects.filter(pk=ac_model.pk).update(
        total_index=total_index,
        updated_at=timezone.now(),
    )
    ac_model.total_index = total_index
    return True


def refresh_all_ac_model_total_indices() -> int:
    """
    Пересчитывает total_index у всех моделей каталога по текущей активной методике.
    Без CalculationRun. Возвращает число обработанных моделей.
    """
    methodology = MethodologyVersion.objects.filter(is_active=True).first()
    if methodology is None:
        return 0
    n = 0
    for ac in ACModel.objects.select_related("brand", "brand__origin_class").iterator():
        total_index, _ = compute_scores_for_model(ac, methodology)
        ACModel.objects.filter(pk=ac.pk).update(
            total_index=total_index,
            updated_at=timezone.now(),
        )
        n += 1
    return n


def calculate_model(
    ac_model: ACModel,
    methodology: MethodologyVersion,
    run: CalculationRun,
) -> float:
    """Индекс одной модели + запись CalculationResult."""
    total_index, rows = compute_scores_for_model(ac_model, methodology)

    results = [
        CalculationResult(
            run=run,
            model=ac_model,
            criterion=r["criterion"].criterion,
            raw_value=r["raw_value"],
            normalized_score=r["normalized_score"],
            weighted_score=r["weighted_score"],
            above_reference=r["above_reference"],
        )
        for r in rows
    ]
    CalculationResult.objects.bulk_create(results)

    ac_model.total_index = total_index
    ac_model.save(update_fields=["total_index", "updated_at"])

    return total_index
