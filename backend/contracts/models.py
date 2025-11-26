from decimal import Decimal
from datetime import date
from typing import Optional, Dict
from django.db import models
from django.core.exceptions import ValidationError
from core.models import TimestampedModel
from core.cashflow import CashFlowCalculator
import os


def contract_scan_path(instance, filename):
    return f'contracts/contract_{instance.id}/{filename}'

def amendment_scan_path(instance, filename):
    return f'contracts/contract_{instance.contract.id}/amendments/{filename}'

def act_scan_path(instance, filename):
    return f'contracts/contract_{instance.contract.id}/acts/{filename}'

def commercial_proposal_scan_path(instance, filename):
    return f'contracts/proposals/{instance.id}/{filename}'


class CommercialProposal(TimestampedModel):
    """Коммерческое предложение (ТКП / Монтажное)"""
    
    class Type(models.TextChoices):
        INCOME = 'income', 'ТКП для Заказчика'
        EXPENSE = 'expense', 'Монтажное предложение Исполнителя'

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        SENT = 'sent', 'Отправлено'
        APPROVED = 'approved', 'Согласовано'
        REJECTED = 'rejected', 'Отклонено'

    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.CASCADE,
        related_name='commercial_proposals',
        verbose_name='Объект'
    )
    counterparty = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.PROTECT,
        related_name='commercial_proposals',
        verbose_name='Контрагент'
    )
    proposal_type = models.CharField(
        max_length=20,
        choices=Type.choices,
        default=Type.EXPENSE,
        verbose_name='Тип предложения'
    )
    number = models.CharField(
        max_length=100,
        verbose_name='Номер предложения'
    )
    date = models.DateField(
        verbose_name='Дата предложения'
    )
    total_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Итоговая сумма'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='Статус'
    )
    file = models.FileField(
        upload_to=commercial_proposal_scan_path,
        blank=True, null=True,
        verbose_name='Файл предложения'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Примечания'
    )

    class Meta:
        verbose_name = 'Коммерческое предложение'
        verbose_name_plural = 'Коммерческие предложения'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"КП №{self.number} от {self.date} ({self.get_status_display()})"


class Contract(TimestampedModel):
    """Договор, связанный со строительным объектом"""

    class Status(models.TextChoices):
        PLANNED = 'planned', 'Планируется'
        ACTIVE = 'active', 'В работе'
        COMPLETED = 'completed', 'Завершён'
        SUSPENDED = 'suspended', 'Приостановлен'
        TERMINATED = 'terminated', 'Расторгнут'

    class Type(models.TextChoices):
        INCOME = 'income', 'Доходный (с Заказчиком)'
        EXPENSE = 'expense', 'Расходный (с Исполнителем)'

    class Currency(models.TextChoices):
        RUB = 'RUB', 'Российский рубль'
        USD = 'USD', 'Доллар США'
        EUR = 'EUR', 'Евро'

    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.CASCADE,
        related_name='contracts',
        verbose_name='Объект'
    )
    legal_entity = models.ForeignKey(
        'accounting.LegalEntity',
        on_delete=models.PROTECT,
        related_name='contracts',
        verbose_name='Наше юрлицо',
        null=True,  # Nullable for migration
        blank=True
    )
    counterparty = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.PROTECT,
        related_name='contracts',
        verbose_name='Контрагент',
        null=True,  # Nullable for migration
        blank=True
    )
    contract_type = models.CharField(
        max_length=20,
        choices=Type.choices,
        default=Type.EXPENSE,
        verbose_name='Тип договора'
    )
    commercial_proposal = models.OneToOneField(
        'CommercialProposal',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='contract',
        verbose_name='Основание (КП)',
        help_text='Предложение, на основании которого создан договор'
    )
    parent_contract = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='subcontracts',
        verbose_name='Родительский договор',
        help_text='Для зеркальных договоров: ссылка на договор с Заказчиком'
    )
    
    number = models.CharField(
        max_length=100,
        verbose_name='Номер договора'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название / предмет договора'
    )
    contract_date = models.DateField(
        verbose_name='Дата заключения'
    )
    start_date = models.DateField(
        verbose_name='Дата начала работ',
        null=True,
        blank=True
    )
    end_date = models.DateField(
        verbose_name='Плановая дата завершения',
        null=True,
        blank=True
    )
    
    total_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Сумма договора'
    )
    currency = models.CharField(
        max_length=3,
        choices=Currency.choices,
        default=Currency.RUB,
        verbose_name='Валюта'
    )
    vat_rate = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=20.00,
        verbose_name='Ставка НДС, %'
    )
    vat_included = models.BooleanField(
        default=True,
        verbose_name='Сумма включает НДС'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PLANNED,
        verbose_name='Статус'
    )
    file = models.FileField(
        upload_to=contract_scan_path,
        blank=True,
        null=True,
        verbose_name='Скан договора'
    )
    notes = models.TextField(
        blank=True,
        verbose_name='Примечания'
    )

    class Meta:
        verbose_name = 'Договор'
        verbose_name_plural = 'Договоры'
        ordering = ['-contract_date', '-created_at']
        unique_together = ('object', 'number')

    def __str__(self) -> str:
        return f"{self.number} — {self.name}"
    
    def clean(self):
        """Бизнес-правила валидации"""
        if self.status == self.Status.ACTIVE:
            if not self.commercial_proposal:
                raise ValidationError({'status': 'Нельзя перевести договор в статус "В работе" без привязанного КП.'})
            if self.commercial_proposal.status != CommercialProposal.Status.APPROVED:
                raise ValidationError({'commercial_proposal': 'Привязанное КП должно быть в статусе "Согласовано".'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    def get_cash_flow(self, start_date=None, end_date=None):
        return CashFlowCalculator.calculate_for_contract(
            self.id, start_date=start_date, end_date=end_date
        )
    
    def get_cash_flow_by_periods(self, period_type='month', start_date=None, end_date=None):
        return CashFlowCalculator.calculate_by_periods(
            contract_id=self.id, period_type=period_type, start_date=start_date, end_date=end_date
        )
    
    def get_balance(self) -> Decimal:
        """
        Расчет баланса договора (Сверка).
        Income: Нам должны (Акты - Платежи).
        Expense: Мы должны (Акты - Платежи).
        """
        acts_sum = self.acts.filter(status=Act.Status.SIGNED).aggregate(
            total=models.Sum('amount_gross')
        )['total'] or Decimal('0')
        
        payments_sum = self.payments.filter(status='paid').aggregate( # Filter only paid payments
             total=models.Sum('amount') 
        )['total'] or Decimal('0')
        
        return acts_sum - payments_sum

    def get_margin(self) -> Decimal:
        """
        Расчет маржинальности для доходного договора.
        Маржа = (Сумма Актов по этому договору) - (Сумма Актов по всем дочерним расходным договорам)
        Считаем по 'amount_net' (без НДС), так как это реальная выручка/затраты.
        """
        if self.contract_type != self.Type.INCOME:
            return Decimal('0')
            
        income = self.acts.filter(status=Act.Status.SIGNED).aggregate(t=models.Sum('amount_net'))['t'] or Decimal('0')
        
        # Расходы по дочерним договорам (субподряд)
        expenses = Act.objects.filter(
            contract__parent_contract=self, 
            status=Act.Status.SIGNED
        ).aggregate(t=models.Sum('amount_net'))['t'] or Decimal('0')
        
        return income - expenses


class ContractAmendment(TimestampedModel):
    """Дополнительное соглашение к договору"""
    
    contract = models.ForeignKey(
        Contract,
        on_delete=models.CASCADE,
        related_name='amendments',
        verbose_name='Договор'
    )
    number = models.CharField(
        max_length=50,
        verbose_name='Номер Доп.Соглашения'
    )
    date = models.DateField(
        verbose_name='Дата подписания'
    )
    reason = models.TextField(
        verbose_name='Причина изменений'
    )
    new_start_date = models.DateField(
        null=True, blank=True,
        verbose_name='Новая дата начала'
    )
    new_end_date = models.DateField(
        null=True, blank=True,
        verbose_name='Новая дата окончания'
    )
    new_total_amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        null=True, blank=True,
        verbose_name='Новая сумма'
    )
    file = models.FileField(
        upload_to=amendment_scan_path,
        blank=True, null=True,
        verbose_name='Скан документа'
    )

    class Meta:
        verbose_name = 'Доп. соглашение'
        verbose_name_plural = 'Доп. соглашения'
        ordering = ['date']
        unique_together = ('contract', 'number')

    def __str__(self):
        return f"ДС №{self.number} к {self.contract.number}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Автоматически обновляем договор
        updated = False
        if self.new_start_date:
            self.contract.start_date = self.new_start_date
            updated = True
        if self.new_end_date:
            self.contract.end_date = self.new_end_date
            updated = True
        if self.new_total_amount:
            self.contract.total_amount = self.new_total_amount
            updated = True
        
        if updated:
            self.contract.save()


class WorkScheduleItem(TimestampedModel):
    """Строка графика выполнения работ"""
    
    class Status(models.TextChoices):
        PENDING = 'pending', 'Не начато'
        IN_PROGRESS = 'in_progress', 'В работе'
        DONE = 'done', 'Выполнено'
    
    contract = models.ForeignKey(
        Contract,
        on_delete=models.CASCADE,
        related_name='schedule_items',
        verbose_name='Договор'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Наименование работ'
    )
    start_date = models.DateField(
        verbose_name='Начало'
    )
    end_date = models.DateField(
        verbose_name='Окончание'
    )
    workers_count = models.PositiveIntegerField(
        default=0,
        verbose_name='Кол-во рабочих'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name='Статус'
    )

    class Meta:
        verbose_name = 'Задача графика'
        verbose_name_plural = 'График работ'
        ordering = ['start_date']

    def __str__(self):
        return self.name

    def clean(self):
        """Проверка дат"""
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValidationError('Дата окончания не может быть раньше начала.')
        
        if self.contract.start_date and self.start_date < self.contract.start_date:
             raise ValidationError(f'Дата начала задачи ({self.start_date}) раньше начала договора ({self.contract.start_date})')
             
        if self.contract.end_date and self.end_date > self.contract.end_date:
             raise ValidationError(f'Дата окончания задачи ({self.end_date}) позже окончания договора ({self.contract.end_date})')

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class Act(TimestampedModel):
    """Акт выполненных работ (КС-2/КС-3)"""
    
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        SIGNED = 'signed', 'Подписан'
        CANCELLED = 'cancelled', 'Отменен'

    contract = models.ForeignKey(
        Contract,
        on_delete=models.CASCADE,
        related_name='acts',
        verbose_name='Договор'
    )
    number = models.CharField(
        max_length=50,
        verbose_name='Номер документа'
    )
    date = models.DateField(
        verbose_name='Дата подписания'
    )
    period_start = models.DateField(
        null=True, blank=True,
        verbose_name='Начало периода работ'
    )
    period_end = models.DateField(
        null=True, blank=True,
        verbose_name='Конец периода работ'
    )
    amount_gross = models.DecimalField(
        max_digits=14, decimal_places=2,
        verbose_name='Сумма с НДС'
    )
    amount_net = models.DecimalField(
        max_digits=14, decimal_places=2,
        verbose_name='Сумма без НДС'
    )
    vat_amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        verbose_name='Сумма НДС'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='Статус'
    )
    file = models.FileField(
        upload_to=act_scan_path,
        blank=True, null=True,
        verbose_name='Скан акта'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание работ'
    )

    class Meta:
        verbose_name = 'Акт выполненных работ'
        verbose_name_plural = 'Акты выполненных работ'
        unique_together = ('contract', 'number')
        ordering = ['-date']

    def __str__(self):
        return f"Акт №{self.number} от {self.date} ({self.contract.number})"


class ActPaymentAllocation(models.Model):
    """Связь Платежа и Акта (распределение суммы)"""
    
    act = models.ForeignKey(
        Act,
        on_delete=models.CASCADE,
        related_name='payment_allocations',
        verbose_name='Акт'
    )
    payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.CASCADE,
        related_name='act_allocations',
        verbose_name='Платёж'
    )
    amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        verbose_name='Сумма покрытия'
    )
    created_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        verbose_name = 'Распределение оплаты'
        verbose_name_plural = 'Распределения оплат'
