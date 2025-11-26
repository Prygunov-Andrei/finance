from django.db import models
from django.core.exceptions import ValidationError
from core.models import TimestampedModel
from django.conf import settings


def payment_scan_path(instance, filename):
    return f'payments/{instance.payment_date.year}/{instance.payment_date.month}/{filename}'

def invoice_scan_path(instance, filename):
    return f'invoices/{instance.planned_date.year}/{instance.planned_date.month}/{filename}'


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

    class Status(models.TextChoices):
        PENDING = 'pending', 'В обработке'
        PAID = 'paid', 'Проведен'
        CANCELLED = 'cancelled', 'Отменен'

    account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.PROTECT,
        related_name='payments',
        verbose_name='Счёт компании',
        null=True, # Nullable for migration compatibility
        blank=True
    )
    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.SET_NULL, # При удалении договора платежи остаются
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
    legal_entity = models.ForeignKey(
        'accounting.LegalEntity',
        on_delete=models.PROTECT,
        related_name='payments',
        verbose_name='Юридическое лицо',
        null=True,
        blank=True
    )
    payment_type = models.CharField(
        max_length=20,
        choices=PaymentType.choices,
        verbose_name='Тип платежа'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name='Статус'
    )
    payment_date = models.DateField(
        verbose_name='Дата платежа'
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Сумма'
    )
    # Для поддержки Legacy данных и простоты ввода
    amount_gross = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, verbose_name='Сумма с НДС'
    )
    amount_net = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, verbose_name='Сумма без НДС'
    )
    vat_amount = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, verbose_name='Сумма НДС'
    )
    
    description = models.TextField(
        blank=True,
        verbose_name='Назначение платежа'
    )
    scan_file = models.FileField(
        upload_to=payment_scan_path,
        blank=True, null=True,
        verbose_name='Скан платежки'
    )
    
    import_batch_id = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        verbose_name='Идентификатор импорта'
    )
    payment_registry = models.OneToOneField(
        'PaymentRegistry',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='payment_fact',
        verbose_name='Связанная заявка'
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
            models.Index(fields=['status']),
        ]
    
    def clean(self):
        """Валидация платежа"""
        if self.category and self.category.requires_contract and not self.contract:
            raise ValidationError({
                'contract': f'Категория "{self.category.name}" требует указания договора'
            })
        
        # Автозаполнение amount_gross/net если не задано, но есть amount
        if self.amount and not self.amount_gross:
            self.amount_gross = self.amount
            
        if self.account and self.legal_entity and self.account.legal_entity != self.legal_entity:
             raise ValidationError({'account': 'Счет должен принадлежать выбранному юрлицу'})

    def save(self, *args, **kwargs):
        self.full_clean()
        # Если не указано legal_entity, берем из счета
        if self.account and not self.legal_entity:
            self.legal_entity = self.account.legal_entity
            
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        payment_type_label = self.get_payment_type_display()
        entity = self.contract.number if self.contract else self.category.name
        return f"{payment_type_label} {self.amount} от {self.payment_date} ({entity})"


class PaymentRegistry(TimestampedModel):
    """Реестр планируемых платежей (Заявки на оплату)"""

    class Status(models.TextChoices):
        PLANNED = 'planned', 'Планируется'
        APPROVED = 'approved', 'Утверждено'
        PAID = 'paid', 'Оплачено'
        CANCELLED = 'cancelled', 'Отменено'

    account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.PROTECT,
        related_name='payment_requests',
        verbose_name='Счёт списания',
        null=True, blank=True
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='payment_requests',
        verbose_name='Категория',
        null=True, blank=True # Nullable for migration
    )
    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.CASCADE,
        related_name='planned_payments',
        verbose_name='Договор',
        null=True, blank=True # Nullable for operational expenses
    )
    act = models.ForeignKey(
        'contracts.Act',
        on_delete=models.SET_NULL,
        related_name='payment_requests',
        verbose_name='Основание (Акт)',
        null=True, blank=True,
        help_text='Если заполнено - постоплата по акту. Иначе - аванс.'
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
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='approved_payments',
        verbose_name='Кем одобрено'
    )
    approved_at = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Дата одобрения'
    )
    comment = models.TextField(
        blank=True,
        verbose_name='Комментарий'
    )
    invoice_file = models.FileField(
        upload_to=invoice_scan_path,
        blank=True, null=True,
        verbose_name='Скан счета на оплату'
    )
    
    class Meta:
        verbose_name = 'Заявка на платёж'
        verbose_name_plural = 'Реестр платежей'
        ordering = ['planned_date', '-created_at']
        indexes = [
            models.Index(fields=['planned_date']),
            models.Index(fields=['status', 'planned_date']),
            models.Index(fields=['contract', 'planned_date']),
        ]

    def __str__(self) -> str:
        return f"Заявка {self.amount} на {self.planned_date} ({self.get_status_display()})"
