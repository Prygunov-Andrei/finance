import uuid
from django.db import models

from kanban_core.models import Card


class CommercialCase(models.Model):
    """Overlay-модель для карточки коммерческого пайплайна (КП + Маркетинг)"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.OneToOneField(Card, on_delete=models.CASCADE, related_name='commercial_case')

    erp_object_id = models.BigIntegerField(null=True, blank=True)
    erp_object_name = models.CharField(max_length=255, blank=True)
    system_name = models.CharField(max_length=255, blank=True, verbose_name='Система')
    erp_counterparty_id = models.BigIntegerField(null=True, blank=True)
    erp_counterparty_name = models.CharField(max_length=500, blank=True)
    erp_tkp_ids = models.JSONField(default=list, blank=True, verbose_name='ID привязанных ТКП')
    contacts_info = models.TextField(blank=True, verbose_name='Контакты потенциального заказчика')
    comments = models.TextField(blank=True, verbose_name='Комментарии')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'CommercialCase'
        verbose_name_plural = 'CommercialCases'

    def __str__(self):
        return f'CommercialCase {self.erp_object_name or self.id}'
