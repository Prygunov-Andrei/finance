"""Пакетный пересчёт с CalculationRun."""

from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone

from ac_catalog.models import ACModel
from ac_methodology.models import MethodologyVersion
from ac_scoring.models import CalculationResult, CalculationRun

from .persistence import calculate_model

logger = logging.getLogger(__name__)


def recalculate_all(
    methodology: MethodologyVersion | None = None,
    user=None,
    model_ids: list[int] | None = None,
) -> CalculationRun:
    """Пересчёт индекса для всех (или выбранных) моделей."""
    if methodology is None:
        methodology = MethodologyVersion.objects.filter(is_active=True).first()
        if not methodology:
            raise ValueError("Нет активной методики")

    with transaction.atomic():
        # Блокируем запущенные runs для предотвращения race condition
        running = (
            CalculationRun.objects
            .select_for_update()
            .filter(status=CalculationRun.Status.RUNNING)
            .exists()
        )
        if running:
            raise ValueError("Расчёт уже выполняется")

        run = CalculationRun.objects.create(
            methodology=methodology,
            triggered_by=user,
            status=CalculationRun.Status.RUNNING,
        )

    try:
        with transaction.atomic():
            qs = ACModel.objects.select_related("brand", "brand__origin_class")
            if model_ids:
                qs = qs.filter(pk__in=model_ids)

            count = 0
            for ac_model in qs:
                calculate_model(ac_model, methodology, run)
                count += 1

            run.status = CalculationRun.Status.COMPLETED
            run.finished_at = timezone.now()
            run.models_processed = count
            run.save()

            methodology.needs_recalculation = False
            methodology.save(update_fields=["needs_recalculation", "updated_at"])

    except Exception as e:
        logger.exception("Recalculation failed for run #%s", run.pk)
        run.status = CalculationRun.Status.FAILED
        run.error_message = str(e)
        run.finished_at = timezone.now()
        run.save()
        raise

    return run
