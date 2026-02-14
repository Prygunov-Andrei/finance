from django.conf import settings
from django.db import models
from core.models import TimestampedModel
from banking.encryption import EncryptedCharField, EncryptedTextField


# =============================================================================
# BankConnection — подключение к банку для юрлица
# =============================================================================

class BankConnection(TimestampedModel):
    """Подключение к банковскому API для конкретного юридического лица."""

    class Provider(models.TextChoices):
        TOCHKA = 'tochka', 'Банк Точка'

    class PaymentMode(models.TextChoices):
        FOR_SIGN = 'for_sign', 'Черновик (подпись через банк)'
        AUTO_SIGN = 'auto_sign', 'Автоподпись через API'

    legal_entity = models.ForeignKey(
        'accounting.LegalEntity',
        on_delete=models.CASCADE,
        related_name='bank_connections',
        verbose_name='Юридическое лицо',
    )
    provider = models.CharField(
        max_length=30,
        choices=Provider.choices,
        default=Provider.TOCHKA,
        verbose_name='Банк-провайдер',
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название подключения',
        help_text='Например: "Точка — основной счёт ООО Август"',
    )

    # --- Зашифрованные credentials ---
    client_id = EncryptedCharField(
        verbose_name='Client ID',
    )
    client_secret = EncryptedCharField(
        verbose_name='Client Secret',
    )

    # --- Токены (зашифрованы) ---
    access_token = EncryptedTextField(
        blank=True,
        default='',
        verbose_name='Access Token',
    )
    refresh_token = EncryptedTextField(
        blank=True,
        default='',
        verbose_name='Refresh Token',
    )
    token_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Срок действия access token',
    )

    # --- Идентификатор клиента в банке ---
    customer_code = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Customer Code',
        help_text='Уникальный идентификатор клиента в банке (customerCode)',
    )

    # --- Режим платежей ---
    payment_mode = models.CharField(
        max_length=20,
        choices=PaymentMode.choices,
        default=PaymentMode.FOR_SIGN,
        verbose_name='Режим платежей',
    )

    is_active = models.BooleanField(
        default=True,
        verbose_name='Активно',
    )
    last_sync_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Последняя синхронизация',
    )

    class Meta:
        verbose_name = 'Банковское подключение'
        verbose_name_plural = 'Банковские подключения'
        ordering = ['legal_entity', 'name']

    def __str__(self):
        return f'{self.name} ({self.get_provider_display()})'


# =============================================================================
# BankAccount — привязка внутреннего Account к банковскому подключению
# =============================================================================

class BankAccount(TimestampedModel):
    """Привязка внутреннего счёта к банковскому API."""

    account = models.OneToOneField(
        'accounting.Account',
        on_delete=models.CASCADE,
        related_name='bank_account',
        verbose_name='Внутренний счёт',
    )
    bank_connection = models.ForeignKey(
        BankConnection,
        on_delete=models.CASCADE,
        related_name='bank_accounts',
        verbose_name='Банковское подключение',
    )
    external_account_id = models.CharField(
        max_length=100,
        verbose_name='ID счёта в банке',
        help_text='accountId из API банка',
    )
    last_statement_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Дата последней выписки',
    )
    sync_enabled = models.BooleanField(
        default=True,
        verbose_name='Синхронизация включена',
    )

    class Meta:
        verbose_name = 'Банковский счёт (привязка)'
        verbose_name_plural = 'Банковские счета (привязки)'
        ordering = ['bank_connection', 'account']

    def __str__(self):
        return f'{self.account} → {self.bank_connection}'


# =============================================================================
# BankTransaction — транзакция из банковской выписки
# =============================================================================

class BankTransaction(TimestampedModel):
    """Транзакция из банковской выписки."""

    class TransactionType(models.TextChoices):
        INCOMING = 'incoming', 'Входящий'
        OUTGOING = 'outgoing', 'Исходящий'

    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.CASCADE,
        related_name='transactions',
        verbose_name='Банковский счёт',
    )
    external_id = models.CharField(
        max_length=100,
        unique=True,
        verbose_name='ID платежа в банке',
        help_text='paymentId из API банка',
    )
    transaction_type = models.CharField(
        max_length=20,
        choices=TransactionType.choices,
        verbose_name='Тип транзакции',
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Сумма',
    )
    date = models.DateField(
        verbose_name='Дата операции',
    )
    purpose = models.TextField(
        blank=True,
        verbose_name='Назначение платежа',
    )

    # --- Реквизиты контрагента ---
    counterparty_name = models.CharField(max_length=255, blank=True, verbose_name='Наименование контрагента')
    counterparty_inn = models.CharField(max_length=12, blank=True, verbose_name='ИНН контрагента')
    counterparty_kpp = models.CharField(max_length=9, blank=True, verbose_name='КПП контрагента')
    counterparty_account = models.CharField(max_length=20, blank=True, verbose_name='Счёт контрагента')
    counterparty_bank_name = models.CharField(max_length=255, blank=True, verbose_name='Банк контрагента')
    counterparty_bik = models.CharField(max_length=9, blank=True, verbose_name='БИК банка контрагента')
    counterparty_corr_account = models.CharField(max_length=20, blank=True, verbose_name='Корр. счёт банка контрагента')

    document_number = models.CharField(
        max_length=50,
        blank=True,
        verbose_name='Номер документа',
    )

    # --- Привязка к внутреннему платежу ---
    payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bank_transactions',
        verbose_name='Внутренний платёж (LEGACY)',
    )
    invoice = models.ForeignKey(
        'payments.Invoice',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='matched_bank_transactions',
        verbose_name='Счёт на оплату',
    )
    reconciled = models.BooleanField(
        default=False,
        verbose_name='Сверено',
    )

    # --- Сырые данные ---
    raw_data = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='Полный ответ банка',
    )

    class Meta:
        verbose_name = 'Банковская транзакция'
        verbose_name_plural = 'Банковские транзакции'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['date']),
            models.Index(fields=['bank_account', 'date']),
            models.Index(fields=['counterparty_inn']),
            models.Index(fields=['reconciled']),
        ]

    def __str__(self):
        return f'{self.get_transaction_type_display()} {self.amount} от {self.date}'


# =============================================================================
# BankPaymentOrder — исходящее платёжное поручение
# =============================================================================

class BankPaymentOrder(TimestampedModel):
    """Исходящее платёжное поручение, отправляемое через банковский API."""

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        PENDING_APPROVAL = 'pending_approval', 'На согласовании'
        APPROVED = 'approved', 'Одобрено'
        SENT_TO_BANK = 'sent_to_bank', 'Отправлено в банк'
        PENDING_SIGN = 'pending_sign', 'Ожидает подписи'
        EXECUTED = 'executed', 'Исполнено'
        REJECTED = 'rejected', 'Отклонено'
        FAILED = 'failed', 'Ошибка'

    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.PROTECT,
        related_name='payment_orders',
        verbose_name='Банковский счёт списания',
    )
    payment_registry = models.OneToOneField(
        'payments.PaymentRegistry',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bank_payment_order',
        verbose_name='Заявка из реестра (LEGACY)',
    )
    # Связь с Invoice реализована через Invoice.bank_payment_order (OneToOneField)
    # Для доступа: order.invoice_link (через related_name)

    # --- Реквизиты получателя ---
    recipient_name = models.CharField(max_length=255, verbose_name='Наименование получателя')
    recipient_inn = models.CharField(max_length=12, verbose_name='ИНН получателя')
    recipient_kpp = models.CharField(max_length=9, blank=True, verbose_name='КПП получателя')
    recipient_account = models.CharField(max_length=20, verbose_name='Расчётный счёт получателя')
    recipient_bank_name = models.CharField(max_length=255, verbose_name='Банк получателя')
    recipient_bik = models.CharField(max_length=9, verbose_name='БИК банка получателя')
    recipient_corr_account = models.CharField(max_length=20, blank=True, verbose_name='Корр. счёт банка получателя')

    # --- Суммы и назначение ---
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Сумма',
    )
    purpose = models.TextField(
        verbose_name='Назначение платежа',
    )
    vat_info = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Информация о НДС',
        help_text='Например: "В т.ч. НДС 20% — 1000.00 руб." или "Без НДС"',
    )

    # --- Даты ---
    payment_date = models.DateField(
        verbose_name='Запланированная дата оплаты',
        help_text='Может переноситься многократно до отправки в банк',
    )
    original_payment_date = models.DateField(
        verbose_name='Первоначальная дата оплаты',
        help_text='Устанавливается при создании и не меняется',
    )

    # --- Статус ---
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='Статус',
    )

    # --- Внешние идентификаторы ---
    external_request_id = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='ID запроса в банке',
    )
    external_payment_id = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='ID платежа в банке',
    )

    # --- Участники ---
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_bank_orders',
        verbose_name='Создано пользователем',
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_bank_orders',
        verbose_name='Одобрено пользователем',
    )
    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Дата одобрения',
    )
    sent_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Дата отправки в банк',
    )
    executed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Дата исполнения',
    )

    # --- Ошибки и сырые данные ---
    error_message = models.TextField(
        blank=True,
        verbose_name='Сообщение об ошибке',
    )
    raw_response = models.JSONField(
        null=True,
        blank=True,
        verbose_name='Полный ответ банка',
    )

    class Meta:
        verbose_name = 'Платёжное поручение'
        verbose_name_plural = 'Платёжные поручения'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['payment_date']),
            models.Index(fields=['status', 'payment_date']),
        ]

    def __str__(self):
        return f'ПП #{self.pk} — {self.amount} на {self.payment_date} ({self.get_status_display()})'

    def save(self, *args, **kwargs):
        # При первом создании фиксируем original_payment_date
        if not self.pk and not self.original_payment_date:
            self.original_payment_date = self.payment_date
        super().save(*args, **kwargs)

    @property
    def reschedule_count(self) -> int:
        """Количество переносов даты оплаты."""
        return self.events.filter(event_type=BankPaymentOrderEvent.EventType.RESCHEDULED).count()

    @property
    def can_reschedule(self) -> bool:
        """Можно ли перенести дату (только в статусе approved)."""
        return self.status == self.Status.APPROVED


# =============================================================================
# BankPaymentOrderEvent — аудит-лог действий с платёжным поручением
# =============================================================================

class BankPaymentOrderEvent(TimestampedModel):
    """Аудит-лог всех действий с платёжным поручением."""

    class EventType(models.TextChoices):
        CREATED = 'created', 'Создано'
        SUBMITTED = 'submitted', 'Отправлено на согласование'
        APPROVED = 'approved', 'Одобрено'
        REJECTED = 'rejected', 'Отклонено'
        RESCHEDULED = 'rescheduled', 'Перенос даты оплаты'
        SENT_TO_BANK = 'sent_to_bank', 'Отправлено в банк'
        EXECUTED = 'executed', 'Исполнено'
        FAILED = 'failed', 'Ошибка'
        COMMENT = 'comment', 'Комментарий'

    order = models.ForeignKey(
        BankPaymentOrder,
        on_delete=models.CASCADE,
        related_name='events',
        verbose_name='Платёжное поручение',
    )
    event_type = models.CharField(
        max_length=30,
        choices=EventType.choices,
        verbose_name='Тип события',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bank_order_events',
        verbose_name='Пользователь',
    )
    old_value = models.JSONField(
        null=True,
        blank=True,
        verbose_name='Предыдущее значение',
        help_text='Например: {"payment_date": "2026-03-01", "status": "approved"}',
    )
    new_value = models.JSONField(
        null=True,
        blank=True,
        verbose_name='Новое значение',
        help_text='Например: {"payment_date": "2026-03-15"}',
    )
    comment = models.TextField(
        blank=True,
        verbose_name='Комментарий',
        help_text='Причина переноса, комментарий к решению и т.д.',
    )

    class Meta:
        verbose_name = 'Событие платёжного поручения'
        verbose_name_plural = 'События платёжных поручений'
        ordering = ['created_at']

    def __str__(self):
        return f'{self.get_event_type_display()} — ПП #{self.order_id}'
