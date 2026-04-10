from decimal import Decimal

from django.contrib.auth.models import User
from django.contrib.postgres.fields import ArrayField
from django.db import models, transaction
from django.utils import timezone

from core.models import TimestampedModel


# ---------------------------------------------------------------------------
# ExecutorProfile — расширенный профиль исполнителя (1:1 к Counterparty)
# ---------------------------------------------------------------------------

class ExecutorProfile(TimestampedModel):
    """Расширенный профиль исполнителя (1:1 к Counterparty)."""

    class Source(models.TextChoices):
        MANUAL = 'manual', 'Ручной ввод'
        AVITO = 'avito', 'Avito'
        TELEGRAM = 'telegram', 'Telegram'
        REFERRAL = 'referral', 'Рекомендация'

    SPECIALIZATION_CHOICES = [
        ('ventilation', 'Вентиляция'),
        ('conditioning', 'Кондиционирование'),
        ('heating', 'Отопление'),
        ('plumbing', 'Водоснабжение и канализация'),
        ('low_voltage', 'Слабые токи'),
        ('electrical', 'Электрика'),
        ('fire_safety', 'Пожарная безопасность'),
        ('automation', 'Автоматика'),
    ]

    counterparty = models.OneToOneField(
        'accounting.Counterparty',
        on_delete=models.CASCADE,
        related_name='executor_profile',
        verbose_name='Контрагент',
    )
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.MANUAL,
        verbose_name='Источник',
    )

    # --- Структурированные контакты ---
    phone = models.CharField(max_length=20, blank=True, db_index=True, verbose_name='Телефон')
    email = models.EmailField(blank=True, db_index=True, verbose_name='Email')
    telegram_username = models.CharField(max_length=100, blank=True, verbose_name='Telegram')
    whatsapp = models.CharField(max_length=20, blank=True, verbose_name='WhatsApp')
    contact_person = models.CharField(max_length=255, blank=True, verbose_name='Контактное лицо')

    # --- Навыки и специализации ---
    specializations = ArrayField(
        models.CharField(max_length=50),
        blank=True,
        default=list,
        verbose_name='Специализации',
        help_text='ventilation, conditioning, heating, plumbing, low_voltage, electrical, fire_safety, automation',
    )
    work_sections = models.ManyToManyField(
        'pricelists.WorkSection',
        blank=True,
        related_name='executor_profiles',
        verbose_name='Разделы работ',
    )

    # --- Местоположение ---
    city = models.CharField(max_length=100, blank=True, db_index=True, verbose_name='Город')
    region = models.CharField(max_length=100, blank=True, verbose_name='Регион')
    address = models.TextField(blank=True, verbose_name='Адрес')
    work_radius_km = models.PositiveIntegerField(null=True, blank=True, verbose_name='Радиус работ (км)')

    # --- Расценки и мощность ---
    hourly_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name='Ставка в час (руб)',
    )
    daily_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name='Ставка в день (руб)',
    )
    team_size = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name='Размер бригады')

    # --- Квалификация ---
    rating = models.DecimalField(
        max_digits=3, decimal_places=2, default=Decimal('0'),
        verbose_name='Рейтинг (0-5)',
    )
    experience_years = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name='Стаж (лет)')
    has_legal_entity = models.BooleanField(default=False, verbose_name='Есть юр.лицо/ИП')

    # --- Avito ---
    avito_user_id = models.CharField(max_length=100, blank=True, db_index=True, verbose_name='Avito User ID')
    avito_profile_url = models.URLField(blank=True, verbose_name='Профиль на Avito')

    # --- Статусы ---
    is_potential = models.BooleanField(default=True, verbose_name='Потенциальный исполнитель')
    is_verified = models.BooleanField(default=False, verbose_name='Проверен')
    is_available = models.BooleanField(default=True, verbose_name='Доступен для работы')

    notes = models.TextField(blank=True, verbose_name='Заметки')

    class Meta:
        verbose_name = 'Профиль исполнителя'
        verbose_name_plural = 'Профили исполнителей'
        ordering = ['-created_at']

    def __str__(self):
        return str(self.counterparty)


# ---------------------------------------------------------------------------
# AvitoConfig — singleton настроек Avito
# ---------------------------------------------------------------------------

class AvitoConfig(TimestampedModel):
    """Настройки интеграции с Avito (singleton, pk=1)."""

    # OAuth2
    client_id = models.CharField(max_length=255, blank=True, verbose_name='Client ID')
    client_secret = models.CharField(max_length=255, blank=True, verbose_name='Client Secret')
    access_token = models.TextField(blank=True, verbose_name='Access Token')
    token_expires_at = models.DateTimeField(null=True, blank=True, verbose_name='Токен истекает')
    user_id = models.CharField(max_length=100, blank=True, verbose_name='Avito User ID')

    # Авто-публикация
    auto_publish_mp = models.BooleanField(default=False, verbose_name='Авто-публикация МП на Avito')
    listing_category_id = models.IntegerField(null=True, blank=True, verbose_name='ID категории Avito')
    listing_template = models.TextField(
        blank=True,
        verbose_name='Шаблон текста объявления',
        help_text='Переменные: {object_name}, {city}, {work_types}, {man_hours}, {total_amount}',
    )

    # Сканирование
    search_enabled = models.BooleanField(default=False, verbose_name='Ежедневное сканирование включено')
    search_regions = models.JSONField(default=list, blank=True, verbose_name='Регионы поиска')

    is_active = models.BooleanField(default=False, verbose_name='Интеграция активна')

    class Meta:
        verbose_name = 'Настройки Avito'
        verbose_name_plural = 'Настройки Avito'

    def __str__(self):
        return 'Настройки Avito'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        with transaction.atomic():
            obj, _ = cls.objects.select_for_update().get_or_create(pk=1)
        return obj

    def is_token_valid(self):
        return bool(
            self.access_token
            and self.token_expires_at
            and self.token_expires_at > timezone.now()
        )


# ---------------------------------------------------------------------------
# AvitoSearchKeyword — ключевые слова для мониторинга
# ---------------------------------------------------------------------------

class AvitoSearchKeyword(TimestampedModel):
    """Ключевое слово для поиска объявлений на Avito."""

    keyword = models.CharField(max_length=255, unique=True, verbose_name='Ключевое слово')
    is_active = models.BooleanField(default=True, verbose_name='Активно')
    last_scan_at = models.DateTimeField(null=True, blank=True, verbose_name='Последнее сканирование')
    results_count = models.PositiveIntegerField(default=0, verbose_name='Найдено объявлений')

    class Meta:
        verbose_name = 'Ключевое слово Avito'
        verbose_name_plural = 'Ключевые слова Avito'
        ordering = ['keyword']

    def __str__(self):
        return self.keyword


# ---------------------------------------------------------------------------
# AvitoListing — найденные объявления (входящие)
# ---------------------------------------------------------------------------

class AvitoListing(TimestampedModel):
    """Объявление, найденное на Avito (входящий контакт)."""

    class Status(models.TextChoices):
        NEW = 'new', 'Новое'
        REVIEWED = 'reviewed', 'Просмотрено'
        CONTACTED = 'contacted', 'Контакт установлен'
        CONVERTED = 'converted', 'Конвертирован'
        REJECTED = 'rejected', 'Не подходит'

    avito_item_id = models.CharField(
        max_length=100, unique=True, db_index=True, verbose_name='Avito ID объявления',
    )
    url = models.URLField(verbose_name='Ссылка')
    title = models.CharField(max_length=500, verbose_name='Заголовок')
    description = models.TextField(blank=True, verbose_name='Описание')
    price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, verbose_name='Цена')
    city = models.CharField(max_length=100, blank=True, verbose_name='Город')
    category = models.CharField(max_length=255, blank=True, verbose_name='Категория')
    published_at = models.DateTimeField(null=True, blank=True, verbose_name='Дата публикации на Avito')

    # Продавец
    seller_name = models.CharField(max_length=255, blank=True, verbose_name='Имя продавца')
    seller_avito_id = models.CharField(max_length=100, blank=True, db_index=True, verbose_name='Avito ID продавца')

    # Связи
    keyword = models.ForeignKey(
        AvitoSearchKeyword, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='listings', verbose_name='Ключевое слово',
    )
    executor_profile = models.ForeignKey(
        ExecutorProfile, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='avito_listings', verbose_name='Профиль исполнителя',
    )

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, verbose_name='Статус')
    discovered_at = models.DateTimeField(auto_now_add=True, verbose_name='Обнаружено')
    raw_data = models.JSONField(default=dict, blank=True, verbose_name='Сырые данные')

    class Meta:
        verbose_name = 'Объявление Avito'
        verbose_name_plural = 'Объявления Avito'
        ordering = ['-discovered_at']
        indexes = [
            models.Index(fields=['status', '-discovered_at']),
        ]

    def __str__(self):
        return f'{self.title} ({self.city})'


# ---------------------------------------------------------------------------
# AvitoPublishedListing — наши объявления на Avito
# ---------------------------------------------------------------------------

class AvitoPublishedListing(TimestampedModel):
    """МП, опубликованное как объявление на Avito."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Ожидает публикации'
        PUBLISHED = 'published', 'Опубликовано'
        EXPIRED = 'expired', 'Истекло'
        DEACTIVATED = 'deactivated', 'Деактивировано'
        ERROR = 'error', 'Ошибка'

    mounting_proposal = models.ForeignKey(
        'proposals.MountingProposal', on_delete=models.CASCADE,
        related_name='avito_listings', verbose_name='МП',
    )
    avito_item_id = models.CharField(max_length=100, blank=True, db_index=True, verbose_name='Avito ID')
    avito_url = models.URLField(blank=True, verbose_name='Ссылка на Avito')
    status = models.CharField(
        max_length=20, choices=Status.choices,
        default=Status.PENDING, verbose_name='Статус',
    )
    listing_title = models.CharField(max_length=500, blank=True, verbose_name='Заголовок')
    listing_text = models.TextField(blank=True, verbose_name='Текст объявления')
    error_message = models.TextField(blank=True, verbose_name='Текст ошибки')

    # Статистика
    views_count = models.PositiveIntegerField(default=0, verbose_name='Просмотры')
    contacts_count = models.PositiveIntegerField(default=0, verbose_name='Контакты')
    favorites_count = models.PositiveIntegerField(default=0, verbose_name='В избранном')
    last_stats_sync = models.DateTimeField(null=True, blank=True, verbose_name='Статистика обновлена')

    published_at = models.DateTimeField(null=True, blank=True, verbose_name='Дата публикации')

    class Meta:
        verbose_name = 'Публикация на Avito'
        verbose_name_plural = 'Публикации на Avito'
        ordering = ['-created_at']

    def __str__(self):
        return f'Avito: {self.mounting_proposal.number}'


# ---------------------------------------------------------------------------
# ContactHistory — история контактов с исполнителем
# ---------------------------------------------------------------------------

class ContactHistory(TimestampedModel):
    """Лог всех коммуникаций с исполнителем."""

    class Channel(models.TextChoices):
        EMAIL = 'email', 'Email'
        SMS = 'sms', 'SMS'
        PHONE = 'phone', 'Телефон'
        AVITO_MSG = 'avito_msg', 'Avito Messenger'
        TELEGRAM = 'telegram', 'Telegram'
        WHATSAPP = 'whatsapp', 'WhatsApp'
        MEETING = 'meeting', 'Встреча'

    class Direction(models.TextChoices):
        IN = 'in', 'Входящее'
        OUT = 'out', 'Исходящее'

    executor_profile = models.ForeignKey(
        ExecutorProfile, on_delete=models.CASCADE,
        related_name='contact_history', verbose_name='Исполнитель',
    )
    channel = models.CharField(max_length=20, choices=Channel.choices, verbose_name='Канал')
    direction = models.CharField(max_length=10, choices=Direction.choices, verbose_name='Направление')
    subject = models.CharField(max_length=255, blank=True, verbose_name='Тема')
    body = models.TextField(blank=True, verbose_name='Содержание')

    avito_listing = models.ForeignKey(
        AvitoListing, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='contact_records', verbose_name='Объявление Avito',
    )
    campaign = models.ForeignKey(
        'Campaign', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='contact_records', verbose_name='Рассылка',
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, verbose_name='Кто создал',
    )

    class Meta:
        verbose_name = 'Запись контакта'
        verbose_name_plural = 'История контактов'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_channel_display()} → {self.executor_profile} ({self.created_at:%d.%m.%Y})'


# ---------------------------------------------------------------------------
# Campaign + CampaignRecipient — рассылки
# ---------------------------------------------------------------------------

class Campaign(TimestampedModel):
    """Email или SMS рассылка."""

    class CampaignType(models.TextChoices):
        EMAIL = 'email', 'Email-рассылка'
        SMS = 'sms', 'SMS-рассылка'

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        SCHEDULED = 'scheduled', 'Запланировано'
        SENDING = 'sending', 'Отправляется'
        COMPLETED = 'completed', 'Завершено'
        CANCELLED = 'cancelled', 'Отменено'

    name = models.CharField(max_length=255, verbose_name='Название')
    campaign_type = models.CharField(max_length=10, choices=CampaignType.choices, verbose_name='Тип')
    status = models.CharField(
        max_length=20, choices=Status.choices,
        default=Status.DRAFT, verbose_name='Статус',
    )

    # Контент
    subject = models.CharField(max_length=255, blank=True, verbose_name='Тема (для email)')
    body = models.TextField(verbose_name='Текст сообщения')

    # Вложения
    attachment_mp = models.ForeignKey(
        'proposals.MountingProposal', on_delete=models.SET_NULL,
        null=True, blank=True, verbose_name='Прикрепить МП',
    )
    attachment_estimate = models.ForeignKey(
        'estimates.MountingEstimate', on_delete=models.SET_NULL,
        null=True, blank=True, verbose_name='Прикрепить смету',
    )

    # Фильтры получателей
    filter_specializations = ArrayField(
        models.CharField(max_length=50),
        blank=True, default=list, verbose_name='Фильтр: специализации',
    )
    filter_cities = ArrayField(
        models.CharField(max_length=100),
        blank=True, default=list, verbose_name='Фильтр: города',
    )
    filter_is_potential = models.BooleanField(null=True, blank=True, verbose_name='Фильтр: потенциальные')
    filter_is_available = models.BooleanField(null=True, blank=True, verbose_name='Фильтр: доступные')

    # Расписание
    scheduled_at = models.DateTimeField(null=True, blank=True, verbose_name='Запланировано на')
    sent_at = models.DateTimeField(null=True, blank=True, verbose_name='Отправлено')

    # Счётчики
    total_recipients = models.PositiveIntegerField(default=0, verbose_name='Всего получателей')
    sent_count = models.PositiveIntegerField(default=0, verbose_name='Отправлено')
    delivered_count = models.PositiveIntegerField(default=0, verbose_name='Доставлено')
    error_count = models.PositiveIntegerField(default=0, verbose_name='Ошибок')

    created_by = models.ForeignKey(
        User, on_delete=models.PROTECT,
        related_name='created_campaigns', verbose_name='Кто создал',
    )

    class Meta:
        verbose_name = 'Рассылка'
        verbose_name_plural = 'Рассылки'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.get_campaign_type_display()})'


class CampaignRecipient(TimestampedModel):
    """Получатель рассылки."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Ожидает'
        SENT = 'sent', 'Отправлено'
        DELIVERED = 'delivered', 'Доставлено'
        FAILED = 'failed', 'Ошибка'
        UNSUBSCRIBED = 'unsubscribed', 'Отписался'

    campaign = models.ForeignKey(
        Campaign, on_delete=models.CASCADE,
        related_name='recipients', verbose_name='Рассылка',
    )
    executor_profile = models.ForeignKey(
        ExecutorProfile, on_delete=models.CASCADE, verbose_name='Исполнитель',
    )
    status = models.CharField(
        max_length=20, choices=Status.choices,
        default=Status.PENDING, verbose_name='Статус',
    )
    error_message = models.TextField(blank=True, verbose_name='Ошибка')
    sent_at = models.DateTimeField(null=True, blank=True, verbose_name='Отправлено')

    class Meta:
        verbose_name = 'Получатель рассылки'
        verbose_name_plural = 'Получатели рассылки'
        unique_together = ['campaign', 'executor_profile']


# ---------------------------------------------------------------------------
# UnisenderConfig — singleton настроек Unisender
# ---------------------------------------------------------------------------

class UnisenderConfig(TimestampedModel):
    """Настройки Unisender для email и SMS (singleton, pk=1)."""

    api_key = models.CharField(max_length=255, blank=True, verbose_name='API-ключ')
    sender_email = models.EmailField(blank=True, verbose_name='Email отправителя')
    sender_name = models.CharField(max_length=100, blank=True, verbose_name='Имя отправителя')
    sms_sender = models.CharField(
        max_length=15, blank=True, verbose_name='Имя отправителя SMS',
        help_text='До 11 символов латиницей',
    )
    is_active = models.BooleanField(default=False, verbose_name='Активен')

    class Meta:
        verbose_name = 'Настройки Unisender'
        verbose_name_plural = 'Настройки Unisender'

    def __str__(self):
        return 'Настройки Unisender'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        with transaction.atomic():
            obj, _ = cls.objects.select_for_update().get_or_create(pk=1)
        return obj


# ---------------------------------------------------------------------------
# MarketingSyncLog — логи синхронизации
# ---------------------------------------------------------------------------

class MarketingSyncLog(TimestampedModel):
    """Лог операций сканирования, публикации и рассылок."""

    class SyncType(models.TextChoices):
        AVITO_SCAN = 'avito_scan', 'Сканирование Avito'
        AVITO_PUBLISH = 'avito_publish', 'Публикация на Avito'
        AVITO_STATS = 'avito_stats', 'Статистика Avito'
        EMAIL_CAMPAIGN = 'email_campaign', 'Email-рассылка'
        SMS_CAMPAIGN = 'sms_campaign', 'SMS-рассылка'

    class Status(models.TextChoices):
        STARTED = 'started', 'Запущено'
        SUCCESS = 'success', 'Успешно'
        PARTIAL = 'partial', 'Частично'
        FAILED = 'failed', 'Ошибка'

    sync_type = models.CharField(max_length=20, choices=SyncType.choices, verbose_name='Тип операции')
    status = models.CharField(
        max_length=20, choices=Status.choices,
        default=Status.STARTED, verbose_name='Статус',
    )
    items_processed = models.PositiveIntegerField(default=0, verbose_name='Обработано')
    items_created = models.PositiveIntegerField(default=0, verbose_name='Создано')
    items_updated = models.PositiveIntegerField(default=0, verbose_name='Обновлено')
    items_errors = models.PositiveIntegerField(default=0, verbose_name='Ошибок')
    error_details = models.JSONField(default=list, blank=True, verbose_name='Детали ошибок')
    duration_seconds = models.FloatField(null=True, blank=True, verbose_name='Длительность (сек)')

    class Meta:
        verbose_name = 'Лог маркетинга'
        verbose_name_plural = 'Логи маркетинга'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_sync_type_display()} — {self.get_status_display()}'
