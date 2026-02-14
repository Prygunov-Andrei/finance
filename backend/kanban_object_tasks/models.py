import uuid
from datetime import date

from django.db import models

from kanban_core.models import Card


class ObjectTask(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.OneToOneField(Card, on_delete=models.CASCADE, related_name='object_task')

    erp_object_id = models.IntegerField(null=True, blank=True)
    priority = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Задача по объекту'
        verbose_name_plural = 'Задачи по объекту'


class OverdueMarker(models.Model):
    """
    Идемпотентность: одну и ту же просрочку по карточке отмечаем один раз в сутки.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name='overdue_markers')
    marker_date = models.DateField(default=date.today)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('card', 'marker_date')]
        indexes = [
            models.Index(fields=['marker_date']),
        ]

