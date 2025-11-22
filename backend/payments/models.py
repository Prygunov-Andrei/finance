from django.db import models
from core.models import TimestampedModel


class Payment(TimestampedModel):
    """Фактический платёж по договору"""

    class PaymentType(models.TextChoices):
        EXPENSE = 'expense', 'Расход'
        INCOME = 'income', 'Поступление'

    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.CASCADE,
        related_name='payments',
        verbose_name='Договор'
    )
    payment_type = models.CharField(
        max_length=20,
        choices=PaymentType.choices,
        verbose_name='Тип платежа'
    )
    payment_date = models.DateField(
        verbose_name='Дата платежа'
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Сумма'
    )
    company_account = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Счёт компании'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Назначение платежа'
    )
    document_link = models.CharField(
        max_length=500,
        blank=True,
        verbose_name='Ссылка на документ'
    )
    import_batch_id = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        verbose_name='Идентификатор импорта'
    )

    class Meta:
        verbose_name = 'Платёж'
        verbose_name_plural = 'Платежи'
        ordering = ['-payment_date', '-created_at']
        indexes = [
            models.Index(fields=['payment_date']),
            models.Index(fields=['payment_type', 'payment_date']),
            models.Index(fields=['contract', 'payment_date']),
        ]

    def __str__(self) -> str:
        payment_type_label = self.get_payment_type_display()
        return f"{payment_type_label} {self.amount} от {self.payment_date}"


class PaymentRegistry(TimestampedModel):
    """Реестр планируемых платежей"""

    class Status(models.TextChoices):
        PLANNED = 'planned', 'Планируется'
        APPROVED = 'approved', 'Утверждено'
        CANCELLED = 'cancelled', 'Отменено'

    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.CASCADE,
        related_name='planned_payments',
        verbose_name='Договор'
    )
    planned_date = models.DateField(
        verbose_name='Плановая дата'
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Сумма'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PLANNED,
        verbose_name='Статус'
    )
    initiator = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Инициатор платежа'
    )
    comment = models.TextField(
        blank=True,
        verbose_name='Комментарий'
    )

    class Meta:
        verbose_name = 'Плановый платёж'
        verbose_name_plural = 'Реестр плановых платежей'
        ordering = ['planned_date', '-created_at']
        indexes = [
            models.Index(fields=['planned_date']),
            models.Index(fields=['status', 'planned_date']),
            models.Index(fields=['contract', 'planned_date']),
        ]

    def __str__(self) -> str:
        return f"План {self.amount} на {self.planned_date} ({self.get_status_display()})"
