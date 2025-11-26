from django.db import models
from django.core.exceptions import ValidationError
from core.models import TimestampedModel


def correspondence_scan_path(instance, filename):
    """Путь для сохранения скана письма"""
    prefix = f"contract_{instance.contract.id}" if instance.contract else "general"
    return f'communications/{prefix}/{filename}'


class Correspondence(TimestampedModel):
    """Официальная переписка (Входящие/Исходящие)"""

    class Type(models.TextChoices):
        INCOMING = 'incoming', 'Входящее'
        OUTGOING = 'outgoing', 'Исходящее'

    class Category(models.TextChoices):
        LETTER = 'letter', 'Письмо'
        NOTIFICATION = 'notification', 'Уведомление'
        CLAIM = 'claim', 'Претензия'
        AGREEMENT = 'agreement', 'Согласование'
        OTHER = 'other', 'Другое'

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        SENT = 'sent', 'Отправлено'
        DELIVERED = 'delivered', 'Доставлено'
        RECEIVED = 'received', 'Получено'
        PROCESSED = 'processed', 'Обработано'
        CANCELLED = 'cancelled', 'Отменено'

    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.CASCADE,
        related_name='correspondence',
        verbose_name='Договор',
        null=True, blank=True,
        help_text='Договор, к которому относится письмо'
    )
    counterparty = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.PROTECT,
        related_name='correspondence',
        verbose_name='Контрагент',
        null=True, blank=True,
        help_text='Контрагент (заполняется автоматически если выбран договор)'
    )
    type = models.CharField(
        max_length=20,
        choices=Type.choices,
        verbose_name='Тип'
    )
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.LETTER,
        verbose_name='Категория'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='Статус'
    )
    
    number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Номер документа',
        help_text='Исходящий номер (для нас) или Входящий номер (от контрагента)'
    )
    date = models.DateField(
        verbose_name='Дата документа'
    )
    
    subject = models.CharField(
        max_length=255,
        verbose_name='Тема'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Содержание / Краткое описание'
    )
    
    file = models.FileField(
        upload_to=correspondence_scan_path,
        blank=True, null=True,
        verbose_name='Скан документа'
    )
    
    related_to = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        related_name='responses',
        verbose_name='В ответ на',
        null=True, blank=True,
        help_text='Письмо, на которое дается ответ (цепочка переписки)'
    )

    class Meta:
        verbose_name = 'Корреспонденция'
        verbose_name_plural = 'Корреспонденция'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['type', 'date']),
            models.Index(fields=['contract']),
            models.Index(fields=['counterparty']),
        ]

    def save(self, *args, **kwargs):
        # Если указан договор, но не указан контрагент - берем из договора
        if self.contract and not self.counterparty:
            self.counterparty = self.contract.counterparty
        super().save(*args, **kwargs)

    def __str__(self):
        direction = "Вх." if self.type == self.Type.INCOMING else "Исх."
        return f"{direction} №{self.number} от {self.date}: {self.subject}"
