import secrets

from decimal import Decimal
from django.db import models
from django.core.files.storage import storages
from django.utils import timezone
from datetime import timedelta

from core.models import TimestampedModel


def portal_upload_path(instance, filename):
    """Путь для загруженных файлов портала."""
    return f'uploads/{instance.request.access_token[:12]}/{filename}'


def portal_result_path(instance, filename):
    """Путь для результатов (Excel-файлы)."""
    return f'results/{instance.access_token[:12]}/{filename}'


def portal_version_path(instance, filename):
    """Путь для версий Excel-файлов."""
    return f'results/{instance.request.access_token[:12]}/v{instance.version_number}/{filename}'


class ExternalUser(TimestampedModel):
    """Внешний пользователь публичного портала.

    Аутентификация через OTP (email). Без пароля.
    """

    email = models.EmailField(unique=True, verbose_name='Email')
    phone = models.CharField(max_length=20, blank=True, verbose_name='Телефон')
    company_name = models.CharField(max_length=255, blank=True, verbose_name='Компания')
    contact_name = models.CharField(max_length=255, blank=True, verbose_name='Контактное лицо')
    is_verified = models.BooleanField(default=False, verbose_name='Email подтверждён')
    session_token = models.CharField(
        max_length=128, blank=True, db_index=True,
        verbose_name='Токен сессии',
    )
    session_expires_at = models.DateTimeField(
        null=True, blank=True, verbose_name='Токен истекает',
    )
    last_login_at = models.DateTimeField(
        null=True, blank=True, verbose_name='Последний вход',
    )

    class Meta:
        verbose_name = 'Внешний пользователь'
        verbose_name_plural = 'Внешние пользователи'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.contact_name or self.email} ({self.company_name or "—"})'

    def generate_session_token(self) -> str:
        """Создать новый session token (7 дней)."""
        self.session_token = secrets.token_urlsafe(48)
        self.session_expires_at = timezone.now() + timedelta(days=7)
        self.last_login_at = timezone.now()
        self.save(update_fields=['session_token', 'session_expires_at', 'last_login_at'])
        return self.session_token

    @property
    def is_session_valid(self) -> bool:
        return (
            bool(self.session_token)
            and self.session_expires_at is not None
            and self.session_expires_at > timezone.now()
        )


class EstimateRequest(TimestampedModel):
    """Публичный запрос на расчёт сметы. Создаётся при загрузке файлов на портале."""

    class Status(models.TextChoices):
        UPLOADED = 'uploaded', 'Файлы загружены'
        PARSING = 'parsing', 'Парсинг документов'
        MATCHING = 'matching', 'Подбор товаров'
        REVIEW = 'review', 'На проверке оператором'
        RFQ_SENT = 'rfq_sent', 'Запросы поставщикам'
        READY = 'ready', 'Смета готова'
        DELIVERED = 'delivered', 'Отправлена клиенту'
        ERROR = 'error', 'Ошибка'

    # Контакт (без регистрации)
    email = models.EmailField(verbose_name='Email заказчика')
    contact_name = models.CharField(
        max_length=255, blank=True, verbose_name='Контактное лицо',
    )
    company_name = models.CharField(
        max_length=255, blank=True, verbose_name='Компания',
    )
    phone = models.CharField(max_length=50, blank=True, verbose_name='Телефон')

    # Токен доступа (вместо авторизации)
    access_token = models.CharField(
        max_length=64, unique=True, db_index=True,
        verbose_name='Токен доступа',
    )

    # Проект
    project_name = models.CharField(
        max_length=255, verbose_name='Название проекта',
    )
    project_description = models.TextField(
        blank=True, verbose_name='Описание проекта',
    )

    # Статус
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.UPLOADED,
        verbose_name='Статус',
    )
    error_message = models.TextField(
        blank=True, verbose_name='Сообщение об ошибке',
    )

    # Связь с внутренней сметой ERP (создаётся в процессе обработки)
    estimate = models.ForeignKey(
        'estimates.Estimate', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='public_requests',
        verbose_name='Внутренняя смета',
    )

    # Результат
    result_excel_file = models.FileField(
        upload_to=portal_result_path,
        storage=storages['portal'],
        null=True, blank=True,
        verbose_name='Excel-файл сметы',
    )

    # Celery task tracking
    task_id = models.CharField(max_length=255, blank=True)

    # Статистика обработки
    total_files = models.PositiveIntegerField(default=0)
    processed_files = models.PositiveIntegerField(default=0)
    total_spec_items = models.PositiveIntegerField(default=0)
    matched_exact = models.PositiveIntegerField(default=0)
    matched_analog = models.PositiveIntegerField(default=0)
    unmatched = models.PositiveIntegerField(default=0)

    # Проверка оператором
    reviewed_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reviewed_public_requests',
        verbose_name='Проверил',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # Трекинг
    notification_sent = models.BooleanField(default=False)
    downloaded_at = models.DateTimeField(
        null=True, blank=True, verbose_name='Когда скачан',
    )
    llm_cost = models.DecimalField(
        max_digits=8, decimal_places=4, default=0,
        verbose_name='Стоимость LLM-обработки ($)',
    )

    # Срок жизни ссылки
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Публичный запрос сметы'
        verbose_name_plural = 'Публичные запросы смет'

    def __str__(self):
        return f'#{self.pk} {self.project_name} ({self.email})'

    def save(self, *args, **kwargs):
        if not self.access_token:
            self.access_token = secrets.token_urlsafe(48)
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(days=30)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return self.expires_at and timezone.now() > self.expires_at

    @property
    def progress_percent(self):
        """Монотонный прогресс обработки для отображения на фронте.

        Шкала:
          uploaded:  5%
          parsing:   5-40%  (по файлам)
          matching: 40-75%  (по позициям)
          review:   80%
          ready:    100%
          delivered: 100%
        """
        if self.status == 'error':
            return 0
        if self.status in ('ready', 'delivered'):
            return 100
        if self.status == 'review':
            return 80
        if self.status == 'rfq_sent':
            return 85
        if self.status == 'parsing' and self.total_files > 0:
            file_progress = self.processed_files / self.total_files
            return int(5 + file_progress * 35)
        if self.status == 'matching' and self.total_spec_items > 0:
            matched = self.matched_exact + self.matched_analog + self.unmatched
            match_progress = matched / self.total_spec_items
            return int(40 + match_progress * 35)
        status_base = {
            'uploaded': 5, 'parsing': 5, 'matching': 40,
        }
        return status_base.get(self.status, 0)


class EstimateRequestFile(TimestampedModel):
    """Отдельный файл в составе запроса на смету."""

    class FileType(models.TextChoices):
        SPECIFICATION = 'spec', 'Спецификация'
        EQUIPMENT = 'equip', 'Ведомость оборудования'
        DRAWING = 'drawing', 'Чертёж'
        EXCEL = 'excel', 'Excel-ведомость'
        OTHER = 'other', 'Другое'

    class ParseStatus(models.TextChoices):
        PENDING = 'pending', 'Ожидает'
        PARSING = 'parsing', 'Обрабатывается'
        DONE = 'done', 'Готово'
        PARTIAL = 'partial', 'Частично обработан'
        SKIPPED = 'skipped', 'Пропущен (не спецификация)'
        ERROR = 'error', 'Ошибка'

    request = models.ForeignKey(
        EstimateRequest, on_delete=models.CASCADE, related_name='files',
    )
    file = models.FileField(
        upload_to=portal_upload_path,
        storage=storages['portal'],
    )
    original_filename = models.CharField(max_length=255)
    file_type = models.CharField(
        max_length=20, choices=FileType.choices, default=FileType.OTHER,
        verbose_name='Тип файла',
    )
    file_size = models.PositiveIntegerField(default=0)

    # Результат парсинга
    parsed_data = models.JSONField(null=True, blank=True)
    parse_status = models.CharField(
        max_length=20, choices=ParseStatus.choices, default=ParseStatus.PENDING,
        verbose_name='Статус парсинга',
    )
    parse_error = models.TextField(blank=True)
    pages_total = models.PositiveIntegerField(default=0)
    pages_processed = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Файл запроса'
        verbose_name_plural = 'Файлы запросов'

    def __str__(self):
        return self.original_filename


class EstimateRequestVersion(TimestampedModel):
    """Версия сгенерированной сметы. Позволяет отслеживать историю изменений."""

    request = models.ForeignKey(
        EstimateRequest, on_delete=models.CASCADE, related_name='versions',
    )
    version_number = models.PositiveIntegerField()
    excel_file = models.FileField(
        upload_to=portal_version_path,
        storage=storages['portal'],
    )
    generated_by = models.CharField(
        max_length=50,
        verbose_name='Кем сгенерирована',
    )
    changes_description = models.TextField(blank=True)

    class Meta:
        ordering = ['-version_number']
        unique_together = ['request', 'version_number']
        verbose_name = 'Версия сметы'
        verbose_name_plural = 'Версии смет'

    def __str__(self):
        return f'v{self.version_number} — {self.request}'


class PublicPortalConfig(TimestampedModel):
    """Глобальные настройки публичного портала. Одна запись в БД (singleton)."""

    auto_approve = models.BooleanField(
        default=False,
        verbose_name='Автоматическая отправка',
        help_text=(
            'True = сметы отправляются клиенту без проверки оператором. '
            'False = оператор проверяет перед отправкой.'
        ),
    )
    operator_emails = models.TextField(
        blank=True,
        verbose_name='Email операторов',
        help_text=(
            'Через запятую. Все получают уведомления о новых запросах, '
            'ошибках, callback-заявках.'
        ),
    )
    max_pages_per_request = models.PositiveIntegerField(
        default=100, verbose_name='Макс. страниц на запрос',
    )
    max_files_per_request = models.PositiveIntegerField(
        default=20, verbose_name='Макс. файлов на запрос',
    )
    link_expiry_days = models.PositiveIntegerField(
        default=30, verbose_name='Срок жизни ссылки (дней)',
    )
    company_phone = models.CharField(
        max_length=50, blank=True,
        verbose_name='Телефон компании (для CTA)',
    )

    class Meta:
        verbose_name = 'Настройки портала'
        verbose_name_plural = 'Настройки портала'

    def __str__(self):
        return 'Настройки портала'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @property
    def operator_email_list(self):
        """Список email операторов для send_mail."""
        return [e.strip() for e in self.operator_emails.split(',') if e.strip()]

    @classmethod
    def get(cls):
        """Получить или создать единственную запись конфигурации."""
        obj = cls.objects.first()
        if not obj:
            obj = cls.objects.create(
                operator_emails='',
                auto_approve=False,
            )
        return obj


class PublicPricingConfig(TimestampedModel):
    """Наценка для публичных смет.

    Можно задать наценку по умолчанию (category=NULL, is_default=True)
    и отдельные наценки для конкретных категорий.
    """

    category = models.ForeignKey(
        'catalog.Category', on_delete=models.CASCADE,
        null=True, blank=True, related_name='public_pricing_configs',
        verbose_name='Категория',
        help_text='NULL = наценка по умолчанию',
    )
    markup_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=30.00,
        verbose_name='Наценка (%)',
    )
    is_default = models.BooleanField(
        default=False,
        verbose_name='По умолчанию',
        help_text='Только одна запись может быть default',
    )

    class Meta:
        verbose_name = 'Настройка наценки'
        verbose_name_plural = 'Настройки наценок'
        constraints = [
            models.UniqueConstraint(
                fields=['category'],
                condition=models.Q(category__isnull=False),
                name='unique_category_pricing',
            ),
        ]

    def __str__(self):
        if self.category:
            return f'{self.category.name}: +{self.markup_percent}%'
        return f'По умолчанию: +{self.markup_percent}%'

    @classmethod
    def get_markup(cls, category=None):
        """Получить наценку для категории. Каскад: категория -> родитель -> default."""
        if category:
            try:
                return cls.objects.get(category=category).markup_percent
            except cls.DoesNotExist:
                if hasattr(category, 'parent') and category.parent:
                    return cls.get_markup(category.parent)
        try:
            return cls.objects.get(is_default=True).markup_percent
        except cls.DoesNotExist:
            return Decimal('30.00')


class CallbackRequest(TimestampedModel):
    """Заявка на обратный звонок от клиента портала."""

    class Status(models.TextChoices):
        NEW = 'new', 'Новая'
        IN_PROGRESS = 'in_progress', 'В работе'
        COMPLETED = 'completed', 'Обработана'
        CANCELLED = 'cancelled', 'Отменена'

    request = models.ForeignKey(
        EstimateRequest, on_delete=models.CASCADE,
        related_name='callbacks',
        verbose_name='Запрос на смету',
    )
    phone = models.CharField(max_length=50, verbose_name='Телефон')
    preferred_time = models.CharField(
        max_length=100, blank=True,
        verbose_name='Удобное время для звонка',
    )
    comment = models.TextField(blank=True, verbose_name='Комментарий')
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.NEW,
        verbose_name='Статус',
    )
    processed_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='processed_callbacks',
        verbose_name='Обработал',
    )
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Заявка на звонок'
        verbose_name_plural = 'Заявки на звонок'

    def __str__(self):
        return f'{self.phone} — {self.request}'
