from django.db import models
from django.core.exceptions import ValidationError
from core.models import TimestampedModel


class ExpenseCategory(TimestampedModel):
    """Категория расходов/доходов с поддержкой иерархии"""
    
    name = models.CharField(
        max_length=255,
        verbose_name='Название категории'
    )
    code = models.CharField(
        max_length=100,
        unique=True,
        verbose_name='Код категории',
        help_text='Уникальный код для программного использования (например: salary, rent)'
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        related_name='children',
        null=True,
        blank=True,
        verbose_name='Родительская категория',
        help_text='Оставьте пустым для категории верхнего уровня'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активна',
        help_text='Неактивные категории не отображаются в списках'
    )
    requires_contract = models.BooleanField(
        default=False,
        verbose_name='Требует договор',
        help_text='Если отмечено, платежи этой категории должны быть привязаны к договору'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки',
        help_text='Чем меньше число, тем выше в списке'
    )
    
    class Meta:
        verbose_name = 'Категория расходов/доходов'
        verbose_name_plural = 'Категории расходов/доходов'
        ordering = ['sort_order', 'name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['parent', 'is_active']),
        ]
    
    def __str__(self) -> str:
        if self.parent:
            return f"{self.parent.name} → {self.name}"
        return self.name
    
    def clean(self):
        """Валидация модели"""
        # Проверка на циклические ссылки
        if self.parent:
            parent = self.parent
            while parent:
                if parent.id == self.id:
                    raise ValidationError('Нельзя создать циклическую ссылку на родительскую категорию')
                parent = parent.parent
    
    def get_full_path(self) -> str:
        """Возвращает полный путь категории (родитель → категория)"""
        if self.parent:
            return f"{self.parent.get_full_path()} → {self.name}"
        return self.name


class Payment(TimestampedModel):
    """Фактический платёж (по договору или операционный)"""

    class PaymentType(models.TextChoices):
        EXPENSE = 'expense', 'Расход'
        INCOME = 'income', 'Поступление'

    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.CASCADE,
        related_name='payments',
        verbose_name='Договор',
        null=True,
        blank=True,
        help_text='Оставьте пустым для операционных расходов/доходов'
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='payments',
        verbose_name='Категория',
        help_text='Категория платежа (например: Зарплата, Аренда)'
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
            models.Index(fields=['category', 'payment_date']),
        ]
    
    def clean(self):
        """Валидация платежа"""
        # Если категория требует договор, то contract обязателен
        if self.category and self.category.requires_contract and not self.contract:
            raise ValidationError({
                'contract': f'Категория "{self.category.name}" требует указания договора'
            })
        # Если указан contract, но категория не требует договор - это нормально
        # (можно привязать операционный платёж к договору для аналитики)
    
    def save(self, *args, **kwargs):
        """Переопределяем save для валидации"""
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        payment_type_label = self.get_payment_type_display()
        if self.contract:
            return f"{payment_type_label} {self.amount} от {self.payment_date} ({self.contract.number})"
        return f"{payment_type_label} {self.amount} от {self.payment_date} ({self.category.name})"


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
