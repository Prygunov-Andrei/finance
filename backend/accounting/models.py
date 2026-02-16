from django.db import models
from django.core.exceptions import ValidationError
from decimal import Decimal
from core.models import TimestampedModel
from django.db.models import Sum, Q

class TaxSystem(TimestampedModel):
    """Справочник систем налогообложения"""
    
    code = models.CharField(
        max_length=50,
        unique=True,
        verbose_name='Код системы',
        help_text='osn_vat_20, usn_income, etc.'
    )
    name = models.CharField(
        max_length=100,
        verbose_name='Название'
    )
    vat_rate = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Ставка НДС, %'
    )
    has_vat = models.BooleanField(
        default=False,
        verbose_name='Есть НДС'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активна'
    )

    class Meta:
        verbose_name = 'Система налогообложения'
        verbose_name_plural = 'Системы налогообложения'
        ordering = ['name']

    def __str__(self):
        return self.name


class LegalEntity(TimestampedModel):
    """Юридическое лицо компании (Мы)"""
    
    name = models.CharField(
        max_length=255,
        verbose_name='Полное наименование'
    )
    short_name = models.CharField(
        max_length=100,
        verbose_name='Краткое наименование'
    )
    inn = models.CharField(
        max_length=12,
        unique=True,
        verbose_name='ИНН'
    )
    kpp = models.CharField(
        max_length=9,
        blank=True,
        verbose_name='КПП'
    )
    ogrn = models.CharField(
        max_length=15,
        blank=True,
        verbose_name='ОГРН'
    )
    tax_system = models.ForeignKey(
        TaxSystem,
        on_delete=models.PROTECT,
        verbose_name='Система налогообложения'
    )
    director = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='directed_legal_entities',
        verbose_name='Генеральный директор (пользователь)'
    )
    director_name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='ФИО директора',
        help_text='Полное ФИО для документов (Иванов Иван Иванович)'
    )
    director_position = models.CharField(
        max_length=100,
        default='Генеральный директор',
        verbose_name='Должность директора'
    )
    legal_address = models.TextField(
        blank=True,
        verbose_name='Юридический адрес'
    )
    actual_address = models.TextField(
        blank=True,
        verbose_name='Фактический адрес'
    )
    phone = models.CharField(
        max_length=20,
        blank=True,
        verbose_name='Телефон'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активна'
    )

    class Meta:
        verbose_name = 'Юридическое лицо (Наше)'
        verbose_name_plural = 'Юридические лица (Наши)'
        ordering = ['name']

    def __str__(self):
        return self.short_name


class Account(TimestampedModel):
    """Счёт юридического лица (расчётный, касса)"""
    
    class Type(models.TextChoices):
        BANK_ACCOUNT = 'bank_account', 'Расчётный счёт'
        CASH = 'cash', 'Касса (наличные)'
        DEPOSIT = 'deposit', 'Депозит'
        CURRENCY_ACCOUNT = 'currency_account', 'Валютный счёт'

    class Currency(models.TextChoices):
        RUB = 'RUB', 'Российский рубль'
        USD = 'USD', 'Доллар США'
        EUR = 'EUR', 'Евро'

    legal_entity = models.ForeignKey(
        LegalEntity,
        on_delete=models.CASCADE,
        related_name='accounts',
        verbose_name='Юридическое лицо'
    )
    name = models.CharField(
        max_length=100,
        verbose_name='Название счёта'
    )
    number = models.CharField(
        max_length=50,
        verbose_name='Номер счёта',
        help_text='Номер расчётного счёта или условный номер кассы'
    )
    account_type = models.CharField(
        max_length=20,
        choices=Type.choices,
        default=Type.BANK_ACCOUNT,
        verbose_name='Тип счёта'
    )
    bank_name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Наименование банка'
    )
    bik = models.CharField(
        max_length=9,
        blank=True,
        verbose_name='БИК банка'
    )
    corr_account = models.CharField(
        max_length=20,
        blank=True,
        verbose_name='Корреспондентский счёт банка'
    )
    currency = models.CharField(
        max_length=3,
        choices=Currency.choices,
        default=Currency.RUB,
        verbose_name='Валюта'
    )
    initial_balance = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        verbose_name='Начальный остаток'
    )
    balance_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Дата начального остатка'
    )
    location = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Местоположение (для касс)'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активен'
    )

    class Meta:
        verbose_name = 'Счёт'
        verbose_name_plural = 'Счета'
        unique_together = ('legal_entity', 'number')
        ordering = ['legal_entity', 'name']

    def __str__(self):
        return f"{self.name} ({self.currency})"

    def get_current_balance(self) -> Decimal:
        """
        Рассчитывает текущий баланс на основе новых моделей Invoice и IncomeRecord:
        Начальный остаток + Сумма доходов (IncomeRecord) - Сумма расходов (Invoice.paid)

        Fallback: если новые модели ещё не используются, использует старые Payment.
        """
        from payments.models import Invoice, IncomeRecord

        balance = self.initial_balance

        # --- Новая система: Invoice (расходы) + IncomeRecord (доходы) ---
        invoice_filter = Q(status='paid')
        income_filter = Q()

        if self.balance_date:
            invoice_filter &= Q(paid_at__date__gte=self.balance_date)
            income_filter &= Q(payment_date__gte=self.balance_date)

        # Доходы из IncomeRecord
        income = IncomeRecord.objects.filter(
            income_filter,
            account=self,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        # Расходы из Invoice (оплаченные)
        expense = Invoice.objects.filter(
            invoice_filter,
            account=self,
        ).aggregate(total=Sum('amount_gross'))['total'] or Decimal('0')

        # --- Fallback: старая система Payment (для обратной совместимости) ---
        old_payments_filter = Q(status='paid')
        if self.balance_date:
            old_payments_filter &= Q(payment_date__gte=self.balance_date)

        old_income = self.payments.filter(
            old_payments_filter,
            payment_type='income'
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        old_expense = self.payments.filter(
            old_payments_filter,
            payment_type='expense'
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        return balance + income + old_income - expense - old_expense


class AccountBalance(models.Model):
    """Остаток на счёте на конкретную дату (Snapshot)"""

    class Source(models.TextChoices):
        INTERNAL = 'internal', 'Внутренний (ERP)'
        BANK_TOCHKA = 'bank_tochka', 'Банк (Точка)'
    
    account = models.ForeignKey(
        Account,
        on_delete=models.CASCADE,
        related_name='balances',
        verbose_name='Счёт'
    )
    balance_date = models.DateField(
        verbose_name='Дата'
    )
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.INTERNAL,
        verbose_name='Источник',
    )
    balance = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Остаток'
    )

    class Meta:
        verbose_name = 'Остаток на счёте'
        verbose_name_plural = 'Остатки на счетах'
        unique_together = ('account', 'balance_date', 'source')
        ordering = ['-balance_date']

    def __str__(self):
        return f"{self.account} на {self.balance_date}: {self.balance}"


class Counterparty(TimestampedModel):
    """Контрагент (Внешняя сторона: Заказчик или Исполнитель)"""
    
    class Type(models.TextChoices):
        CUSTOMER = 'customer', 'Заказчик'
        POTENTIAL_CUSTOMER = 'potential_customer', 'Потенциальный Заказчик'
        VENDOR = 'vendor', 'Исполнитель/Поставщик'
        BOTH = 'both', 'Заказчик и Исполнитель'
        EMPLOYEE = 'employee', 'Сотрудник'

    class VendorSubtype(models.TextChoices):
        SUPPLIER = 'supplier', 'Поставщик'
        EXECUTOR = 'executor', 'Исполнитель'
        BOTH = 'both', 'Исполнитель и Поставщик'

    class LegalForm(models.TextChoices):
        OOO = 'ooo', 'ООО'
        IP = 'ip', 'ИП'
        SELF_EMPLOYED = 'self_employed', 'Самозанятый'
        FIZ = 'fiz', 'Физ. лицо'

    name = models.CharField(
        max_length=255,
        verbose_name='Полное наименование',
        help_text='ООО "Ромашка", ИП Иванов И.И.'
    )
    short_name = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Краткое имя',
        help_text='Для удобного поиска'
    )
    type = models.CharField(
        max_length=20,
        choices=Type.choices,
        verbose_name='Тип контрагента'
    )
    vendor_subtype = models.CharField(
        max_length=20,
        choices=VendorSubtype.choices,
        blank=True,
        null=True,
        verbose_name='Подтип (для vendor)',
        help_text='Уточнение: Поставщик или Исполнитель. Заполняется только для типа "Исполнитель/Поставщик"'
    )
    legal_form = models.CharField(
        max_length=20,
        choices=LegalForm.choices,
        verbose_name='Правовая форма'
    )
    inn = models.CharField(
        max_length=12,
        unique=True,
        verbose_name='ИНН'
    )
    kpp = models.CharField(
        max_length=9,
        blank=True,
        verbose_name='КПП'
    )
    ogrn = models.CharField(
        max_length=15,
        blank=True,
        verbose_name='ОГРН / ОГРНИП'
    )
    address = models.TextField(
        blank=True,
        default='',
        verbose_name='Юридический адрес',
    )
    contact_info = models.TextField(
        blank=True,
        verbose_name='Контактная информация',
        help_text='Телефоны, email, ответственные лица'
    )
    notes = models.TextField(
        blank=True,
        default='',
        verbose_name='Заметки',
        help_text='Произвольные заметки по контрагенту'
    )

    # --- Банковские реквизиты ---
    bank_name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Наименование банка'
    )
    bank_bik = models.CharField(
        max_length=9,
        blank=True,
        verbose_name='БИК банка'
    )
    bank_corr_account = models.CharField(
        max_length=20,
        blank=True,
        verbose_name='Корреспондентский счёт банка'
    )
    bank_account = models.CharField(
        max_length=20,
        blank=True,
        verbose_name='Расчётный счёт'
    )

    is_active = models.BooleanField(
        default=True,
        verbose_name='Активен'
    )

    class Meta:
        verbose_name = 'Контрагент'
        verbose_name_plural = 'Контрагенты'
        ordering = ['name']

    def clean(self):
        """Валидация: vendor_subtype можно указывать только для type='vendor'"""
        if self.vendor_subtype and self.type != self.Type.VENDOR:
            raise ValidationError({
                'vendor_subtype': 'Подтип можно указывать только для контрагентов типа "Исполнитель/Поставщик"'
            })
        if self.type == self.Type.VENDOR and not self.vendor_subtype:
            # Не обязательно требовать заполнение, но можно предупредить
            pass

    def save(self, *args, **kwargs):
        """Переопределяем save для автоматической валидации"""
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.short_name or self.name
    
    def is_vendor(self) -> bool:
        """
        Проверяет, является ли контрагент исполнителем/поставщиком.
        
        Returns:
            True если type = 'vendor' или 'both'
        """
        return self.type in [self.Type.VENDOR, self.Type.BOTH]
    
    def is_customer(self) -> bool:
        """
        Проверяет, является ли контрагент заказчиком.
        
        Returns:
            True если type = 'customer' или 'both'
        """
        return self.type in [self.Type.CUSTOMER, self.Type.BOTH]
    
    @classmethod
    def validate_is_vendor(cls, counterparty, field_name: str = 'counterparty'):
        """
        Валидация что контрагент является исполнителем.
        
        Args:
            counterparty: Экземпляр Counterparty для проверки
            field_name: Имя поля для сообщения об ошибке
        
        Raises:
            ValidationError: Если контрагент не является исполнителем
        """
        if counterparty and not counterparty.is_vendor():
            raise ValidationError({
                field_name: 'Контрагент должен быть типа "Исполнитель/Поставщик" или "Заказчик и Исполнитель"'
            })
