# Концепция: Поиск Исполнителей + Интеграция с Avito

> Дата: 2026-04-10  
> Статус: Проект  
> Автор: Andrei Prygunov + Claude

---

## 1. Обзор и цели

### Проблема

Компания «Август Климат» работает с монтажниками (Исполнителями) на сдельной основе. Основанием для заключения Договора служат **Монтажная смета** (без наценки, из прайс-листа) и **Монтажное Предложение** (МП, условия выполнения работ). Поиск новых монтажников ведётся вручную, преимущественно через Avito.ru — крупнейшую площадку объявлений в России.

### Цель

Создать в ERP полноценную систему поиска и управления Исполнителями:

1. **Автоматическая публикация** МП и монтажной сметы на Avito при формировании ТКП для Заказчика
2. **Ежедневное сканирование** Avito по ключевым словам (вентиляция, кондиционирование, слабые токи и др.) для поиска монтажников, ищущих работу
3. **База монтажников** — структурированная CRM-подобная система с контактами, навыками, расценками, историей работ, местом проживания
4. **Рассылки** (email + SMS) по базе монтажников с предложениями работы
5. **Полная интеграция с Avito API** — публикация, мониторинг, мессенджер

### Пользователь системы

Основной пользователь — маркетолог (Света, +7 916 113-31-97), которая занимается поиском Заказчиков и Исполнителей в разделе «Маркетинг».

---

## 2. Архитектурное решение: расширение Counterparty

### Почему НЕ новая сущность

Модель `Counterparty` (`backend/accounting/models.py:303`) уже является центральной сущностью для всех контрагентов:

```python
class Type(models.TextChoices):
    CUSTOMER = 'customer', 'Заказчик'
    POTENTIAL_CUSTOMER = 'potential_customer', 'Потенциальный Заказчик'
    VENDOR = 'vendor', 'Исполнитель/Поставщик'
    BOTH = 'both', 'Заказчик и Исполнитель'

class VendorSubtype(models.TextChoices):
    EXECUTOR = 'executor', 'Исполнитель'
```

На Counterparty завязаны:
- `MountingProposal.counterparty` — МП привязано к исполнителю
- `MountingEstimate.agreed_counterparty` — смета согласована с исполнителем
- `Contract.counterparty` — договоры
- `FrameworkContract.counterparty` — рамочные договоры
- `Worker.counterparty` — рабочие бригады

Создание отдельной сущности разорвёт эти связи и потребует масштабного рефакторинга.

### Решение: ExecutorProfile (1:1 расширение)

Создаём модель `ExecutorProfile` в новом Django-приложении `marketing`, которая расширяет Counterparty через `OneToOneField`:

```
Counterparty (type=vendor, vendor_subtype=executor)
    │
    └── ExecutorProfile (1:1)
            ├── Структурированные контакты (phone, email, telegram)
            ├── Навыки и специализации
            ├── Город, регион, радиус работ
            ├── Расценки (час, день)
            ├── Рейтинг, опыт, размер бригады
            ├── Флаг «потенциальный исполнитель»
            ├── Источник (Avito / ручной / Telegram / рекомендация)
            └── Avito User ID (для привязки к объявлениям)
```

**Жизненный цикл**: потенциальный исполнитель найден на Avito → создаётся Counterparty + ExecutorProfile (is_potential=True) → после первого договора is_potential=False.

---

## 3. Новое Django-приложение: `marketing`

### 3.1 Структура директорий

```
backend/marketing/
    __init__.py
    apps.py
    admin.py
    models.py                    # все модели (см. ниже)
    serializers.py               # DRF сериализаторы
    views.py                     # ViewSets
    urls.py                      # роутер
    signals.py                   # сигнал авто-публикации МП
    tasks.py                     # Celery-задачи
    clients/
        __init__.py
        avito.py                 # AvitoAPIClient (OAuth2, rate limiting)
        unisender.py             # UnisenderClient (email + SMS)
    services/
        __init__.py
        avito_scanner.py         # сканирование Avito по ключевым словам
        avito_publisher.py       # публикация МП на Avito
        campaign_service.py      # отправка рассылок
        executor_service.py      # CRUD, конвертация из Avito-листинга
    tests/
        __init__.py
        conftest.py
        test_models.py
        test_avito_client.py
        test_avito_scanner.py
        test_avito_publisher.py
        test_campaign_service.py
        test_tasks.py
        test_api.py
    migrations/
```

### 3.2 Модели

#### ExecutorProfile — профиль исполнителя

```python
class ExecutorProfile(TimestampedModel):
    """Расширенный профиль исполнителя (1:1 к Counterparty)"""

    class Source(models.TextChoices):
        MANUAL = 'manual', 'Ручной ввод'
        AVITO = 'avito', 'Avito'
        TELEGRAM = 'telegram', 'Telegram'
        REFERRAL = 'referral', 'Рекомендация'

    counterparty = models.OneToOneField(
        'accounting.Counterparty',
        on_delete=models.CASCADE,
        related_name='executor_profile',
        limit_choices_to={'type__in': ['vendor', 'both']},
        verbose_name='Контрагент'
    )
    source = models.CharField(
        max_length=20, choices=Source.choices,
        default=Source.MANUAL, verbose_name='Источник'
    )

    # --- Структурированные контакты ---
    phone = models.CharField(max_length=20, blank=True, db_index=True, verbose_name='Телефон')
    email = models.EmailField(blank=True, db_index=True, verbose_name='Email')
    telegram_username = models.CharField(max_length=100, blank=True, verbose_name='Telegram')
    whatsapp = models.CharField(max_length=20, blank=True, verbose_name='WhatsApp')
    contact_person = models.CharField(max_length=255, blank=True, verbose_name='Контактное лицо')

    # --- Навыки и специализации ---
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
    specializations = models.JSONField(
        default=list, blank=True,
        verbose_name='Специализации',
        help_text='["ventilation", "conditioning", ...]'
    )
    work_sections = models.ManyToManyField(
        'pricelists.WorkSection',
        blank=True,
        related_name='executor_profiles',
        verbose_name='Разделы работ'
    )

    # --- Местоположение ---
    city = models.CharField(max_length=100, blank=True, db_index=True, verbose_name='Город')
    region = models.CharField(max_length=100, blank=True, verbose_name='Регион')
    address = models.TextField(blank=True, verbose_name='Адрес')
    work_radius_km = models.PositiveIntegerField(
        null=True, blank=True, verbose_name='Радиус работ (км)'
    )

    # --- Расценки и мощность ---
    hourly_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name='Ставка в час (руб)'
    )
    daily_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name='Ставка в день (руб)'
    )
    team_size = models.PositiveSmallIntegerField(
        null=True, blank=True, verbose_name='Размер бригады'
    )

    # --- Квалификация ---
    rating = models.DecimalField(
        max_digits=3, decimal_places=2, default=0,
        verbose_name='Рейтинг (0-5)'
    )
    experience_years = models.PositiveSmallIntegerField(
        null=True, blank=True, verbose_name='Стаж (лет)'
    )
    has_legal_entity = models.BooleanField(
        default=False, verbose_name='Есть юр.лицо/ИП'
    )

    # --- Avito ---
    avito_user_id = models.CharField(
        max_length=100, blank=True, db_index=True,
        verbose_name='Avito User ID'
    )
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
        return f'{self.counterparty} — профиль исполнителя'
```

#### AvitoConfig — настройки интеграции (singleton)

```python
class AvitoConfig(TimestampedModel):
    """Настройки интеграции с Avito (singleton)"""

    # OAuth2 credentials
    client_id = models.CharField(max_length=255, blank=True, verbose_name='Client ID')
    client_secret = models.CharField(max_length=255, blank=True, verbose_name='Client Secret')
    access_token = models.TextField(blank=True, verbose_name='Access Token')
    token_expires_at = models.DateTimeField(null=True, blank=True, verbose_name='Токен истекает')
    user_id = models.CharField(max_length=100, blank=True, verbose_name='Avito User ID')

    # Настройки авто-публикации
    auto_publish_mp = models.BooleanField(
        default=False, verbose_name='Авто-публикация МП на Avito'
    )
    listing_category_id = models.IntegerField(
        null=True, blank=True, verbose_name='ID категории Avito'
    )
    listing_template = models.TextField(
        blank=True, verbose_name='Шаблон текста объявления',
        help_text='Переменные: {object_name}, {city}, {work_types}, {man_hours}, {total_amount}'
    )

    # Настройки сканирования
    search_enabled = models.BooleanField(
        default=False, verbose_name='Ежедневное сканирование включено'
    )
    search_regions = models.JSONField(
        default=list, blank=True, verbose_name='Регионы поиска',
        help_text='ID регионов Avito, например [637640] для Москвы'
    )

    is_active = models.BooleanField(default=True, verbose_name='Интеграция активна')

    class Meta:
        verbose_name = 'Настройки Avito'
        verbose_name_plural = 'Настройки Avito'

    @classmethod
    def get(cls):
        """Получить или создать singleton"""
        obj = cls.objects.first()
        if not obj:
            obj = cls.objects.create()
        return obj

    def is_token_valid(self):
        from django.utils import timezone
        return (
            self.access_token
            and self.token_expires_at
            and self.token_expires_at > timezone.now()
        )
```

#### AvitoSearchKeyword — ключевые слова для сканирования

```python
class AvitoSearchKeyword(TimestampedModel):
    """Ключевое слово для поиска объявлений на Avito"""

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
```

**Предустановленные ключевые слова**: вентиляция, кондиционирование, слабые токи, монтаж вентиляции, монтаж кондиционеров, климатическое оборудование, электромонтаж, пусконаладка.

#### AvitoListing — найденные объявления (входящие контакты)

```python
class AvitoListing(TimestampedModel):
    """Объявление, найденное при сканировании Avito"""

    class Status(models.TextChoices):
        NEW = 'new', 'Новое'
        REVIEWED = 'reviewed', 'Просмотрено'
        CONTACTED = 'contacted', 'Контакт установлен'
        CONVERTED = 'converted', 'Конвертирован в исполнителя'
        REJECTED = 'rejected', 'Не подходит'

    avito_item_id = models.CharField(max_length=100, unique=True, db_index=True, verbose_name='Avito ID')
    url = models.URLField(verbose_name='Ссылка')
    title = models.CharField(max_length=500, verbose_name='Заголовок')
    description = models.TextField(blank=True, verbose_name='Описание')
    price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, verbose_name='Цена')
    city = models.CharField(max_length=100, blank=True, verbose_name='Город')
    category = models.CharField(max_length=255, blank=True, verbose_name='Категория')

    # Продавец (потенциальный исполнитель)
    seller_name = models.CharField(max_length=255, blank=True, verbose_name='Имя продавца')
    seller_avito_id = models.CharField(max_length=100, blank=True, db_index=True, verbose_name='Avito ID продавца')
    seller_phone = models.CharField(max_length=20, blank=True, verbose_name='Телефон продавца')

    # Связи
    keyword = models.ForeignKey(
        AvitoSearchKeyword, on_delete=models.SET_NULL,
        null=True, related_name='listings', verbose_name='Ключевое слово'
    )
    executor_profile = models.ForeignKey(
        ExecutorProfile, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='avito_listings',
        verbose_name='Профиль исполнителя'
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
            models.Index(fields=['seller_avito_id']),
        ]

    def __str__(self):
        return f'{self.title} ({self.city})'
```

#### AvitoPublishedListing — наши опубликованные объявления

```python
class AvitoPublishedListing(TimestampedModel):
    """МП, опубликованное как объявление на Avito"""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Ожидает публикации'
        PUBLISHED = 'published', 'Опубликовано'
        EXPIRED = 'expired', 'Истекло'
        DEACTIVATED = 'deactivated', 'Деактивировано'
        ERROR = 'error', 'Ошибка'

    mounting_proposal = models.ForeignKey(
        'proposals.MountingProposal', on_delete=models.CASCADE,
        related_name='avito_listings', verbose_name='МП'
    )
    avito_item_id = models.CharField(max_length=100, blank=True, db_index=True, verbose_name='Avito ID')
    avito_url = models.URLField(blank=True, verbose_name='Ссылка на Avito')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, verbose_name='Статус')
    listing_title = models.CharField(max_length=500, blank=True, verbose_name='Заголовок объявления')
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
```

#### ContactHistory — история контактов

```python
class ContactHistory(TimestampedModel):
    """Лог всех коммуникаций с исполнителем"""

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
        related_name='contact_history', verbose_name='Исполнитель'
    )
    channel = models.CharField(max_length=20, choices=Channel.choices, verbose_name='Канал')
    direction = models.CharField(max_length=10, choices=Direction.choices, verbose_name='Направление')
    subject = models.CharField(max_length=255, blank=True, verbose_name='Тема')
    body = models.TextField(blank=True, verbose_name='Содержание')
    campaign = models.ForeignKey(
        'Campaign', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='contact_records',
        verbose_name='Рассылка'
    )
    created_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL,
        null=True, blank=True, verbose_name='Кто создал'
    )

    class Meta:
        verbose_name = 'Запись контакта'
        verbose_name_plural = 'История контактов'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_channel_display()} → {self.executor_profile} ({self.created_at:%d.%m.%Y})'
```

#### Campaign + CampaignRecipient — рассылки

```python
class Campaign(TimestampedModel):
    """Email или SMS рассылка"""

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
    campaign_type = models.CharField(
        max_length=10, choices=CampaignType.choices, verbose_name='Тип'
    )
    status = models.CharField(
        max_length=20, choices=Status.choices,
        default=Status.DRAFT, verbose_name='Статус'
    )

    # Контент
    subject = models.CharField(max_length=255, blank=True, verbose_name='Тема (для email)')
    body = models.TextField(verbose_name='Текст сообщения')

    # Прикреплённые файлы (для email)
    attachment_mp = models.ForeignKey(
        'proposals.MountingProposal', on_delete=models.SET_NULL,
        null=True, blank=True, verbose_name='Прикрепить МП'
    )
    attachment_estimate = models.ForeignKey(
        'estimates.MountingEstimate', on_delete=models.SET_NULL,
        null=True, blank=True, verbose_name='Прикрепить смету'
    )

    # Фильтры для выбора получателей
    filter_specializations = models.JSONField(
        default=list, blank=True, verbose_name='Фильтр: специализации'
    )
    filter_cities = models.JSONField(
        default=list, blank=True, verbose_name='Фильтр: города'
    )
    filter_is_potential = models.BooleanField(
        null=True, blank=True, verbose_name='Фильтр: потенциальные'
    )
    filter_is_available = models.BooleanField(
        null=True, blank=True, verbose_name='Фильтр: доступные'
    )

    # Расписание
    scheduled_at = models.DateTimeField(null=True, blank=True, verbose_name='Запланировано на')
    sent_at = models.DateTimeField(null=True, blank=True, verbose_name='Отправлено')

    # Счётчики
    total_recipients = models.PositiveIntegerField(default=0, verbose_name='Всего получателей')
    sent_count = models.PositiveIntegerField(default=0, verbose_name='Отправлено')
    delivered_count = models.PositiveIntegerField(default=0, verbose_name='Доставлено')
    error_count = models.PositiveIntegerField(default=0, verbose_name='Ошибок')

    created_by = models.ForeignKey(
        'auth.User', on_delete=models.PROTECT,
        related_name='created_campaigns', verbose_name='Кто создал'
    )

    class Meta:
        verbose_name = 'Рассылка'
        verbose_name_plural = 'Рассылки'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.get_campaign_type_display()})'


class CampaignRecipient(TimestampedModel):
    """Получатель рассылки"""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Ожидает'
        SENT = 'sent', 'Отправлено'
        DELIVERED = 'delivered', 'Доставлено'
        FAILED = 'failed', 'Ошибка'
        UNSUBSCRIBED = 'unsubscribed', 'Отписался'

    campaign = models.ForeignKey(
        Campaign, on_delete=models.CASCADE,
        related_name='recipients', verbose_name='Рассылка'
    )
    executor_profile = models.ForeignKey(
        ExecutorProfile, on_delete=models.CASCADE, verbose_name='Исполнитель'
    )
    status = models.CharField(
        max_length=20, choices=Status.choices,
        default=Status.PENDING, verbose_name='Статус'
    )
    error_message = models.TextField(blank=True, verbose_name='Ошибка')
    sent_at = models.DateTimeField(null=True, blank=True, verbose_name='Отправлено')

    class Meta:
        verbose_name = 'Получатель рассылки'
        verbose_name_plural = 'Получатели рассылки'
        unique_together = ['campaign', 'executor_profile']
```

#### UnisenderConfig — настройки Unisender (singleton)

```python
class UnisenderConfig(TimestampedModel):
    """Настройки Unisender для email и SMS рассылок (singleton)"""

    api_key = models.CharField(max_length=255, blank=True, verbose_name='API-ключ')
    sender_email = models.EmailField(blank=True, verbose_name='Email отправителя')
    sender_name = models.CharField(max_length=100, blank=True, verbose_name='Имя отправителя')
    sms_sender = models.CharField(
        max_length=15, blank=True, verbose_name='Имя отправителя SMS',
        help_text='До 11 символов латиницей'
    )
    is_active = models.BooleanField(default=False, verbose_name='Активен')

    class Meta:
        verbose_name = 'Настройки Unisender'
        verbose_name_plural = 'Настройки Unisender'

    @classmethod
    def get(cls):
        obj = cls.objects.first()
        if not obj:
            obj = cls.objects.create()
        return obj
```

#### MarketingSyncLog — логи синхронизации

```python
class MarketingSyncLog(TimestampedModel):
    """Лог операций сканирования и публикации (паттерн из supplier_integrations)"""

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
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.STARTED, verbose_name='Статус')
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
```

---

## 4. Avito API: справочник и работа с документацией

### 4.1 Общие параметры

| Параметр | Значение |
|---|---|
| Base URL | `https://api.avito.ru/` |
| Аутентификация | OAuth 2.0 (client_credentials) |
| Rate limit | 60 запросов/мин |
| Ответ на лимит | HTTP 403 Forbidden |
| Sandbox | Нет (работа с боевым аккаунтом) |
| Документация | https://developers.avito.ru/api-catalog |

### 4.2 Используемые API endpoints

**Аутентификация:**
```
POST /token  — получить access_token
  Body: grant_type=client_credentials&client_id=...&client_secret=...
  Response: { access_token, expires_in, token_type }
```

**Управление объявлениями (для публикации МП):**
```
POST /autoload/v1/upload           — загрузка файла объявления (XML/JSON)
GET  /autoload/v2/items/avito_ids  — получить Avito ID по нашему ID
GET  /core/v1/items                — информация о наших объявлениях
PUT  /core/v1/accounts/{user_id}/items/{item_id}/price — обновить цену
GET  /items/v2/list                — список наших объявлений
```

**Статистика:**
```
POST /core/v1/accounts/{user_id}/stats/items — статистика просмотров/контактов
```

**Мессенджер (для общения с монтажниками):**
```
GET  /messenger/v1/accounts/{user_id}/chats       — список чатов
POST /messenger/v1/accounts/{user_id}/chats/{id}/messages — отправить сообщение
GET  /messenger/v1/accounts/{user_id}/chats/{id}/messages — получить сообщения
```

**Категории и поля:**
```
GET /autoload/v1/user-docs/tree                    — дерево категорий
GET /autoload/v1/user-docs/node/{slug}/fields      — поля категории
```

### 4.3 Хранение документации по API

1. **Этот файл** (`docs/marketing/avito-integration-concept.md`) — основной справочник
2. **В коде**: docstrings в `clients/avito.py` с описанием каждого метода
3. **При разработке**: использовать MCP-инструмент `context7` для актуальной документации
4. **Postman-коллекция**: импортировать из https://www.postman.com/trbrmrdr/examplespace/collection/700k40u/avito-api

### 4.4 Работа с API в период разработки

**Проблема**: у Avito нет sandbox-окружения. Все вызовы идут к боевому API.

**Решение — многоуровневая защита:**

1. **Dry-run режим** в `AvitoPublisherService`:
   ```python
   class AvitoPublisherService:
       def publish(self, mp_id, dry_run=False):
           listing_data = self._build_listing_data(mp_id)
           if dry_run:
               return {'status': 'dry_run', 'data': listing_data}
           return self.client.create_item(listing_data)
   ```

2. **AvitoConfig.is_active = False** по умолчанию — пока не включим вручную, ничего не отправляется

3. **Моки в тестах**: все тесты используют `unittest.mock.patch` на `AvitoAPIClient`, никогда не делают реальных запросов

4. **Rate limiter** в клиенте с подсчётом запросов:
   ```python
   class AvitoAPIClient:
       RATE_LIMIT = 60  # req/min
       RATE_WINDOW = 60  # seconds
   ```

5. **Логирование** всех запросов/ответов через `MarketingSyncLog`

### 4.5 Получение API-ключей

1. Войти на https://www.avito.ru под аккаунтом `avgust-klimat-crm@yandex.ru`
2. Перейти в раздел «Для профессионалов» → «API для бизнеса»
3. Зарегистрировать приложение, получить `client_id` и `client_secret`
4. Добавить в `.env`:
   ```
   AVITO_CLIENT_ID=...
   AVITO_CLIENT_SECRET=...
   ```
5. В ERP: Маркетинг → Поиск Исполнителей → Настройки → ввести Client ID и Client Secret

---

## 5. Сервисный слой

### 5.1 AvitoAPIClient (`clients/avito.py`)

По паттерну `BreezAPIClient` (`backend/supplier_integrations/clients/breez.py`):

```python
class AvitoAPIError(Exception):
    def __init__(self, message, status_code=None, response_data=None):
        self.message = message
        self.status_code = status_code
        self.response_data = response_data
        super().__init__(message)


class AvitoAPIClient:
    """Клиент Avito API с OAuth2 и rate limiting"""

    BASE_URL = 'https://api.avito.ru'
    TOKEN_URL = 'https://api.avito.ru/token'
    TIMEOUT = 30
    MAX_RETRIES = 3
    RETRY_DELAY = 2
    RATE_LIMIT = 55  # чуть меньше лимита 60 для запаса
    RATE_WINDOW = 60

    def __init__(self):
        self.config = None
        self._client = None
        self._request_timestamps = []

    def __enter__(self):
        from marketing.models import AvitoConfig
        self.config = AvitoConfig.get()
        self._client = httpx.Client(timeout=self.TIMEOUT)
        self._ensure_valid_token()
        return self

    def __exit__(self, *args):
        if self._client:
            self._client.close()

    def _ensure_valid_token(self):
        """Обновить токен если истёк"""
        if not self.config.is_token_valid():
            self._refresh_token()

    def _refresh_token(self):
        """OAuth2 client_credentials flow"""
        response = self._client.post(self.TOKEN_URL, data={
            'grant_type': 'client_credentials',
            'client_id': self.config.client_id,
            'client_secret': self.config.client_secret,
        })
        # ... обработка ответа, сохранение токена в config ...

    def _throttle(self):
        """Rate limiting: не более RATE_LIMIT запросов в RATE_WINDOW секунд"""
        now = time.monotonic()
        self._request_timestamps = [
            t for t in self._request_timestamps if now - t < self.RATE_WINDOW
        ]
        if len(self._request_timestamps) >= self.RATE_LIMIT:
            sleep_time = self.RATE_WINDOW - (now - self._request_timestamps[0])
            time.sleep(max(0, sleep_time))
        self._request_timestamps.append(time.monotonic())

    def _request(self, method, path, **kwargs):
        """HTTP запрос с ретраями, rate limiting, авторизацией"""
        self._throttle()
        self._ensure_valid_token()
        # ... retry loop аналогично BreezAPIClient ...

    # --- Публичные методы ---

    def search_items(self, query, location_id=None, category_id=None, page=1):
        """Поиск объявлений по ключевому слову"""

    def create_listing(self, listing_data):
        """Создать объявление (Autoload API)"""

    def get_item_stats(self, item_ids):
        """Получить статистику по объявлениям"""

    def get_chats(self):
        """Получить список чатов"""

    def send_message(self, chat_id, text):
        """Отправить сообщение в чат"""

    def get_user_info(self, user_id):
        """Получить информацию о пользователе"""
```

### 5.2 UnisenderClient (`clients/unisender.py`)

```python
class UnisenderClient:
    """Клиент Unisender API (email + SMS)"""

    BASE_URL = 'https://api.unisender.com/ru/api'

    def __init__(self):
        from marketing.models import UnisenderConfig
        self.config = UnisenderConfig.get()

    def send_email(self, to_email, subject, body, attachments=None):
        """Отправить email через Unisender"""

    def send_sms(self, phone, text):
        """Отправить SMS через Unisender"""

    def check_email_status(self, message_id):
        """Проверить статус email"""

    def check_sms_status(self, message_id):
        """Проверить статус SMS"""
```

### 5.3 AvitoScannerService (`services/avito_scanner.py`)

```python
class AvitoScannerService:
    """Ежедневное сканирование Avito по ключевым словам"""

    def scan_all_keywords(self):
        """
        1. Загрузить активные AvitoSearchKeyword
        2. Для каждого — вызвать Avito API поиска
        3. Дедупликация по avito_item_id
        4. Создать AvitoListing (status=new) для новых
        5. Обновить last_scan_at и results_count
        6. Записать MarketingSyncLog
        """

    def _process_keyword(self, keyword, client):
        """Обработать одно ключевое слово"""

    def _deduplicate(self, items):
        """Исключить уже существующие в БД объявления"""
```

### 5.4 AvitoPublisherService (`services/avito_publisher.py`)

```python
class AvitoPublisherService:
    """Публикация МП как объявления на Avito"""

    def publish_mounting_proposal(self, mp_id, dry_run=False):
        """
        1. Загрузить MountingProposal с объектом и сметами
        2. Сформировать текст по шаблону из AvitoConfig.listing_template
        3. Создать AvitoPublishedListing (status=pending)
        4. Вызвать Avito API (если не dry_run)
        5. Обновить AvitoPublishedListing (status=published, avito_item_id, avito_url)
        6. Записать MarketingSyncLog
        """

    def _build_listing_data(self, mp):
        """Сформировать данные объявления из МП"""
        template = AvitoConfig.get().listing_template
        return {
            'title': f'Ищем монтажников: {mp.object.name}',
            'description': template.format(
                object_name=mp.object.name,
                city=mp.object.city,
                work_types='...',
                man_hours=mp.man_hours,
                total_amount=mp.total_amount,
            ),
            'category_id': AvitoConfig.get().listing_category_id,
            # ...
        }
```

### 5.5 CampaignService (`services/campaign_service.py`)

```python
class CampaignService:
    """Сервис отправки рассылок"""

    def execute_campaign(self, campaign_id):
        """
        1. Загрузить Campaign
        2. Определить получателей по фильтрам
        3. Создать CampaignRecipient записи
        4. Для каждого получателя:
           - Email: вызвать UnisenderClient.send_email()
           - SMS: вызвать UnisenderClient.send_sms()
           - Создать ContactHistory запись
        5. Обновить счётчики Campaign
        6. Записать MarketingSyncLog
        """

    def resolve_recipients(self, campaign):
        """Подобрать получателей по фильтрам кампании"""
        qs = ExecutorProfile.objects.filter(is_available=True)
        if campaign.filter_specializations:
            qs = qs.filter(specializations__overlap=campaign.filter_specializations)
        if campaign.filter_cities:
            qs = qs.filter(city__in=campaign.filter_cities)
        if campaign.filter_is_potential is not None:
            qs = qs.filter(is_potential=campaign.filter_is_potential)
        return qs

    def preview_campaign(self, campaign_id):
        """Предпросмотр: список получателей + примерная стоимость SMS"""
```

### 5.6 ExecutorService (`services/executor_service.py`)

```python
class ExecutorService:
    """CRUD и бизнес-логика для профилей исполнителей"""

    def convert_listing_to_executor(self, listing_id):
        """
        Конвертировать AvitoListing в Counterparty + ExecutorProfile:
        1. Проверить нет ли уже контрагента с таким avito_user_id
        2. Создать Counterparty (type=vendor, vendor_subtype=executor, legal_form=fiz)
        3. Создать ExecutorProfile (source=avito, is_potential=True, city, avito_user_id)
        4. Обновить AvitoListing.status = converted
        5. Связать AvitoListing.executor_profile
        """

    def search_executors(self, filters):
        """Поиск исполнителей с фильтрацией"""
```

---

## 6. Celery-задачи

### tasks.py

```python
@shared_task(bind=True, max_retries=2, default_retry_delay=600)
def scan_avito_listings(self):
    """Ежедневное сканирование Avito по ключевым словам"""
    from marketing.services.avito_scanner import AvitoScannerService
    AvitoScannerService().scan_all_keywords()

@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def publish_mp_to_avito(self, mounting_proposal_id):
    """Публикация МП на Avito"""
    from marketing.services.avito_publisher import AvitoPublisherService
    AvitoPublisherService().publish_mounting_proposal(mounting_proposal_id)

@shared_task(bind=True, max_retries=2, default_retry_delay=300)
def sync_avito_stats(self):
    """Обновление статистики опубликованных объявлений"""

@shared_task(bind=True, max_retries=1, default_retry_delay=60)
def execute_campaign(self, campaign_id):
    """Отправка email/SMS рассылки"""
    from marketing.services.campaign_service import CampaignService
    CampaignService().execute_campaign(campaign_id)

@shared_task
def refresh_avito_token():
    """Проактивное обновление OAuth-токена"""
```

### Добавление в beat_schedule (`backend/finans_assistant/celery.py`)

```python
# --- Marketing ---
'marketing-scan-avito': {
    'task': 'marketing.tasks.scan_avito_listings',
    'schedule': crontab(hour=8, minute=0),     # Ежедневно в 08:00
},
'marketing-sync-avito-stats': {
    'task': 'marketing.tasks.sync_avito_stats',
    'schedule': crontab(hour=10, minute=0, day_of_week=1),  # Пн 10:00
},
'marketing-refresh-avito-token': {
    'task': 'marketing.tasks.refresh_avito_token',
    'schedule': 43200.0,                       # Каждые 12 часов
},
```

---

## 7. API endpoints

Все endpoints под `/api/v1/marketing/`:

| Endpoint | ViewSet | Методы | Описание |
|---|---|---|---|
| `executor-profiles/` | ExecutorProfileViewSet | GET, POST, PATCH, DELETE | CRUD профилей исполнителей |
| `executor-profiles/{id}/contact-history/` | @action | GET | История контактов исполнителя |
| `executor-profiles/{id}/add-contact/` | @action | POST | Добавить запись контакта |
| `avito/config/` | AvitoConfigViewSet | GET, PATCH | Настройки Avito (singleton) |
| `avito/keywords/` | AvitoSearchKeywordViewSet | GET, POST, PATCH, DELETE | Ключевые слова |
| `avito/listings/` | AvitoListingViewSet | GET | Найденные объявления |
| `avito/listings/{id}/update-status/` | @action | PATCH | Сменить статус объявления |
| `avito/listings/{id}/convert/` | @action | POST | Конвертировать в исполнителя |
| `avito/published/` | AvitoPublishedListingViewSet | GET | Наши публикации |
| `avito/published/{id}/refresh-stats/` | @action | POST | Обновить статистику |
| `avito/scan/` | @action | POST | Запустить сканирование вручную |
| `avito/publish-mp/{mp_id}/` | @action | POST | Опубликовать МП на Avito |
| `campaigns/` | CampaignViewSet | GET, POST, PATCH, DELETE | CRUD рассылок |
| `campaigns/{id}/send/` | @action | POST | Запустить отправку |
| `campaigns/{id}/preview/` | @action | GET | Предпросмотр получателей |
| `campaigns/{id}/recipients/` | @action | GET | Статусы получателей |
| `unisender/config/` | UnisenderConfigViewSet | GET, PATCH | Настройки Unisender |
| `sync-logs/` | MarketingSyncLogViewSet | GET | Логи синхронизации |
| `dashboard/` | marketing_dashboard | GET | Сводная статистика |

### Регистрация URL

В `backend/marketing/urls.py`:
```python
router = DefaultRouter()
router.register('executor-profiles', ExecutorProfileViewSet)
router.register('avito/keywords', AvitoSearchKeywordViewSet)
router.register('avito/listings', AvitoListingViewSet)
router.register('avito/published', AvitoPublishedListingViewSet)
router.register('campaigns', CampaignViewSet)
router.register('sync-logs', MarketingSyncLogViewSet)

urlpatterns = [
    path('marketing/', include(router.urls)),
    path('marketing/avito/config/', AvitoConfigView.as_view()),
    path('marketing/unisender/config/', UnisenderConfigView.as_view()),
    path('marketing/avito/scan/', trigger_avito_scan),
    path('marketing/avito/publish-mp/<int:mp_id>/', publish_mp_to_avito),
    path('marketing/dashboard/', marketing_dashboard),
]
```

В `backend/finans_assistant/urls.py`:
```python
path('api/v1/', include('marketing.urls')),
```

---

## 8. Интеграция с существующим кодом

### 8.1 Авто-публикация МП при формировании ТКП

**Механизм**: Django-сигнал на `MountingProposal.post_save`

```python
# marketing/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from proposals.models import MountingProposal

@receiver(post_save, sender=MountingProposal)
def auto_publish_mp_to_avito(sender, instance, **kwargs):
    """Авто-публикация МП на Avito при смене статуса на 'published'"""
    if instance.status == MountingProposal.Status.PUBLISHED:
        from marketing.models import AvitoConfig
        config = AvitoConfig.get()
        if config.is_active and config.auto_publish_mp:
            from marketing.tasks import publish_mp_to_avito
            publish_mp_to_avito.delay(instance.pk)
```

Регистрация в `marketing/apps.py`:
```python
class MarketingConfig(AppConfig):
    name = 'marketing'
    verbose_name = 'Маркетинг'

    def ready(self):
        import marketing.signals  # noqa
```

### 8.2 Связь с MountingProposal

**Без изменения модели MountingProposal.** Связь через FK в `AvitoPublishedListing.mounting_proposal`. Проверка публикации:
```python
mp.avito_listings.filter(status='published').exists()
```

Аналогично существующему подходу с `telegram_published` полем, но без добавления полей в стороннюю модель.

### 8.3 Permission system

Уже настроен: `marketing.executors` в `backend/personnel/models.py:89`. Дополнительные sub-permissions при необходимости:

```python
# Предложение расширения (опционально, на Фазе 6)
('marketing', {
    'label': 'Маркетинг',
    'children': OrderedDict([
        ('kanban', 'Канбан поиска объектов'),
        ('potential_customers', 'Потенциальные заказчики'),
        ('executors', 'Поиск исполнителей'),
        ('campaigns', 'Рассылки'),         # новый
        ('avito', 'Интеграция Avito'),      # новый
    ]),
}),
```

### 8.4 INSTALLED_APPS

Добавить `'marketing'` в `backend/finans_assistant/settings.py`:
```python
INSTALLED_APPS = [
    ...
    'marketing',
]
```

---

## 9. Frontend-структура

### 9.1 UI: Маркетинг → Поиск Исполнителей

Заменяем stub-страницу `frontend/app/erp/marketing/executors/page.tsx` на полноценный компонент с горизонтальными вкладками (паттерн из `Settings.tsx`):

```
┌──────────────────────────────────────────────────────────────────┐
│  Маркетинг > Поиск Исполнителей                                 │
├─────────────────┬────────┬──────────┬──────────────────┬─────────┤
│ База монтажников│ Авито  │ Рассылки │ История контактов│Настройки│
├─────────────────┴────────┴──────────┴──────────────────┴─────────┤
│                                                                  │
│  [Содержимое выбранной вкладки]                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Вкладка **Авито** имеет подвкладки:
- **Входящие** — объявления найденные при сканировании
- **Наши объявления** — опубликованные МП

### 9.2 Компоненты

```
frontend/components/erp/components/marketing/
    ExecutorSearchPage.tsx              # Главная страница с табами
    executors/
        ExecutorDatabaseTab.tsx         # Таблица исполнителей + фильтры
        ExecutorProfileDialog.tsx       # Создание/редактирование профиля
        ExecutorDetailPanel.tsx         # Боковая панель с деталями + история
    avito/
        AvitoTab.tsx                    # Обёртка с подвкладками
        AvitoIncomingTab.tsx            # Найденные объявления
        AvitoPublishedTab.tsx           # Наши публикации + статистика
        AvitoListingCard.tsx            # Карточка объявления
        AvitoKeywordManager.tsx         # Управление ключевыми словами
        ConvertToExecutorDialog.tsx     # Конвертация листинга → исполнитель
    campaigns/
        CampaignsTab.tsx               # Список рассылок
        CampaignEditor.tsx             # Создание/редактирование рассылки
        CampaignResultsDialog.tsx      # Результаты отправки
        RecipientSelector.tsx          # Выбор получателей по фильтрам
    ContactHistoryTab.tsx              # Глобальная история контактов
    settings/
        ExecutorSettingsTab.tsx         # Настройки Avito + Unisender
```

### 9.3 API-сервис

Новый файл: `frontend/lib/api/services/marketing.ts`

```typescript
export function createMarketingService(request: RequestFn) {
  return {
    // Профили исполнителей
    getExecutorProfiles: (filters?) => request('/marketing/executor-profiles/', { params: filters }),
    getExecutorProfile: (id) => request(`/marketing/executor-profiles/${id}/`),
    createExecutorProfile: (data) => request('/marketing/executor-profiles/', { method: 'POST', body: data }),
    updateExecutorProfile: (id, data) => request(`/marketing/executor-profiles/${id}/`, { method: 'PATCH', body: data }),
    deleteExecutorProfile: (id) => request(`/marketing/executor-profiles/${id}/`, { method: 'DELETE' }),
    getContactHistory: (id) => request(`/marketing/executor-profiles/${id}/contact-history/`),
    addContact: (id, data) => request(`/marketing/executor-profiles/${id}/add-contact/`, { method: 'POST', body: data }),

    // Avito
    getAvitoConfig: () => request('/marketing/avito/config/'),
    updateAvitoConfig: (data) => request('/marketing/avito/config/', { method: 'PATCH', body: data }),
    getAvitoKeywords: () => request('/marketing/avito/keywords/'),
    createAvitoKeyword: (data) => request('/marketing/avito/keywords/', { method: 'POST', body: data }),
    deleteAvitoKeyword: (id) => request(`/marketing/avito/keywords/${id}/`, { method: 'DELETE' }),
    getAvitoListings: (filters?) => request('/marketing/avito/listings/', { params: filters }),
    updateListingStatus: (id, status) => request(`/marketing/avito/listings/${id}/update-status/`, { method: 'PATCH', body: { status } }),
    convertListingToExecutor: (id) => request(`/marketing/avito/listings/${id}/convert/`, { method: 'POST' }),
    getPublishedListings: () => request('/marketing/avito/published/'),
    refreshPublishedStats: (id) => request(`/marketing/avito/published/${id}/refresh-stats/`, { method: 'POST' }),
    triggerAvitoScan: () => request('/marketing/avito/scan/', { method: 'POST' }),
    publishMPToAvito: (mpId) => request(`/marketing/avito/publish-mp/${mpId}/`, { method: 'POST' }),

    // Рассылки
    getCampaigns: () => request('/marketing/campaigns/'),
    createCampaign: (data) => request('/marketing/campaigns/', { method: 'POST', body: data }),
    updateCampaign: (id, data) => request(`/marketing/campaigns/${id}/`, { method: 'PATCH', body: data }),
    deleteCampaign: (id) => request(`/marketing/campaigns/${id}/`, { method: 'DELETE' }),
    sendCampaign: (id) => request(`/marketing/campaigns/${id}/send/`, { method: 'POST' }),
    previewCampaign: (id) => request(`/marketing/campaigns/${id}/preview/`),
    getCampaignRecipients: (id) => request(`/marketing/campaigns/${id}/recipients/`),

    // Unisender
    getUnisenderConfig: () => request('/marketing/unisender/config/'),
    updateUnisenderConfig: (data) => request('/marketing/unisender/config/', { method: 'PATCH', body: data }),

    // Логи и дашборд
    getSyncLogs: (filters?) => request('/marketing/sync-logs/', { params: filters }),
    getDashboard: () => request('/marketing/dashboard/'),
  };
}
```

Регистрация в `frontend/lib/api/client.ts`:
```typescript
readonly marketing: ReturnType<typeof createMarketingService>;
```

### 9.4 TypeScript-типы

Новый файл: `frontend/lib/api/types/marketing.ts` — интерфейсы для всех моделей.

---

## 10. Unisender: выбор и интеграция

### Почему Unisender

- **Email + SMS в одном сервисе** — единый API, один аккаунт, одна панель аналитики
- Российский сервис, серверы в РФ
- HTTP API с хорошей документацией: https://www.unisender.com/ru/support/api/
- Поддержка шаблонов, персонализации, статусов доставки
- Бесплатный тариф до 100 контактов

### API Unisender

```
Base URL: https://api.unisender.com/ru/api/

Отправка email:
POST /sendEmail?api_key=...&email=...&subject=...&body=...

Отправка SMS:
POST /sendSms?api_key=...&phone=...&text=...

Проверка статуса:
GET /checkEmail?api_key=...&email_id=...
GET /checkSms?api_key=...&sms_id=...
```

### Настройка

1. Зарегистрироваться на https://www.unisender.com/
2. Получить API-ключ в настройках → API
3. Настроить sender email (подтвердить домен)
4. Зарегистрировать имя отправителя для SMS (до 11 символов)
5. В ERP: Маркетинг → Поиск Исполнителей → Настройки → ввести API-ключ

---

## 11. Фазы реализации

### Фаза 1: Фундамент (2-3 дня)
- [ ] Создать Django app `marketing`
- [ ] Реализовать все модели
- [ ] `makemigrations` + `migrate`
- [ ] Сериализаторы
- [ ] ViewSets с CRUD
- [ ] URL routing
- [ ] Регистрация в `INSTALLED_APPS`, `urls.py`
- [ ] Тесты моделей (`test_models.py`)

### Фаза 2: UI — База монтажников (2-3 дня)
- [ ] `createMarketingService` в `lib/api/services/marketing.ts`
- [ ] TypeScript-типы в `lib/api/types/marketing.ts`
- [ ] Регистрация сервиса в `client.ts`
- [ ] `ExecutorSearchPage.tsx` — главная с табами
- [ ] `ExecutorDatabaseTab.tsx` — таблица с фильтрами
- [ ] `ExecutorProfileDialog.tsx` — создание/редактирование
- [ ] `ExecutorDetailPanel.tsx` — детали + история контактов
- [ ] API-тесты (`test_api.py`)

### Фаза 3: Avito-интеграция (3-4 дня)
- [ ] `clients/avito.py` — API-клиент с OAuth2
- [ ] `services/avito_scanner.py` — сканирование
- [ ] `services/avito_publisher.py` — публикация МП
- [ ] `tasks.py` — Celery-задачи
- [ ] `signals.py` — авто-публикация на post_save
- [ ] Beat schedule в `celery.py`
- [ ] UI: `AvitoTab.tsx`, `AvitoIncomingTab.tsx`, `AvitoPublishedTab.tsx`
- [ ] UI: `AvitoKeywordManager.tsx`, `ConvertToExecutorDialog.tsx`
- [ ] UI: `ExecutorSettingsTab.tsx` (секция Avito)
- [ ] Тесты: `test_avito_client.py`, `test_avito_scanner.py`, `test_avito_publisher.py`

### Фаза 4: Рассылки (2-3 дня)
- [ ] `clients/unisender.py` — клиент Unisender
- [ ] `services/campaign_service.py` — логика рассылок
- [ ] Celery-задача `execute_campaign`
- [ ] UI: `CampaignsTab.tsx`, `CampaignEditor.tsx`
- [ ] UI: `RecipientSelector.tsx`, `CampaignResultsDialog.tsx`
- [ ] UI: `ExecutorSettingsTab.tsx` (секция Unisender)
- [ ] Тесты: `test_campaign_service.py`

### Фаза 5: История контактов и полировка (1-2 дня)
- [ ] UI: `ContactHistoryTab.tsx`
- [ ] Endpoint `/dashboard/` — сводная статистика
- [ ] Dashboard-виджеты в ExecutorDatabaseTab
- [ ] Ручное тестирование с реальным Avito-аккаунтом

### Фаза 6: Production hardening (1 день)
- [ ] `admin.py` — регистрация всех моделей
- [ ] Sentry error tracking для Avito API
- [ ] Rate limit тестирование
- [ ] Расширение permissions при необходимости
- [ ] Деплой-инструкция

---

## 12. Риски и митигации

| Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|
| Avito API нет sandbox | Высокая | Среднее | Dry-run режим, `is_active=False` по умолчанию, моки в тестах |
| Rate limit 60 req/min | Средняя | Среднее | Token bucket в клиенте, последовательная обработка ключевых слов |
| INN уникальность при конвертации | Средняя | Низкое | Проверка существующего контрагента, merge-логика |
| OAuth токен истекает при длинном скане | Средняя | Низкое | Проактивное обновление перед каждым batch |
| Доставляемость SMS | Средняя | Среднее | Unisender гарантирует доставку, статусы проверяем |
| Avito может изменить API | Низкая | Высокое | Версионирование в клиенте, мониторинг changelog |

---

## 13. Учётные данные

### Avito аккаунт
- URL: https://www.avito.ru
- Email: `avgust-klimat-crm@yandex.ru`
- Телефон: +7 (916) 113-31-97 (рабочий тел. Светы)

**API credentials (нужно получить):**
```env
# .env
AVITO_CLIENT_ID=<получить в личном кабинете Avito>
AVITO_CLIENT_SECRET=<получить в личном кабинете Avito>
```

> **ВАЖНО**: Пароль и другие секреты НЕ хранятся в коде. Только в `.env` и в настройках ERP (зашифрованные в БД).

### Unisender (нужно зарегистрировать)
```env
# .env
UNISENDER_API_KEY=<получить при регистрации>
```

---

## 14. Диаграмма связей моделей

```
                    ┌──────────────┐
                    │ Counterparty │ (accounting)
                    │ type=vendor  │
                    │ subtype=exec │
                    └──────┬───────┘
                           │ 1:1
                    ┌──────┴───────┐
                    │ExecutorProfile│ (marketing)
                    └──┬───┬───┬───┘
                       │   │   │
          ┌────────────┘   │   └────────────┐
          │                │                │
  ┌───────┴──────┐ ┌──────┴───────┐ ┌──────┴──────┐
  │ContactHistory│ │AvitoListing  │ │Campaign     │
  │              │ │(discovered)  │ │Recipient    │
  └──────────────┘ └──────────────┘ └─────────────┘


  ┌──────────────────┐       ┌─────────────────────┐
  │MountingProposal  │ 1:N   │AvitoPublishedListing│
  │(proposals)       │───────│(marketing)           │
  └──────────────────┘       └─────────────────────┘


  Singletons:  AvitoConfig  |  UnisenderConfig
  Справочник:  AvitoSearchKeyword
  Логи:        MarketingSyncLog
```

---

## 15. Открытые вопросы

1. **Категория объявлений на Avito** — в какую категорию публиковать МП? «Предложения услуг» → «Строительство» → «Монтаж»? Нужно исследовать дерево категорий через API.
2. **Avito Messenger** — насколько глубоко интегрировать? На первом этапе — только ссылка на чат, в будущем — встроенный мессенджер в ERP.
3. **Шаблон объявления** — нужно согласовать текст шаблона со Светой перед запуском.
4. **Прикрепление файлов** — Avito поддерживает фото, но не PDF. МП-файл можно прикрепить только в текст (ссылка на скачивание) или отправить через мессенджер.
5. **Unisender** — нужно зарегистрировать аккаунт и подтвердить домен для email-рассылок.
