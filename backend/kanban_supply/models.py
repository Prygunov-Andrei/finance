import uuid
from django.db import models

from kanban_core.models import Card


class SupplyCase(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.OneToOneField(Card, on_delete=models.CASCADE, related_name='supply_case')

    erp_object_id = models.IntegerField(null=True, blank=True)
    erp_contract_id = models.IntegerField(null=True, blank=True)
    supplier_label = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'SupplyCase'
        verbose_name_plural = 'SupplyCases'


class InvoiceRef(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supply_case = models.ForeignKey(SupplyCase, on_delete=models.CASCADE, related_name='invoice_refs')
    erp_invoice_id = models.IntegerField()

    cached_status = models.CharField(max_length=64, blank=True)
    cached_amount_gross = models.CharField(max_length=64, blank=True)
    cached_currency = models.CharField(max_length=16, blank=True)
    cached_due_date = models.DateField(null=True, blank=True)
    cached_updated_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'InvoiceRef'
        verbose_name_plural = 'InvoiceRefs'
        unique_together = [('supply_case', 'erp_invoice_id')]


class DeliveryBatch(models.Model):
    class Status(models.TextChoices):
        PLANNED = 'planned', 'План'
        IN_PROGRESS = 'in_progress', 'В процессе'
        DELIVERED = 'delivered', 'Поставлено'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supply_case = models.ForeignKey(SupplyCase, on_delete=models.CASCADE, related_name='deliveries')
    invoice_ref = models.ForeignKey(InvoiceRef, on_delete=models.SET_NULL, null=True, blank=True, related_name='deliveries')

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNED)
    planned_date = models.DateField(null=True, blank=True)
    actual_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'DeliveryBatch'
        verbose_name_plural = 'DeliveryBatches'

