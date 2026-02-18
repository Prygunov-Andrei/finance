from decimal import Decimal

from django.db import models
from django.db.models import Sum
from django.core.exceptions import ValidationError
from core.models import TimestampedModel
from django.conf import settings


def payment_scan_path(instance, filename):
    return f'payments/{instance.payment_date.year}/{instance.payment_date.month}/{filename}'


def invoice_scan_path(instance, filename):
    """LEGACY: используется в старых миграциях PaymentRegistry."""
    return f'invoices/{filename}'


def invoice_file_path(instance, filename):
    year = instance.invoice_date.year if instance.invoice_date else 'unknown'
    month = instance.invoice_date.month if instance.invoice_date else '00'
    return f'invoices/{year}/{month}/{filename}'


# =============================================================================
# ExpenseCategory — Внутренний план счетов
# =============================================================================

class ExpenseCategory(TimestampedModel):
    """
    Внутренний план счетов.

    Объединяет категории расходов/доходов, системные счета (Прибыль,
    Оборотные средства, НДС), виртуальные счета объектов и субсчета
    по договорам. Иерархическая структура через parent.
    """

    class AccountType(models.TextChoices):
        EXPENSE = 'expense', 'Расходная категория'
        INCOME = 'income', 'Доходная категория'
        SYSTEM = 'system', 'Системный счёт'
        OBJECT = 'object', 'Счёт объекта'
        CONTRACT = 'contract', 'Субсчёт договора'

    name = models.CharField(
        max_length=255,
        verbose_name='Название'
    )
    code = models.CharField(
        max_length=100,
        unique=True,
        verbose_name='Код счёта',
        help_text='Уникальный код (например: salary, rent, profit, obj_123)'
    )
    account_type = models.CharField(
        max_length=20,
        choices=AccountType.choices,
        default=AccountType.EXPENSE,
        verbose_name='Тип счёта',
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        related_name='children',
        null=True,
        blank=True,
        verbose_name='Родительский счёт',
        help_text='Оставьте пустым для счёта верхнего уровня'
    )
    object = models.OneToOneField(
        'objects.Object',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='internal_account',
        verbose_name='Объект',
        help_text='Заполняется автоматически для типа OBJECT',
    )
    contract = models.OneToOneField(
        'contracts.Contract',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='internal_account',
        verbose_name='Договор',
        help_text='Заполняется автоматически для типа CONTRACT',
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активен',
        help_text='Неактивные счета не отображаются в списках'
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
        verbose_name = 'Внутренний план счетов'
        verbose_name_plural = 'Внутренний план счетов'
        ordering = ['sort_order', 'name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['parent', 'is_active']),
            models.Index(fields=['account_type']),
        ]

    def __str__(self) -> str:
        if self.parent:
            return f"{self.parent.name} → {self.name}"
        return self.name

    def clean(self):
        if self.parent:
            parent = self.parent
            while parent:
                if parent.id == self.id:
                    raise ValidationError(
                        'Нельзя создать циклическую ссылку на родительский счёт'
                    )
                parent = parent.parent

    def get_full_path(self) -> str:
        if self.parent:
            return f"{self.parent.get_full_path()} → {self.name}"
        return self.name

    def get_balance(self) -> Decimal:
        """Баланс = сумма входящих проводок - сумма исходящих проводок."""
        credit = (
            self.credit_entries.aggregate(total=Sum('amount'))['total']
            or Decimal('0')
        )
        debit = (
            self.debit_entries.aggregate(total=Sum('amount'))['total']
            or Decimal('0')
        )
        return credit - debit


# =============================================================================
# Payment — фактический платёж (LEGACY — будет удалён на Этапе 10)
# =============================================================================

class Payment(TimestampedModel):
    """Фактический платёж (по договору или операционный) — LEGACY"""

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
        null=True,
        blank=True,
    )
    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.SET_NULL,
        related_name='payments',
        verbose_name='Договор',
        null=True,
        blank=True,
        help_text='Оставьте пустым для операционных расходов/доходов',
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='payments',
        verbose_name='Категория',
        help_text='Категория платежа (например: Зарплата, Аренда)',
    )
    legal_entity = models.ForeignKey(
        'accounting.LegalEntity',
        on_delete=models.PROTECT,
        related_name='payments',
        verbose_name='Юридическое лицо',
        null=True,
        blank=True,
    )
    payment_type = models.CharField(
        max_length=20,
        choices=PaymentType.choices,
        verbose_name='Тип платежа',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name='Статус',
    )
    payment_date = models.DateField(verbose_name='Дата платежа')
    amount = models.DecimalField(
        max_digits=14, decimal_places=2, verbose_name='Сумма',
    )
    amount_gross = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
        verbose_name='Сумма с НДС',
    )
    amount_net = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
        verbose_name='Сумма без НДС',
    )
    vat_amount = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
        verbose_name='Сумма НДС',
    )
    description = models.TextField(blank=True, verbose_name='Назначение платежа')
    scan_file = models.FileField(
        upload_to=payment_scan_path,
        verbose_name='Документ (счёт/акт)',
        help_text='PDF для расходов, любой формат для доходов',
    )
    import_batch_id = models.CharField(
        max_length=100, blank=True, db_index=True,
        verbose_name='Идентификатор импорта',
    )
    payment_registry = models.OneToOneField(
        'PaymentRegistry',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='payment_fact',
        verbose_name='Связанная заявка',
    )
    is_internal_transfer = models.BooleanField(
        default=False,
        verbose_name='Внутренний перевод',
    )
    internal_transfer_group = models.CharField(
        max_length=100, blank=True, null=True, db_index=True,
        verbose_name='Группа внутреннего перевода',
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
        if self.category and self.category.requires_contract and not self.contract:
            raise ValidationError({
                'contract': f'Категория "{self.category.name}" требует указания договора'
            })
        if self.amount and not self.amount_gross:
            self.amount_gross = self.amount
        if self.account and self.legal_entity and self.account.legal_entity != self.legal_entity:
            raise ValidationError({'account': 'Счет должен принадлежать выбранному юрлицу'})
        if self.scan_file and self.payment_type == self.PaymentType.EXPENSE:
            filename = self.scan_file.name.lower()
            if not filename.endswith('.pdf'):
                raise ValidationError({
                    'scan_file': 'Для расходных платежей допускается только формат PDF'
                })

    def save(self, *args, **kwargs):
        self.full_clean()
        if self.account and not self.legal_entity:
            self.legal_entity = self.account.legal_entity
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        payment_type_label = self.get_payment_type_display()
        entity = self.contract.number if self.contract else self.category.name
        return f"{payment_type_label} {self.amount} от {self.payment_date} ({entity})"


# =============================================================================
# PaymentRegistry — LEGACY (будет удалён на Этапе 10)
# =============================================================================

class PaymentRegistry(TimestampedModel):
    """Реестр планируемых платежей — LEGACY"""

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
        null=True, blank=True,
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='payment_requests',
        verbose_name='Категория',
        null=True, blank=True,
    )
    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.CASCADE,
        related_name='planned_payments',
        verbose_name='Договор',
        null=True, blank=True,
    )
    act = models.ForeignKey(
        'contracts.Act',
        on_delete=models.SET_NULL,
        related_name='payment_requests',
        verbose_name='Основание (Акт)',
        null=True, blank=True,
    )
    planned_date = models.DateField(verbose_name='Плановая дата')
    amount = models.DecimalField(
        max_digits=14, decimal_places=2, verbose_name='Сумма',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PLANNED,
        verbose_name='Статус',
    )
    initiator = models.CharField(
        max_length=255, blank=True, verbose_name='Инициатор платежа',
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='approved_payments',
        verbose_name='Кем одобрено',
    )
    approved_at = models.DateTimeField(null=True, blank=True, verbose_name='Дата одобрения')
    comment = models.TextField(blank=True, verbose_name='Комментарий')
    invoice_file = models.FileField(
        upload_to='invoices/%Y/%m/',
        blank=True, null=True,
        verbose_name='Скан счета на оплату',
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


# =============================================================================
# PaymentItem — LEGACY (будет удалён на Этапе 10)
# =============================================================================

class PaymentItem(TimestampedModel):
    """Позиция в платёжном документе — LEGACY"""

    payment = models.ForeignKey(
        'Payment',
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='Платёж',
    )
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='payment_items',
        verbose_name='Товар из каталога',
    )
    raw_name = models.CharField(max_length=500, verbose_name='Исходное название из счёта')
    quantity = models.DecimalField(max_digits=14, decimal_places=3, verbose_name='Количество')
    unit = models.CharField(max_length=20, verbose_name='Единица измерения')
    price_per_unit = models.DecimalField(max_digits=14, decimal_places=2, verbose_name='Цена за единицу')
    amount = models.DecimalField(max_digits=14, decimal_places=2, verbose_name='Сумма')
    vat_amount = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
        verbose_name='НДС по позиции',
    )

    class Meta:
        verbose_name = 'Позиция платежа'
        verbose_name_plural = 'Позиции платежей'
        ordering = ['id']

    def __str__(self):
        return f"{self.raw_name} x{self.quantity}"

    def save(self, *args, **kwargs):
        if not self.amount:
            self.amount = self.quantity * self.price_per_unit
        super().save(*args, **kwargs)


# =============================================================================
# Invoice — единый счёт на оплату (НОВОЕ — центральная сущность для расходов)
# =============================================================================

class Invoice(TimestampedModel):
    """
    Единый Счёт на оплату — центральная сущность для всех расходов.

    Заменяет и объединяет функционал Payment + PaymentRegistry.
    Проходит workflow: RECOGNITION → REVIEW → IN_REGISTRY → APPROVED → SENDING → PAID.
    """

    class Source(models.TextChoices):
        BITRIX = 'bitrix', 'Из Битрикс24'
        MANUAL = 'manual', 'Ручной ввод'
        RECURRING = 'recurring', 'Периодический'

    class Status(models.TextChoices):
        RECOGNITION = 'recognition', 'Распознаётся'
        REVIEW = 'review', 'На проверке'
        IN_REGISTRY = 'in_registry', 'В реестре'
        APPROVED = 'approved', 'Одобрен'
        SENDING = 'sending', 'Отправляется в банк'
        PAID = 'paid', 'Оплачен'
        CANCELLED = 'cancelled', 'Отменён'

    class InvoiceType(models.TextChoices):
        SUPPLIER = 'supplier', 'От Поставщика'
        ACT_BASED = 'act_based', 'По Акту выполненных работ'
        HOUSEHOLD = 'household', 'Хозяйственная деятельность'
        WAREHOUSE = 'warehouse', 'Закупка на склад'
        INTERNAL_TRANSFER = 'internal_transfer', 'Внутренний перевод'

    # --- Тип счёта ---
    invoice_type = models.CharField(
        max_length=20,
        choices=InvoiceType.choices,
        default=InvoiceType.SUPPLIER,
        verbose_name='Тип счёта',
    )

    # --- Источник ---
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.MANUAL,
        verbose_name='Источник',
    )
    supply_request = models.ForeignKey(
        'supply.SupplyRequest',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='invoices',
        verbose_name='Запрос на снабжение',
    )
    recurring_payment = models.ForeignKey(
        'RecurringPayment',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='invoices',
        verbose_name='Периодический платёж',
    )

    # --- Файл счёта ---
    invoice_file = models.FileField(
        upload_to=invoice_file_path,
        blank=True, null=True,
        verbose_name='PDF счёта',
    )
    invoice_number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Номер счёта',
    )
    invoice_date = models.DateField(
        null=True, blank=True,
        verbose_name='Дата счёта',
    )
    due_date = models.DateField(
        null=True, blank=True,
        verbose_name='Срок оплаты',
    )

    # --- Контрагент ---
    counterparty = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='invoices',
        verbose_name='Контрагент (поставщик)',
    )

    # --- Привязки ---
    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='invoices',
        verbose_name='Объект',
    )
    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='invoices',
        verbose_name='Договор',
    )
    act = models.ForeignKey(
        'contracts.Act',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='invoices',
        verbose_name='Акт выполненных работ',
        help_text='Для типа ACT_BASED',
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='invoices',
        verbose_name='Категория / счёт плана',
    )
    target_internal_account = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='incoming_transfers',
        verbose_name='Целевой счёт (для внутренних переводов)',
    )
    account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='invoices',
        verbose_name='Счёт списания',
    )
    legal_entity = models.ForeignKey(
        'accounting.LegalEntity',
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='invoices',
        verbose_name='Юридическое лицо',
    )

    # --- Долг ---
    is_debt = models.BooleanField(
        default=False,
        verbose_name='Долговой счёт',
        help_text='Отметить, если оплата будет отложена',
    )
    skip_recognition = models.BooleanField(
        default=False,
        verbose_name='Пропустить распознавание',
        help_text='Не выполнять LLM-распознавание при загрузке',
    )

    # --- Суммы ---
    amount_gross = models.DecimalField(
        max_digits=14, decimal_places=2,
        null=True, blank=True,
        verbose_name='Сумма с НДС',
    )
    amount_net = models.DecimalField(
        max_digits=14, decimal_places=2,
        null=True, blank=True,
        verbose_name='Сумма без НДС',
    )
    vat_amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        null=True, blank=True,
        verbose_name='Сумма НДС',
    )

    # --- Статус ---
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.RECOGNITION,
        verbose_name='Статус',
    )

    # --- Участники ---
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_invoices',
        verbose_name='Создано',
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='reviewed_invoices',
        verbose_name='Проверено (оператор)',
    )
    reviewed_at = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Дата проверки',
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='approved_invoices',
        verbose_name='Одобрено (директор)',
    )
    approved_at = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Дата одобрения',
    )
    paid_at = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Дата оплаты',
    )

    # --- Платёжное поручение ---
    bank_payment_order = models.OneToOneField(
        'banking.BankPaymentOrder',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='invoice',
        verbose_name='Платёжное поручение',
    )

    # --- Мета ---
    description = models.TextField(
        blank=True,
        verbose_name='Описание / назначение платежа',
    )
    comment = models.TextField(
        blank=True,
        verbose_name='Комментарий директора',
    )

    # --- LLM ---
    parsed_document = models.ForeignKey(
        'llm_services.ParsedDocument',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='invoices',
        verbose_name='Распознанный документ (LLM)',
    )
    recognition_confidence = models.FloatField(
        null=True, blank=True,
        verbose_name='Уверенность распознавания',
    )

    class Meta:
        verbose_name = 'Счёт на оплату'
        verbose_name_plural = 'Счета на оплату'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['source']),
            models.Index(fields=['due_date']),
            models.Index(fields=['status', 'due_date']),
            models.Index(fields=['object', 'status']),
            models.Index(fields=['counterparty', 'status']),
            models.Index(fields=['invoice_type']),
            models.Index(fields=['is_debt']),
        ]

    def __str__(self) -> str:
        number = self.invoice_number or f'#{self.pk}'
        amount = self.amount_gross or '—'
        return f'Счёт {number} на {amount} ({self.get_status_display()})'

    @property
    def is_overdue(self) -> bool:
        """Просрочен ли срок оплаты?"""
        from django.utils import timezone
        if not self.due_date:
            return False
        if self.status in (self.Status.PAID, self.Status.CANCELLED):
            return False
        return self.due_date < timezone.now().date()


# =============================================================================
# InvoiceItem — позиция счёта (заменяет PaymentItem)
# =============================================================================

class InvoiceItem(TimestampedModel):
    """Позиция счёта (товар/услуга из документа)."""

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='Счёт',
    )
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='invoice_items',
        verbose_name='Товар из каталога',
    )
    raw_name = models.CharField(
        max_length=500,
        verbose_name='Исходное название из счёта',
    )
    quantity = models.DecimalField(
        max_digits=14, decimal_places=3,
        verbose_name='Количество',
    )
    unit = models.CharField(
        max_length=50,
        blank=True,
        verbose_name='Единица измерения',
    )
    price_per_unit = models.DecimalField(
        max_digits=14, decimal_places=2,
        verbose_name='Цена за единицу',
    )
    amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        verbose_name='Сумма',
    )
    vat_amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        null=True, blank=True,
        verbose_name='НДС по позиции',
    )

    class Meta:
        verbose_name = 'Позиция счёта'
        verbose_name_plural = 'Позиции счетов'
        ordering = ['id']

    def __str__(self):
        return f'{self.raw_name} x{self.quantity}'

    def save(self, *args, **kwargs):
        if not self.amount and self.quantity and self.price_per_unit:
            self.amount = self.quantity * self.price_per_unit
        super().save(*args, **kwargs)


# =============================================================================
# InvoiceEvent — аудит-лог действий со счётом
# =============================================================================

class InvoiceEvent(TimestampedModel):
    """Аудит-лог всех действий со счётом на оплату."""

    class EventType(models.TextChoices):
        CREATED = 'created', 'Создан'
        RECOGNIZED = 'recognized', 'Распознан (LLM)'
        REVIEWED = 'reviewed', 'Проверен оператором'
        SENT_TO_REGISTRY = 'sent_to_registry', 'Отправлен в реестр'
        APPROVED = 'approved', 'Одобрен'
        REJECTED = 'rejected', 'Отклонён'
        RESCHEDULED = 'rescheduled', 'Перенесена дата'
        SENT_TO_BANK = 'sent_to_bank', 'Отправлен в банк'
        PAID = 'paid', 'Оплачен'
        CANCELLED = 'cancelled', 'Отменён'
        COMMENT = 'comment', 'Комментарий'

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='events',
        verbose_name='Счёт',
    )
    event_type = models.CharField(
        max_length=30,
        choices=EventType.choices,
        verbose_name='Тип события',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='invoice_events',
        verbose_name='Пользователь',
    )
    old_value = models.JSONField(
        null=True, blank=True,
        verbose_name='Предыдущее значение',
    )
    new_value = models.JSONField(
        null=True, blank=True,
        verbose_name='Новое значение',
    )
    comment = models.TextField(
        blank=True,
        verbose_name='Комментарий',
    )

    class Meta:
        verbose_name = 'Событие счёта'
        verbose_name_plural = 'События счетов'
        ordering = ['created_at']

    def __str__(self):
        return f'{self.get_event_type_display()} — Счёт #{self.invoice_id}'


# =============================================================================
# RecurringPayment — периодический платёж
# =============================================================================

class RecurringPayment(TimestampedModel):
    """Периодический платёж (аренда, интернет, подписки и т.д.)."""

    class Frequency(models.TextChoices):
        MONTHLY = 'monthly', 'Ежемесячно'
        QUARTERLY = 'quarterly', 'Ежеквартально'
        YEARLY = 'yearly', 'Ежегодно'

    name = models.CharField(
        max_length=255,
        verbose_name='Название',
        help_text='Например: "Аренда офиса", "Интернет", "Лицензия 1С"',
    )
    counterparty = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.PROTECT,
        related_name='recurring_payments',
        verbose_name='Контрагент',
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='recurring_payments',
        verbose_name='Категория',
    )
    account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.PROTECT,
        related_name='recurring_payments',
        verbose_name='Счёт списания',
    )
    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='recurring_payments',
        verbose_name='Договор',
    )
    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='recurring_payments',
        verbose_name='Объект',
    )
    legal_entity = models.ForeignKey(
        'accounting.LegalEntity',
        on_delete=models.PROTECT,
        related_name='recurring_payments',
        verbose_name='Юридическое лицо',
    )

    # --- Суммы ---
    amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        verbose_name='Базовая сумма',
    )
    amount_is_fixed = models.BooleanField(
        default=True,
        verbose_name='Фиксированная сумма',
        help_text='Если нет — оператор вводит сумму для каждого счёта',
    )

    # --- Расписание ---
    frequency = models.CharField(
        max_length=20,
        choices=Frequency.choices,
        default=Frequency.MONTHLY,
        verbose_name='Периодичность',
    )
    day_of_month = models.PositiveIntegerField(
        default=1,
        verbose_name='День месяца',
        help_text='День месяца для генерации (1-28)',
    )
    start_date = models.DateField(
        verbose_name='Дата начала',
    )
    end_date = models.DateField(
        null=True, blank=True,
        verbose_name='Дата окончания',
        help_text='Пусто — бессрочный',
    )
    next_generation_date = models.DateField(
        verbose_name='Следующая дата генерации',
    )

    description = models.TextField(
        blank=True,
        verbose_name='Описание',
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активен',
    )

    class Meta:
        verbose_name = 'Периодический платёж'
        verbose_name_plural = 'Периодические платежи'
        ordering = ['name']
        indexes = [
            models.Index(fields=['is_active', 'next_generation_date']),
        ]

    def __str__(self):
        return f'{self.name} — {self.amount} ({self.get_frequency_display()})'

    def clean(self):
        if self.day_of_month and (self.day_of_month < 1 or self.day_of_month > 28):
            raise ValidationError({
                'day_of_month': 'Допустимые значения: 1-28',
            })


# =============================================================================
# IncomeRecord — поступление (доход) — упрощённая модель
# =============================================================================

class IncomeRecord(TimestampedModel):
    """Поступление (доход) — упрощённая модель без workflow согласования."""

    class IncomeType(models.TextChoices):
        CUSTOMER_ACT = 'customer_act', 'Оплата по Акту от Заказчика'
        ADVANCE = 'advance', 'Авансовый платёж'
        WARRANTY_RETURN = 'warranty_return', 'Возврат гарантийных удержаний'
        SUPPLIER_RETURN = 'supplier_return', 'Возврат от Поставщика'
        BANK_INTEREST = 'bank_interest', 'Проценты банка'
        OTHER = 'other', 'Прочие поступления'

    income_type = models.CharField(
        max_length=20,
        choices=IncomeType.choices,
        default=IncomeType.OTHER,
        verbose_name='Тип поступления',
    )
    account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.PROTECT,
        related_name='income_records',
        verbose_name='Счёт зачисления',
    )
    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='income_records',
        verbose_name='Объект',
    )
    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='income_records',
        verbose_name='Договор',
    )
    act = models.ForeignKey(
        'contracts.Act',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='income_records',
        verbose_name='Акт',
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='income_records',
        verbose_name='Счёт плана',
    )
    legal_entity = models.ForeignKey(
        'accounting.LegalEntity',
        on_delete=models.PROTECT,
        related_name='income_records',
        verbose_name='Юридическое лицо',
    )
    counterparty = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='income_records',
        verbose_name='Контрагент',
    )
    bank_transaction = models.ForeignKey(
        'banking.BankTransaction',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='income_records',
        verbose_name='Банковская транзакция',
    )
    amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        verbose_name='Сумма',
    )
    payment_date = models.DateField(
        verbose_name='Дата поступления',
    )
    is_cash = models.BooleanField(
        default=False,
        verbose_name='Наличный платёж',
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание',
    )
    scan_file = models.FileField(
        upload_to='income/%Y/%m/',
        blank=True, null=True,
        verbose_name='Скан документа',
    )

    class Meta:
        verbose_name = 'Поступление (доход)'
        verbose_name_plural = 'Поступления (доходы)'
        ordering = ['-payment_date', '-created_at']
        indexes = [
            models.Index(fields=['payment_date']),
            models.Index(fields=['account', 'payment_date']),
            models.Index(fields=['income_type']),
            models.Index(fields=['object', 'payment_date']),
        ]

    def __str__(self):
        return f'Поступление {self.amount} от {self.payment_date}'


# =============================================================================
# JournalEntry — проводка (двойная запись)
# =============================================================================

class JournalEntry(TimestampedModel):
    """
    Проводка — запись о перемещении средств между счетами
    Внутреннего плана счетов (ExpenseCategory).

    from_account (дебет): откуда списываются средства.
    to_account (кредит): куда зачисляются средства.
    """

    date = models.DateField(
        verbose_name='Дата проводки',
    )
    from_account = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='debit_entries',
        verbose_name='Со счёта (дебет)',
    )
    to_account = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='credit_entries',
        verbose_name='На счёт (кредит)',
    )
    amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        verbose_name='Сумма',
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание',
    )
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='journal_entries',
        verbose_name='Счёт на оплату',
    )
    income_record = models.ForeignKey(
        IncomeRecord,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='journal_entries',
        verbose_name='Поступление',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='journal_entries',
        verbose_name='Создал',
    )
    is_auto = models.BooleanField(
        default=False,
        verbose_name='Автоматическая проводка',
        help_text='Создана автоматически при оплате/поступлении',
    )

    class Meta:
        verbose_name = 'Проводка'
        verbose_name_plural = 'Проводки'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['date']),
            models.Index(fields=['from_account', 'date']),
            models.Index(fields=['to_account', 'date']),
        ]

    def __str__(self):
        return (
            f'{self.date}: {self.from_account.name} → '
            f'{self.to_account.name} — {self.amount}'
        )

    def clean(self):
        if self.from_account_id == self.to_account_id:
            raise ValidationError(
                'Счёт-источник и счёт-получатель не могут совпадать'
            )
