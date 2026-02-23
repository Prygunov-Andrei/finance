from decimal import Decimal
from datetime import date as date_type
from typing import Optional, Dict
from django.db import models
from django.core.exceptions import ValidationError
from django.conf import settings
from core.models import TimestampedModel
from core.cashflow import CashFlowCalculator


def contract_scan_path(instance, filename):
    return f'contracts/contract_{instance.id}/{filename}'

def amendment_scan_path(instance, filename):
    return f'contracts/contract_{instance.contract.id}/amendments/{filename}'

def act_scan_path(instance, filename):
    return f'contracts/contract_{instance.contract.id}/acts/{filename}'

def framework_contract_file_path(instance, filename):
    return f'contracts/framework/{instance.counterparty.id}/{instance.number}/{filename}'

def contract_estimate_file_path(instance, filename):
    return f'contracts/contract_{instance.contract.id}/estimates/{filename}'


class FrameworkContract(TimestampedModel):
    """Рамочный договор с Исполнителем, содержащий согласованные прайс-листы"""
    
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        ACTIVE = 'active', 'Действующий'
        EXPIRED = 'expired', 'Истёк срок'
        TERMINATED = 'terminated', 'Расторгнут'
    
    number = models.CharField(
        max_length=100,
        verbose_name='Номер договора'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название'
    )
    date = models.DateField(
        verbose_name='Дата заключения'
    )
    valid_from = models.DateField(
        verbose_name='Начало действия'
    )
    valid_until = models.DateField(
        verbose_name='Окончание действия'
    )
    legal_entity = models.ForeignKey(
        'accounting.LegalEntity',
        on_delete=models.PROTECT,
        related_name='framework_contracts',
        verbose_name='Наша компания'
    )
    counterparty = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.PROTECT,
        related_name='framework_contracts',
        verbose_name='Исполнитель'
    )
    price_lists = models.ManyToManyField(
        'pricelists.PriceList',
        related_name='framework_contracts',
        blank=True,
        verbose_name='Согласованные прайс-листы'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='Статус'
    )
    file = models.FileField(
        upload_to=framework_contract_file_path,
        blank=True,
        null=True,
        verbose_name='Скан договора'
    )
    notes = models.TextField(
        blank=True,
        verbose_name='Примечания'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_framework_contracts',
        verbose_name='Кто создал'
    )
    
    class Meta:
        verbose_name = 'Рамочный договор'
        verbose_name_plural = 'Рамочные договоры'
        ordering = ['-date', '-created_at']
    
    def __str__(self) -> str:
        return f"{self.number} — {self.name}"
    
    def clean(self):
        """Валидация рамочного договора"""
        # Контрагент должен быть Исполнителем
        if self.counterparty and self.counterparty.type not in ['vendor', 'both']:
            raise ValidationError({
                'counterparty': 'Рамочный договор можно заключить только с Исполнителем'
            })
        
        # valid_until должен быть после valid_from
        if self.valid_from and self.valid_until:
            if self.valid_until < self.valid_from:
                raise ValidationError({
                    'valid_until': 'Дата окончания не может быть раньше даты начала'
                })
    
    def save(self, *args, **kwargs):
        if not self.number:
            self.number = self._generate_number()
        self.full_clean()
        super().save(*args, **kwargs)
    
    def _generate_number(self) -> str:
        """
        Генерация номера рамочного договора.
        Формат: РД-{год}-{порядковый_номер}
        Пример: РД-2025-001, РД-2025-002
        """
        from core.number_generator import generate_sequential_number
        return generate_sequential_number(FrameworkContract, prefix='РД', digits=3)
    
    @property
    def is_expired(self) -> bool:
        """Проверка истечения срока действия"""
        from datetime import date
        if self.valid_until:
            return date.today() > self.valid_until
        return False
    
    @property
    def is_active(self) -> bool:
        """Проверка что договор действует сейчас"""
        from datetime import date
        today = date.today()
        if self.status != self.Status.ACTIVE:
            return False
        if self.valid_from and today < self.valid_from:
            return False
        if self.valid_until and today > self.valid_until:
            return False
        return True
    
    @property
    def days_until_expiration(self) -> int:
        """Дней до истечения срока"""
        from datetime import date
        if self.valid_until:
            delta = self.valid_until - date.today()
            return delta.days
        return 0
    
    @property
    def contracts_count(self) -> int:
        """Количество договоров под этот рамочный.
        Может быть перезаписано через annotate в QuerySet."""
        if hasattr(self, '_contracts_count_cached'):
            return self._contracts_count_cached
        return self.contracts.count()

    @contracts_count.setter
    def contracts_count(self, value):
        self._contracts_count_cached = value

    @property
    def total_contracts_amount(self) -> Decimal:
        """Общая сумма договоров под этот рамочный"""
        from django.db.models import Sum
        return self.contracts.aggregate(
            total=Sum('total_amount')
        )['total'] or Decimal('0')


class Contract(TimestampedModel):
    """Договор, связанный со строительным объектом"""

    class Status(models.TextChoices):
        PLANNED = 'planned', 'Планируется'
        AGREED = 'agreed', 'Согласован'
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
        verbose_name='Объект',
        null=True,
        blank=True,
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
    technical_proposal = models.OneToOneField(
        'proposals.TechnicalProposal',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contract',
        verbose_name='Основание (ТКП)',
        help_text='ТКП, на основании которого создан договор'
    )
    mounting_proposal = models.OneToOneField(
        'proposals.MountingProposal',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contract',
        verbose_name='Основание (МП)',
        help_text='МП, на основании которого создан договор с Исполнителем'
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
    framework_contract = models.ForeignKey(
        'FrameworkContract',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contracts',
        verbose_name='Рамочный договор',
        help_text='Рамочный договор, под который создан этот договор (только для расходных)'
    )
    responsible_manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_contracts',
        verbose_name='Начальник участка',
        help_text='Ответственный начальник участка'
    )
    responsible_engineer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='engineered_contracts',
        verbose_name='Ответственный инженер',
        help_text='Ответственный инженер по договору'
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
        indexes = [
            models.Index(fields=['contract_date']),
            models.Index(fields=['status', 'contract_date']),
            models.Index(fields=['contract_type', 'status']),
            models.Index(fields=['object', 'status']),
            models.Index(fields=['counterparty', 'status']),
            models.Index(fields=['framework_contract']),
            models.Index(fields=['end_date']),
        ]

    def __str__(self) -> str:
        return f"{self.number} — {self.name}"
    
    def clean(self):
        """Бизнес-правила валидации"""
        if self.status == self.Status.ACTIVE:
            if self.contract_type == self.Type.INCOME:
                if not self.technical_proposal:
                    raise ValidationError({'status': 'Нельзя перевести договор в статус "В работе" без привязанного ТКП.'})
                if self.technical_proposal.status != 'approved':
                    raise ValidationError({'technical_proposal': 'Привязанное ТКП должно быть утверждено.'})
            elif self.contract_type == self.Type.EXPENSE:
                if not self.mounting_proposal:
                    raise ValidationError({'status': 'Нельзя перевести договор в статус "В работе" без привязанного МП.'})
                if self.mounting_proposal.status != 'approved':
                    raise ValidationError({'mounting_proposal': 'Привязанное МП должно быть утверждено.'})
        
        # Рамочный договор только для расходных
        if self.framework_contract and self.contract_type != self.Type.EXPENSE:
            raise ValidationError({
                'framework_contract': 'Рамочный договор можно указать только для расходных договоров'
            })
        
        # Исполнитель должен совпадать
        if self.framework_contract and self.counterparty:
            if self.framework_contract.counterparty != self.counterparty:
                raise ValidationError({
                    'framework_contract': 'Исполнитель в рамочном договоре не совпадает с контрагентом'
                })
        
        # Рамочный договор должен быть активен
        if self.framework_contract:
            if self.framework_contract.status != FrameworkContract.Status.ACTIVE:
                raise ValidationError({
                    'framework_contract': 'Рамочный договор должен быть в статусе "Действующий"'
                })

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
        
        Оптимизировано: использует один запрос с агрегацией.
        """
        if self.contract_type != self.Type.INCOME:
            return Decimal('0')
        
        # Получаем доходы и расходы одним запросом через подзапрос
        from django.db.models import OuterRef, Subquery
        from django.db.models.functions import Coalesce
        
        income = self.acts.filter(
            status=Act.Status.SIGNED
        ).aggregate(
            t=Coalesce(models.Sum('amount_net'), Decimal('0'))
        )['t']
        
        # Расходы по дочерним договорам (субподряд)
        expenses = Act.objects.filter(
            contract__parent_contract=self, 
            status=Act.Status.SIGNED
        ).aggregate(
            t=Coalesce(models.Sum('amount_net'), Decimal('0'))
        )['t']
        
        return income - expenses
    
    def get_margin_details(self) -> Dict[str, Decimal]:
        """
        Возвращает детальную информацию о маржинальности.
        
        Returns:
            {
                'income': Decimal,      # Доходы (сумма актов)
                'expenses': Decimal,    # Расходы (сумма актов субподрядчиков)
                'margin': Decimal,      # Маржа в рублях
                'margin_percent': Decimal  # Маржа в процентах
            }
        """
        from django.db.models.functions import Coalesce
        
        if self.contract_type != self.Type.INCOME:
            return {
                'income': Decimal('0'),
                'expenses': Decimal('0'),
                'margin': Decimal('0'),
                'margin_percent': Decimal('0')
            }
        
        income = self.acts.filter(
            status=Act.Status.SIGNED
        ).aggregate(
            t=Coalesce(models.Sum('amount_net'), Decimal('0'))
        )['t']
        
        expenses = Act.objects.filter(
            contract__parent_contract=self,
            status=Act.Status.SIGNED
        ).aggregate(
            t=Coalesce(models.Sum('amount_net'), Decimal('0'))
        )['t']
        
        margin = income - expenses
        margin_percent = (margin / income * 100) if income else Decimal('0')
        
        return {
            'income': income,
            'expenses': expenses,
            'margin': margin,
            'margin_percent': margin_percent.quantize(Decimal('0.01'))
        }


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
    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contract_amendments',
        verbose_name='Объект (для рамочных)',
        help_text='На какой объект ДОП (для рамочных договоров с Заказчиком)',
    )
    parent_amendment = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='child_amendments',
        verbose_name='Родительское ДОП',
        help_text='ДОП к ДОП',
    )
    contract_estimate = models.ForeignKey(
        'ContractEstimate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='amendments',
        verbose_name='Новая смета',
    )
    content_md = models.TextField(
        blank=True,
        verbose_name='Текст допсоглашения (md)',
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
        AGREED = 'agreed', 'Согласован'
        SIGNED = 'signed', 'Подписан'
        CANCELLED = 'cancelled', 'Отменен'

    class ActType(models.TextChoices):
        KS2 = 'ks2', 'КС-2 (Акт о приёмке выполненных работ)'
        KS3 = 'ks3', 'КС-3 (Справка о стоимости)'
        SIMPLE = 'simple', 'Простой акт'

    contract = models.ForeignKey(
        Contract,
        on_delete=models.CASCADE,
        related_name='acts',
        verbose_name='Договор'
    )
    act_type = models.CharField(
        max_length=20,
        choices=ActType.choices,
        default=ActType.KS2,
        verbose_name='Тип акта',
    )
    contract_estimate = models.ForeignKey(
        'ContractEstimate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acts',
        verbose_name='Смета к договору',
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
    due_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Срок оплаты',
        help_text='Срок оплаты по акту'
    )

    def save(self, *args, **kwargs):
        # Авторасчет НДС если задан Gross, а остальные не заданы (или 0)
        if self.amount_gross and (not self.amount_net or not self.vat_amount):
            rate = self.contract.vat_rate  # Например, 20.00
            # Формула для включенного НДС: Net = Gross / (1 + rate/100)
            # Если НДС сверху: Net = Gross (но у нас по логике Gross - это итоговая сумма)
            
            divisor = Decimal('1') + (rate / Decimal('100'))
            calculated_net = round(self.amount_gross / divisor, 2)
            calculated_vat = self.amount_gross - calculated_net
            
            if not self.amount_net:
                self.amount_net = calculated_net
            if not self.vat_amount:
                self.vat_amount = calculated_vat

        self.full_clean()
        super().save(*args, **kwargs)

    class Meta:
        verbose_name = 'Акт'
        verbose_name_plural = 'Акты'
        ordering = ['-date']
        indexes = [
            models.Index(fields=['contract', 'status']),
            models.Index(fields=['date']),
            models.Index(fields=['status', 'date']),
            models.Index(fields=['due_date']),
            models.Index(fields=['act_type']),
        ]

    @classmethod
    def create_from_accumulative(cls, contract_estimate, items_data, **act_kwargs):
        """Формирование КС-2 из накопительной сметы.
        
        Args:
            contract_estimate: ContractEstimate
            items_data: список строк для акта [{contract_estimate_item_id, quantity, ...}]
            **act_kwargs: number, date, period_start, period_end, etc.
        """
        total_net = Decimal('0')
        act = cls.objects.create(
            contract=contract_estimate.contract,
            contract_estimate=contract_estimate,
            act_type=cls.ActType.KS2,
            amount_gross=Decimal('0'),
            amount_net=Decimal('0'),
            vat_amount=Decimal('0'),
            **act_kwargs,
        )
        
        act_items = []
        for i, item_data in enumerate(items_data):
            cei = ContractEstimateItem.objects.get(pk=item_data['contract_estimate_item_id'])
            quantity = Decimal(str(item_data.get('quantity', cei.quantity)))
            unit_price = Decimal(str(item_data.get('unit_price', cei.work_unit_price + cei.material_unit_price)))
            amount = (quantity * unit_price).quantize(Decimal('0.01'))
            total_net += amount
            
            act_items.append(ActItem(
                act=act,
                contract_estimate_item=cei,
                name=cei.name,
                unit=cei.unit,
                quantity=quantity,
                unit_price=unit_price,
                amount=amount,
                sort_order=i,
            ))
        
        if act_items:
            ActItem.objects.bulk_create(act_items)
        
        rate = act.contract.vat_rate
        divisor = Decimal('1') + (rate / Decimal('100'))
        act.amount_net = total_net
        act.vat_amount = (total_net * rate / Decimal('100')).quantize(Decimal('0.01'))
        act.amount_gross = total_net + act.vat_amount
        act.save(update_fields=['amount_net', 'vat_amount', 'amount_gross'])
        
        return act


class ActItem(TimestampedModel):
    """Строка акта — для КС-2 и КС-3"""
    
    act = models.ForeignKey(
        Act,
        on_delete=models.CASCADE,
        related_name='act_items',
        verbose_name='Акт',
    )
    contract_estimate_item = models.ForeignKey(
        'ContractEstimateItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='act_items',
        verbose_name='Строка сметы',
    )
    name = models.CharField(
        max_length=500,
        verbose_name='Наименование работ',
    )
    unit = models.CharField(
        max_length=50,
        default='шт',
        verbose_name='Единица измерения',
    )
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        verbose_name='Количество',
    )
    unit_price = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Цена за единицу',
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Сумма',
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки',
    )

    class Meta:
        verbose_name = 'Строка акта'
        verbose_name_plural = 'Строки актов'
        ordering = ['sort_order', 'id']
        indexes = [
            models.Index(fields=['act']),
        ]

    def __str__(self):
        return f"{self.name[:80]} — {self.amount}"


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


class ContractText(TimestampedModel):
    """Хранение текста договора и допсоглашений в markdown-формате
    для поиска и анализа с помощью LLM."""
    
    contract = models.ForeignKey(
        Contract,
        on_delete=models.CASCADE,
        related_name='texts',
        verbose_name='Договор',
    )
    amendment = models.ForeignKey(
        ContractAmendment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='texts',
        verbose_name='Допсоглашение',
        help_text='null = основной текст договора',
    )
    content_md = models.TextField(
        verbose_name='Текст в формате Markdown',
    )
    version = models.PositiveIntegerField(
        default=1,
        verbose_name='Версия текста',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_contract_texts',
        verbose_name='Кто внёс',
    )

    class Meta:
        verbose_name = 'Текст договора'
        verbose_name_plural = 'Тексты договоров'
        ordering = ['-version']
        indexes = [
            models.Index(fields=['contract', 'amendment']),
        ]

    def __str__(self):
        suffix = f" (ДС {self.amendment.number})" if self.amendment else ""
        return f"Текст {self.contract.number}{suffix} v{self.version}"


class ContractEstimate(TimestampedModel):
    """Смета как приложение к Договору.
    Создаётся копированием из estimates.Estimate или вручную.
    Поддерживает версионирование при ДОП."""
    
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        AGREED = 'agreed', 'Согласована'
        SIGNED = 'signed', 'Подписана'
    
    contract = models.ForeignKey(
        Contract,
        on_delete=models.CASCADE,
        related_name='contract_estimates',
        verbose_name='Договор'
    )
    source_estimate = models.ForeignKey(
        'estimates.Estimate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contract_estimates',
        verbose_name='Исходная смета'
    )
    number = models.CharField(
        max_length=100,
        verbose_name='Номер сметы'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название сметы'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='Статус'
    )
    signed_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Дата подписания'
    )
    file = models.FileField(
        upload_to=contract_estimate_file_path,
        null=True,
        blank=True,
        verbose_name='Файл сметы (Excel/PDF)'
    )
    version_number = models.PositiveIntegerField(
        default=1,
        verbose_name='Номер версии'
    )
    parent_version = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='child_versions',
        verbose_name='Предыдущая версия'
    )
    amendment = models.ForeignKey(
        ContractAmendment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contract_estimates',
        verbose_name='ДОП-соглашение (для новой версии)'
    )
    notes = models.TextField(
        blank=True,
        verbose_name='Примечания'
    )

    class Meta:
        verbose_name = 'Смета к договору'
        verbose_name_plural = 'Сметы к договорам'
        ordering = ['-version_number', '-created_at']
        indexes = [
            models.Index(fields=['contract', 'status']),
        ]

    def __str__(self):
        return f"{self.number} v{self.version_number} — {self.name}"

    @property
    def total_materials(self) -> 'Decimal':
        from django.db.models import Sum, F
        result = self.items.aggregate(
            total=Sum(F('quantity') * F('material_unit_price'))
        )['total']
        return result or Decimal('0')

    @property
    def total_works(self) -> 'Decimal':
        from django.db.models import Sum, F
        result = self.items.aggregate(
            total=Sum(F('quantity') * F('work_unit_price'))
        )['total']
        return result or Decimal('0')

    @property
    def total_amount(self) -> 'Decimal':
        return self.total_materials + self.total_works

    @classmethod
    def create_from_estimate(cls, estimate, contract):
        """Копирование строк из estimates.Estimate в ContractEstimate."""
        from estimates.models import EstimateItem
        
        ce = cls.objects.create(
            contract=contract,
            source_estimate=estimate,
            number=estimate.number,
            name=estimate.name,
        )
        
        sections_map = {}
        for section in estimate.sections.all().order_by('sort_order'):
            ce_section = ContractEstimateSection.objects.create(
                contract_estimate=ce,
                name=section.name,
                sort_order=section.sort_order,
            )
            sections_map[section.id] = ce_section
        
        items = EstimateItem.objects.filter(estimate=estimate).select_related('section')
        new_items = []
        for item in items:
            new_items.append(ContractEstimateItem(
                contract_estimate=ce,
                section=sections_map.get(item.section_id),
                source_item=item,
                item_number=item.item_number,
                name=item.name,
                model_name=item.model_name,
                unit=item.unit,
                quantity=item.quantity,
                material_unit_price=item.material_unit_price,
                work_unit_price=item.work_unit_price,
                product=item.product,
                work_item=item.work_item,
                is_analog=item.is_analog,
                analog_reason=item.analog_reason,
                original_name=item.original_name,
                sort_order=item.sort_order,
            ))
        if new_items:
            ContractEstimateItem.objects.bulk_create(new_items)
        
        return ce

    def create_new_version(self, amendment=None):
        """Создать новую версию сметы (при ДОП)."""
        new_ce = ContractEstimate.objects.create(
            contract=self.contract,
            source_estimate=self.source_estimate,
            number=self.number,
            name=self.name,
            version_number=self.version_number + 1,
            parent_version=self,
            amendment=amendment,
        )
        
        sections_map = {}
        for section in self.sections.all().order_by('sort_order'):
            new_section = ContractEstimateSection.objects.create(
                contract_estimate=new_ce,
                name=section.name,
                sort_order=section.sort_order,
            )
            sections_map[section.id] = new_section
        
        new_items = []
        for item in self.items.select_related('section'):
            new_items.append(ContractEstimateItem(
                contract_estimate=new_ce,
                section=sections_map.get(item.section_id),
                source_item=item.source_item,
                item_number=item.item_number,
                name=item.name,
                model_name=item.model_name,
                unit=item.unit,
                quantity=item.quantity,
                material_unit_price=item.material_unit_price,
                work_unit_price=item.work_unit_price,
                product=item.product,
                work_item=item.work_item,
                is_analog=item.is_analog,
                analog_reason=item.analog_reason,
                original_name=item.original_name,
                item_type=item.item_type,
                sort_order=item.sort_order,
            ))
        if new_items:
            ContractEstimateItem.objects.bulk_create(new_items)
        
        return new_ce

    def split_by_sections(self, sections_mapping):
        """Разбить смету на несколько для разных Исполнителей.
        
        Args:
            sections_mapping: dict {contract_id: [section_id, ...]}
                Маппинг: какие разделы пойдут в смету для какого Договора.
        
        Returns:
            list[ContractEstimate]: Созданные сметы.
        """
        result = []
        for target_contract_id, section_ids in sections_mapping.items():
            target_contract = Contract.objects.get(pk=target_contract_id)
            new_ce = ContractEstimate.objects.create(
                contract=target_contract,
                source_estimate=self.source_estimate,
                number=f"{self.number}-{len(result) + 1}",
                name=f"{self.name} (часть {len(result) + 1})",
            )
            
            for section in self.sections.filter(id__in=section_ids).order_by('sort_order'):
                new_section = ContractEstimateSection.objects.create(
                    contract_estimate=new_ce,
                    name=section.name,
                    sort_order=section.sort_order,
                )
                
                items_to_copy = self.items.filter(section=section)
                new_items = []
                for item in items_to_copy:
                    new_items.append(ContractEstimateItem(
                        contract_estimate=new_ce,
                        section=new_section,
                        source_item=item.source_item,
                        item_number=item.item_number,
                        name=item.name,
                        model_name=item.model_name,
                        unit=item.unit,
                        quantity=item.quantity,
                        material_unit_price=item.material_unit_price,
                        work_unit_price=item.work_unit_price,
                        product=item.product,
                        work_item=item.work_item,
                        is_analog=item.is_analog,
                        analog_reason=item.analog_reason,
                        original_name=item.original_name,
                        item_type=item.item_type,
                        sort_order=item.sort_order,
                    ))
                if new_items:
                    ContractEstimateItem.objects.bulk_create(new_items)
            
            result.append(new_ce)
        
        return result


class ContractEstimateSection(TimestampedModel):
    """Раздел сметы к договору"""
    
    contract_estimate = models.ForeignKey(
        ContractEstimate,
        on_delete=models.CASCADE,
        related_name='sections',
        verbose_name='Смета к договору'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название раздела'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки'
    )

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = 'Раздел сметы к договору'
        verbose_name_plural = 'Разделы смет к договорам'

    def __str__(self):
        return f"{self.contract_estimate.number} — {self.name}"


class ContractEstimateItem(TimestampedModel):
    """Строка сметы к договору"""
    
    class ItemType(models.TextChoices):
        REGULAR = 'regular', 'Обычная строка'
        CONSUMABLE = 'consumable', 'Расходные материалы'
        ADDITIONAL = 'additional', 'Допработы'
    
    contract_estimate = models.ForeignKey(
        ContractEstimate,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='Смета к договору'
    )
    section = models.ForeignKey(
        ContractEstimateSection,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='Раздел'
    )
    source_item = models.ForeignKey(
        'estimates.EstimateItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contract_items',
        verbose_name='Исходная строка сметы'
    )
    item_number = models.PositiveIntegerField(
        default=0,
        verbose_name='Номер по порядку'
    )
    name = models.CharField(
        max_length=500,
        verbose_name='Наименование'
    )
    model_name = models.CharField(
        max_length=300,
        blank=True,
        verbose_name='Модель / артикул'
    )
    unit = models.CharField(
        max_length=50,
        default='шт',
        verbose_name='Единица измерения'
    )
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=0,
        verbose_name='Количество'
    )
    material_unit_price = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        verbose_name='Цена материала за ед.'
    )
    work_unit_price = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        verbose_name='Цена работы за ед.'
    )
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contract_estimate_items',
        verbose_name='Товар из каталога'
    )
    work_item = models.ForeignKey(
        'pricelists.WorkItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contract_estimate_items',
        verbose_name='Работа из прайс-листа'
    )
    is_analog = models.BooleanField(
        default=False,
        verbose_name='Применён аналог'
    )
    analog_reason = models.TextField(
        blank=True,
        verbose_name='Обоснование аналога'
    )
    original_name = models.CharField(
        max_length=500,
        blank=True,
        verbose_name='Оригинальное наименование'
    )
    item_type = models.CharField(
        max_length=20,
        choices=ItemType.choices,
        default=ItemType.REGULAR,
        verbose_name='Тип строки'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки'
    )

    class Meta:
        ordering = ['section__sort_order', 'sort_order', 'item_number']
        verbose_name = 'Строка сметы к договору'
        verbose_name_plural = 'Строки смет к договорам'
        indexes = [
            models.Index(fields=['contract_estimate', 'section']),
            models.Index(fields=['product']),
            models.Index(fields=['item_type']),
        ]

    def __str__(self):
        return f"#{self.item_number} {self.name[:80]}"

    @property
    def material_total(self) -> 'Decimal':
        return (self.quantity * self.material_unit_price).quantize(Decimal('0.01'))

    @property
    def work_total(self) -> 'Decimal':
        return (self.quantity * self.work_unit_price).quantize(Decimal('0.01'))

    @property
    def line_total(self) -> 'Decimal':
        return self.material_total + self.work_total


class EstimatePurchaseLink(TimestampedModel):
    """Связь строки сметы к договору с позицией из счёта на оплату.
    Обеспечивает контроль закупок по смете — отслеживает аналоги,
    превышения цен и количества."""
    
    class MatchType(models.TextChoices):
        EXACT = 'exact', 'Точное совпадение'
        ANALOG = 'analog', 'Аналог'
        SUBSTITUTE = 'substitute', 'Замена'
    
    contract_estimate_item = models.ForeignKey(
        ContractEstimateItem,
        on_delete=models.CASCADE,
        related_name='purchase_links',
        verbose_name='Строка сметы',
    )
    invoice_item = models.ForeignKey(
        'payments.InvoiceItem',
        on_delete=models.CASCADE,
        related_name='estimate_links',
        verbose_name='Позиция счёта',
    )
    quantity_matched = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        verbose_name='Сопоставленное количество',
    )
    match_type = models.CharField(
        max_length=20,
        choices=MatchType.choices,
        default=MatchType.EXACT,
        verbose_name='Тип сопоставления',
    )
    match_reason = models.TextField(
        blank=True,
        verbose_name='Обоснование (для аналога/замены)',
    )
    price_exceeds = models.BooleanField(
        default=False,
        verbose_name='Цена закупки превышает сметную',
    )
    quantity_exceeds = models.BooleanField(
        default=False,
        verbose_name='Количество превышает сметное',
    )

    class Meta:
        verbose_name = 'Сопоставление закупки со сметой'
        verbose_name_plural = 'Сопоставления закупок со сметами'
        indexes = [
            models.Index(fields=['contract_estimate_item']),
            models.Index(fields=['invoice_item']),
        ]

    def __str__(self):
        return f"{self.contract_estimate_item.name} ← {self.invoice_item.raw_name}"

    def save(self, *args, **kwargs):
        self._check_exceeds()
        super().save(*args, **kwargs)

    def _check_exceeds(self):
        """Автоматически устанавливает флаги превышений."""
        cei = self.contract_estimate_item
        ii = self.invoice_item
        
        if ii.price_per_unit > cei.material_unit_price and cei.material_unit_price > 0:
            self.price_exceeds = True
        
        already_matched = EstimatePurchaseLink.objects.filter(
            contract_estimate_item=cei,
        ).exclude(pk=self.pk).aggregate(
            total=models.Sum('quantity_matched'),
        )['total'] or Decimal('0')
        
        if (already_matched + self.quantity_matched) > cei.quantity:
            self.quantity_exceeds = True
