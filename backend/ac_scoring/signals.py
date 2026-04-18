"""Сигналы рейтинга: enqueue пересчёта при пометке методики needs_recalculation."""
from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from ac_methodology.models import MethodologyVersion

from .tasks import recalculate_all_task

# Поля, которые `recalculate_all` сбрасывает после завершения; если save()
# затронул только их — это «обратный» апдейт от движка, ставить задачу не нужно.
_ENGINE_RESET_FIELDS = {"needs_recalculation", "updated_at"}


@receiver(post_save, sender=MethodologyVersion, dispatch_uid="ac_scoring.enqueue_recalc")
def enqueue_recalculate_on_methodology_save(sender, instance, update_fields=None, **kwargs):
    """При needs_recalculation=True + is_active=True ставим в Celery пересчёт.

    Защита от рекурсии: если save() пришёл с update_fields, состоящим только
    из «движковых» полей (см. _ENGINE_RESET_FIELDS), значит это сам движок
    сбросил флаг — не запускаем повторно.
    """
    if update_fields is not None and set(update_fields).issubset(_ENGINE_RESET_FIELDS):
        return

    if instance.is_active and instance.needs_recalculation:
        recalculate_all_task.delay(methodology_id=instance.pk)
