import uuid
from decimal import Decimal

from django.db import models
from django.core.exceptions import ValidationError

from kanban_core.models import Card


class StockLocation(models.Model):
    class Kind(models.TextChoices):
        WAREHOUSE = 'warehouse', 'Склад'
        OBJECT = 'object', 'Объект'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    title = models.CharField(max_length=255)
    erp_object_id = models.IntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Локация склада'
        verbose_name_plural = 'Локации склада'
        unique_together = [('kind', 'erp_object_id')]


class StockMove(models.Model):
    class MoveType(models.TextChoices):
        IN_ = 'IN', 'Приход'
        OUT = 'OUT', 'Расход (выдача)'
        ADJUST = 'ADJUST', 'Корректировка'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    move_type = models.CharField(max_length=16, choices=MoveType.choices)

    from_location = models.ForeignKey(
        StockLocation, on_delete=models.PROTECT, null=True, blank=True, related_name='moves_out'
    )
    to_location = models.ForeignKey(
        StockLocation, on_delete=models.PROTECT, null=True, blank=True, related_name='moves_in'
    )

    card = models.ForeignKey(Card, on_delete=models.SET_NULL, null=True, blank=True, related_name='stock_moves')
    delivery_batch_id = models.UUIDField(null=True, blank=True)

    reason = models.CharField(max_length=255, blank=True)
    created_by_user_id = models.IntegerField(null=True, blank=True)
    created_by_username = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Движение склада'
        verbose_name_plural = 'Движения склада'
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.move_type == self.MoveType.IN_ and not self.to_location_id:
            raise ValidationError({'to_location': 'IN requires to_location'})
        if self.move_type == self.MoveType.OUT and not self.from_location_id:
            raise ValidationError({'from_location': 'OUT requires from_location'})
        if self.move_type == self.MoveType.ADJUST and not (self.from_location_id or self.to_location_id):
            raise ValidationError({'to_location': 'ADJUST requires a location (use to_location)'})
        if self.move_type == self.MoveType.ADJUST and not self.reason:
            raise ValidationError({'reason': 'ADJUST requires reason'})


class StockMoveLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    move = models.ForeignKey(StockMove, on_delete=models.CASCADE, related_name='lines')

    erp_product_id = models.IntegerField(null=True, blank=True)
    product_name = models.CharField(max_length=512)
    unit = models.CharField(max_length=32, default='шт')
    qty = models.DecimalField(max_digits=16, decimal_places=3, default=Decimal('0'))

    class Meta:
        verbose_name = 'Строка движения'
        verbose_name_plural = 'Строки движения'
        indexes = [
            models.Index(fields=['erp_product_id']),
        ]

