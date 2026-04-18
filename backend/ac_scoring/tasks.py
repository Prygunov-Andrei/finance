"""Celery-задачи для рейтинга кондиционеров."""
from __future__ import annotations

from celery import shared_task

from ac_methodology.models import MethodologyVersion

from .engine import recalculate_all


@shared_task(name="ac_scoring.recalculate_all")
def recalculate_all_task(
    methodology_id: int | None = None,
    model_ids: list[int] | None = None,
) -> dict:
    """Запуск пересчёта индекса как Celery-задача.

    Параметры:
    - methodology_id: id методики; None → активная.
    - model_ids: список id моделей; None → все.

    Возвращает summary словарь (CalculationRun id, статус, кол-во моделей).
    """
    methodology = None
    if methodology_id is not None:
        methodology = MethodologyVersion.objects.get(pk=methodology_id)
    run = recalculate_all(methodology=methodology, model_ids=model_ids)
    return {
        "run_id": run.pk,
        "status": run.status,
        "models_processed": run.models_processed,
    }
