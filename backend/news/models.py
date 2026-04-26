from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.core.files.storage import default_storage
import os


def get_today_date():
    """Возвращает сегодняшнюю дату (без времени) для использования как default в DateField"""
    return timezone.now().date()

class NewsAuthor(models.Model):
    """Отображаемый автор/редактор новости на публичном HVAC-портале.
    Отдельно от NewsPost.author=User (внутренняя ERP-оркестрация: кто в ERP
    закоммитил запись). На публичной странице показывается avatar + name + role."""

    name = models.CharField(
        _("Name"),
        max_length=200,
        help_text=_("Имя для отображения: «Евгений Лаврентьев»."),
    )
    role = models.CharField(
        _("Role"),
        max_length=200,
        blank=True,
        default="",
        help_text=_("Должность/роль: «Редактор отраслевой ленты»."),
    )
    avatar = models.ImageField(
        _("Avatar"),
        upload_to="news/authors/",
        blank=True,
        null=True,
    )
    is_active = models.BooleanField(_("Is Active"), default=True)
    order = models.PositiveSmallIntegerField(
        _("Order"),
        default=0,
        help_text=_("Порядок в admin-select."),
    )

    class Meta:
        verbose_name = _("News Author")
        verbose_name_plural = _("News Authors")
        ordering = ("order", "name")

    def __str__(self):
        return self.name


class NewsCategory(models.Model):
    """Раздел новостей для публичного HVAC-портала.

    Аддитивно к hardcoded enum ``NewsPost.Category``: CharField ``category``
    продолжает существовать параллельно, FK ``NewsPost.category_ref`` ссылается
    на slug этой модели и синхронизируется с CharField в ``NewsPost.save()``.
    CharField будет удалён отдельным эпиком после стабилизации.

    Удаление — soft: ViewSet переводит ``is_active=False`` вместо ``DELETE``,
    чтобы не осиротеть PROTECT FK на ``NewsPost``.
    """

    slug = models.SlugField(_("Slug"), max_length=50, unique=True)
    name = models.CharField(_("Name"), max_length=100)
    order = models.PositiveSmallIntegerField(
        _("Order"),
        default=0,
        help_text=_("Порядок отображения в UI."),
    )
    is_active = models.BooleanField(
        _("Is Active"),
        default=True,
        help_text=_(
            "Отключённые категории не показываются в picker, но FK на "
            "существующих новостях сохраняется (soft-delete)."
        ),
    )
    created_at = models.DateTimeField(_("Created At"), auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated At"), auto_now=True)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = _("News Category")
        verbose_name_plural = _("News Categories")

    def __str__(self):
        return self.name


class FeaturedNewsSettings(models.Model):
    """Singleton-настройки блока «featured news» на главной hvac-info.

    Содержит ровно одну запись (pk=1). Хранит выбранную категорию,
    из которой главная страница берёт latest published новость для hero-блока.
    Если ``category`` = NULL — берётся latest published из всех категорий
    (текущее поведение по умолчанию).
    """

    category = models.ForeignKey(
        "NewsCategory",
        to_field="slug",
        db_column="category_slug",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("Featured Category"),
        help_text=_(
            "Категория, из которой берётся latest published новость для "
            "hero-блока на главной hvac-info. Если пусто — берётся latest "
            "published из всех категорий (текущее поведение)."
        ),
    )

    created_at = models.DateTimeField(_("Created At"), auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated At"), auto_now=True)

    class Meta:
        verbose_name = _("Настройки главной (featured news)")
        verbose_name_plural = _("Настройки главной (featured news)")

    def save(self, *args, **kwargs):
        # Singleton: всегда pk=1.
        self.pk = 1
        # objects.create() и подобные передают force_insert=True — для singleton'а
        # это означало бы INSERT поверх существующей строки и UniqueViolation;
        # снимаем флаг, чтобы Django пошёл по UPDATE-ветке если pk=1 уже занят.
        kwargs.pop("force_insert", None)
        # Если конструируется новый instance (через FeaturedNewsSettings(...))
        # и в БД уже есть строка pk=1, Django сделает UPDATE — но auto_now_add
        # не сработает повторно, и self.created_at останется None, что нарушит
        # NOT NULL. Подтянем существующее значение, чтобы UPDATE не затирал его.
        if self.created_at is None:
            existing = type(self).objects.filter(pk=1).values_list(
                "created_at", flat=True
            ).first()
            if existing is not None:
                self.created_at = existing
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Запретить удаление singleton'а — просто игнорируем вызов.
        return (0, {})

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        if self.category_id:
            return f"Featured: {self.category_id}"
        return "Featured: (latest from all)"


class NewsPost(models.Model):
    STATUS_CHOICES = [
        ('draft', _('Draft')),
        ('scheduled', _('Scheduled')),
        ('published', _('Published')),
    ]

    class Category(models.TextChoices):
        BUSINESS = "business", _("Деловые")
        INDUSTRY = "industry", _("Индустрия")
        MARKET = "market", _("Рынок")
        REGULATION = "regulation", _("Регулирование")
        REVIEW = "review", _("Обзор")
        GUIDE = "guide", _("Гайд")
        BRANDS = "brands", _("Бренды")
        OTHER = "other", _("Прочее")

    title = models.CharField(_("Title"), max_length=255)
    body = models.TextField(_("Body")) # Markdown content
    source_url = models.URLField(_("Source URL"), blank=True, null=True, help_text=_("URL оригинального источника новости"))
    
    # Связь с производителем (если новость найдена по производителю)
    manufacturer = models.ForeignKey(
        'references.Manufacturer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='news_posts',
        verbose_name=_("Manufacturer"),
        help_text=_("Производитель, по которому была найдена новость")
    )
    
    pub_date = models.DateTimeField(_("Publication Date"), default=timezone.now)
    status = models.CharField(
        _("Status"), 
        max_length=20, 
        choices=STATUS_CHOICES, 
        default='draft',
        help_text=_("Draft: не опубликовано, Scheduled: запланировано, Published: опубликовано")
    )
    source_language = models.CharField(
        _("Source Language"),
        max_length=10,
        default='ru',
        help_text=_("Исходный язык новости (ru, en, de, pt)")
    )
    is_no_news_found = models.BooleanField(
        _("No News Found"),
        default=False,
        help_text=_("Пометка для записей 'новостей не найдено'. Используется для фильтрации и массового удаления на фронтенде.")
    )
    is_deleted = models.BooleanField(
        _("Deleted"),
        default=False,
        help_text=_("Soft-delete: новость скрыта и не будет пересоздана discovery")
    )

    category = models.CharField(
        _("Category"),
        max_length=20,
        choices=Category.choices,
        default=Category.OTHER,
        help_text=_("Категория новости. Показывается как eyebrow-label и chip-filter в ленте."),
    )
    category_ref = models.ForeignKey(
        "NewsCategory",
        to_field="slug",
        db_column="category_ref_slug",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posts",
        verbose_name=_("Category (FK)"),
        help_text=_(
            "FK-вариант category для CRUD-управления разделами. "
            "Синхронизируется с CharField 'category' в save(). "
            "CharField будет удалён отдельным эпиком."
        ),
    )
    lede = models.TextField(
        _("Lede"),
        blank=True,
        default="",
        help_text=_("Вводный абзац (serif 15px) отдельно от body. Если пустой — фронт берёт первые 2 абзаца body."),
    )
    reading_time_minutes = models.PositiveSmallIntegerField(
        _("Reading Time (minutes)"),
        null=True,
        blank=True,
        help_text=_("Оценка времени чтения в минутах. Если null — вычисляется из body при save()."),
    )

    # AI-рейтинг (звёзды 0-5)
    STAR_RATING_CHOICES = [
        (0, _('0 — Не классифицировано')),
        (1, _('1 — Новостей не найдено')),
        (2, _('2 — Не по теме')),
        (3, _('3 — Не интересно')),
        (4, _('4 — Ограниченно интересно')),
        (5, _('5 — Интересно')),
    ]
    star_rating = models.IntegerField(
        _("Star Rating"),
        choices=STAR_RATING_CHOICES,
        null=True,
        blank=True,
        help_text=_("AI-рейтинг (0-5 звёзд). NULL = ещё не оценена.")
    )
    rating_explanation = models.TextField(
        _("Rating Explanation"),
        blank=True,
        default='',
        help_text=_("Объяснение LLM, почему присвоен такой рейтинг")
    )
    matched_criteria = models.JSONField(
        _("Matched Criteria"),
        default=list,
        blank=True,
        help_text=_("Список ID критериев, которые сработали для этой новости")
    )
    duplicate_group = models.ForeignKey(
        'NewsDuplicateGroup',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='news_posts',
        verbose_name=_("Duplicate Group"),
        help_text=_("Группа дубликатов, к которой относится эта новость")
    )

    TRANSLATION_STATUS_CHOICES = [
        ('pending', _('Pending')),
        ('in_progress', _('In progress')),
        ('completed', _('Completed')),
        ('failed', _('Failed')),
    ]
    translation_status = models.CharField(
        _("Translation Status"),
        max_length=16,
        choices=TRANSLATION_STATUS_CHOICES,
        null=True,
        blank=True,
        default=None,
        db_index=True,
        help_text=_("Статус фонового перевода. NULL = перевод не запрашивался."),
    )
    translation_error = models.TextField(
        _("Translation Error"),
        blank=True,
        null=True,
        help_text=_("Последняя ошибка Celery-задачи перевода (если была).")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name=_("Author"),
    )
    editorial_author = models.ForeignKey(
        "NewsAuthor",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="posts",
        verbose_name=_("Editorial Author"),
        help_text=_(
            "Отображаемый автор на публичном HVAC-портале. "
            "Можно оставить пустым — тогда подпись скрывается."
        ),
    )
    mentioned_ac_models = models.ManyToManyField(
        "ac_catalog.ACModel",
        related_name="news_mentions",
        blank=True,
        verbose_name=_("Mentioned AC Models"),
        help_text=_(
            "AC-модели, упомянутые в новости. Показываются как «Упомянутая "
            "модель» card в детальной странице новости и в секции «Упоминания "
            "в прессе» на детальной странице модели AC."
        ),
    )

    # Для хранения оригинального архива (опционально, для истории)
    source_file = models.FileField(upload_to='news/archives/', blank=True, null=True)

    class Meta:
        verbose_name = _("News Post")
        verbose_name_plural = _("News Posts")
        ordering = ['-pub_date']
        indexes = [
            models.Index(fields=['status', '-pub_date']),
            models.Index(fields=['star_rating', 'status', '-pub_date']),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        # Auto-calc reading_time_minutes из body при save если редактор не заполнил вручную.
        # Heuristic: 200 wpm — стандарт editorial. Минимум 1 мин.
        if self.body and self.reading_time_minutes is None:
            word_count = len(self.body.split())
            self.reading_time_minutes = max(1, round(word_count / 200))

        # Sync CharField `category` ↔ FK `category_ref`.
        # Приоритет — category_ref (если задан); иначе подтягиваем FK по slug.
        # При save(update_fields=[...]) синхронизируем только если профильные поля
        # действительно обновляются, чтобы не ломать узкие update_fields-вызовы
        # (translation_status, star_rating и пр. — их save() не должен трогать category).
        update_fields = kwargs.get("update_fields")
        category_touched = (
            update_fields is None
            or "category" in update_fields
            or "category_ref" in update_fields
        )
        if category_touched:
            if self.category_ref_id and self.category != self.category_ref_id:
                self.category = self.category_ref_id
                if update_fields is not None and "category" not in update_fields:
                    kwargs["update_fields"] = list(update_fields) + ["category"]
            elif self.category and not self.category_ref_id:
                try:
                    self.category_ref = NewsCategory.objects.get(slug=self.category)
                    if update_fields is not None and "category_ref" not in update_fields:
                        kwargs["update_fields"] = list(update_fields) + ["category_ref"]
                except NewsCategory.DoesNotExist:
                    # До applied data-migration или при удалении категории — не падаем.
                    pass

        super().save(*args, **kwargs)

    def is_published(self):
        """Проверяет, опубликована ли новость"""
        return (
            self.status == 'published' and 
            self.pub_date <= timezone.now()
        )

class NewsMedia(models.Model):
    """
    Модель для хранения медиа-файлов, привязанных к новости.
    Это позволяет нам удалять файлы при удалении новости.
    """
    news_post = models.ForeignKey(NewsPost, on_delete=models.CASCADE, related_name='media')
    file = models.FileField(upload_to='news/media/')
    media_type = models.CharField(max_length=20, choices=[('image', 'Image'), ('video', 'Video')])
    original_name = models.CharField(max_length=255, help_text="Original filename in the zip")

    def __str__(self):
        return f"{self.media_type}: {self.original_name}"


class Comment(models.Model):
    """
    Модель комментария к новости.
    Пользователи могут создавать, редактировать и удалять свои комментарии.
    """
    news_post = models.ForeignKey(NewsPost, on_delete=models.CASCADE, related_name='comments', verbose_name=_("News Post"))
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='comments',
        verbose_name=_("Author"),
    )
    text = models.TextField(_("Text"), max_length=2000)
    created_at = models.DateTimeField(_("Created At"), auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated At"), auto_now=True)
    
    class Meta:
        verbose_name = _("Comment")
        verbose_name_plural = _("Comments")
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['news_post', '-created_at']),
        ]

    def __str__(self):
        return f"Comment by {self.author.email} on {self.news_post.title[:50]}"


def media_upload_path(instance, filename):
    """Генерирует путь для загрузки медиафайлов: news/uploads/YYYY/MM/filename"""
    year = timezone.now().strftime('%Y')
    month = timezone.now().strftime('%m')
    return f'news/uploads/{year}/{month}/{filename}'


class MediaUpload(models.Model):
    """
    Модель для загрузки медиафайлов через веб-интерфейс.
    Используется для временного хранения файлов перед вставкой в новость.
    """
    MEDIA_TYPE_CHOICES = [
        ('image', 'Image'),
        ('video', 'Video'),
    ]
    
    file = models.FileField(_("File"), upload_to=media_upload_path)
    media_type = models.CharField(_("Media Type"), max_length=20, choices=MEDIA_TYPE_CHOICES, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE, 
        related_name='uploaded_media',
        verbose_name=_("Uploaded By")
    )
    created_at = models.DateTimeField(_("Created At"), auto_now_add=True)
    
    class Meta:
        verbose_name = _("Media Upload")
        verbose_name_plural = _("Media Uploads")
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.media_type}: {os.path.basename(self.file.name)}"
    
    def delete(self, *args, **kwargs):
        """Удаляет файл при удалении записи"""
        if self.file:
            if default_storage.exists(self.file.name):
                default_storage.delete(self.file.name)
        super().delete(*args, **kwargs)


class SearchConfiguration(models.Model):
    """
    Конфигурация параметров поиска новостей.
    Позволяет настраивать все параметры LLM без изменения кода.
    """
    PROVIDER_CHOICES = [
        ('grok', 'Grok (xAI)'),
        ('anthropic', 'Anthropic Claude'),
        ('gemini', 'Google Gemini'),
        ('openai', 'OpenAI GPT'),
    ]
    
    SEARCH_CONTEXT_CHOICES = [
        ('low', 'Low (минимальный контекст, дешевле)'),
        ('medium', 'Medium (баланс)'),
        ('high', 'High (максимальный контекст, дороже)'),
    ]
    
    name = models.CharField(
        _("Configuration Name"),
        max_length=100,
        default="default",
        help_text=_("Название конфигурации для идентификации")
    )
    is_active = models.BooleanField(
        _("Is Active"),
        default=False,
        help_text=_("Только одна конфигурация может быть активной")
    )
    
    # Основной провайдер и цепочка fallback
    primary_provider = models.CharField(
        _("Primary Provider"),
        max_length=20,
        choices=PROVIDER_CHOICES,
        default='grok',
        help_text=_("Основной провайдер для поиска")
    )
    fallback_chain = models.JSONField(
        _("Fallback Chain"),
        default=list,
        blank=True,
        help_text=_("Цепочка резервных провайдеров: ['anthropic', 'gemini', 'openai']")
    )
    
    # LLM параметры
    temperature = models.FloatField(
        _("Temperature"),
        default=0.3,
        help_text=_("Температура LLM (0.0-1.0). Меньше = более детерминированный")
    )
    timeout = models.IntegerField(
        _("Timeout (seconds)"),
        default=120,
        help_text=_("Таймаут запроса к LLM в секундах")
    )
    
    # Grok web search параметры
    max_search_results = models.IntegerField(
        _("Max Search Results"),
        default=5,
        help_text=_("Макс. количество результатов веб-поиска Grok (влияет на стоимость!)")
    )
    search_context_size = models.CharField(
        _("Search Context Size"),
        max_length=10,
        choices=SEARCH_CONTEXT_CHOICES,
        default='low',
        help_text=_("Размер контекста для веб-поиска")
    )
    
    # Модели LLM
    grok_model = models.CharField(
        _("Grok Model"),
        max_length=50,
        default='grok-4-1-fast',
        help_text=_("Модель Grok (xAI)")
    )
    anthropic_model = models.CharField(
        _("Anthropic Model"),
        max_length=50,
        default='claude-3-5-haiku-20241022',
        help_text=_("Модель Anthropic Claude")
    )
    gemini_model = models.CharField(
        _("Gemini Model"),
        max_length=50,
        default='gemini-2.0-flash-exp',
        help_text=_("Модель Google Gemini")
    )
    openai_model = models.CharField(
        _("OpenAI Model"),
        max_length=50,
        default='gpt-4o',
        help_text=_("Модель OpenAI GPT")
    )
    
    # Лимиты
    max_news_per_resource = models.IntegerField(
        _("Max News Per Resource"),
        default=10,
        help_text=_("Максимум новостей с одного источника за один поиск")
    )
    delay_between_requests = models.FloatField(
        _("Delay Between Requests (seconds)"),
        default=0.5,
        help_text=_("Задержка между запросами к API в секундах")
    )
    
    # Тарифы для расчёта стоимости (цена за 1М токенов в USD)
    grok_input_price = models.DecimalField(
        _("Grok Input Price (per 1M tokens)"),
        max_digits=10,
        decimal_places=4,
        default=3.0,
        help_text=_("Цена за 1М входных токенов Grok в USD")
    )
    grok_output_price = models.DecimalField(
        _("Grok Output Price (per 1M tokens)"),
        max_digits=10,
        decimal_places=4,
        default=15.0,
        help_text=_("Цена за 1М выходных токенов Grok в USD")
    )
    anthropic_input_price = models.DecimalField(
        _("Anthropic Input Price (per 1M tokens)"),
        max_digits=10,
        decimal_places=4,
        default=0.80,
        help_text=_("Цена за 1М входных токенов Anthropic в USD")
    )
    anthropic_output_price = models.DecimalField(
        _("Anthropic Output Price (per 1M tokens)"),
        max_digits=10,
        decimal_places=4,
        default=4.0,
        help_text=_("Цена за 1М выходных токенов Anthropic в USD")
    )
    gemini_input_price = models.DecimalField(
        _("Gemini Input Price (per 1M tokens)"),
        max_digits=10,
        decimal_places=4,
        default=0.075,
        help_text=_("Цена за 1М входных токенов Gemini в USD")
    )
    gemini_output_price = models.DecimalField(
        _("Gemini Output Price (per 1M tokens)"),
        max_digits=10,
        decimal_places=4,
        default=0.30,
        help_text=_("Цена за 1М выходных токенов Gemini в USD")
    )
    openai_input_price = models.DecimalField(
        _("OpenAI Input Price (per 1M tokens)"),
        max_digits=10,
        decimal_places=4,
        default=2.50,
        help_text=_("Цена за 1М входных токенов OpenAI в USD")
    )
    openai_output_price = models.DecimalField(
        _("OpenAI Output Price (per 1M tokens)"),
        max_digits=10,
        decimal_places=4,
        default=10.0,
        help_text=_("Цена за 1М выходных токенов OpenAI в USD")
    )
    
    # Промпты (JSON) — если пустой {}, используются дефолтные из кода
    prompts = models.JSONField(
        _("Prompts"),
        default=dict,
        blank=True,
        help_text=_("Все промпты: system_prompts, search_prompts, manufacturer_prompts. Пустой {} = дефолтные промпты.")
    )
    
    created_at = models.DateTimeField(_("Created At"), auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated At"), auto_now=True)
    
    class Meta:
        verbose_name = _("Search Configuration")
        verbose_name_plural = _("Search Configurations")
        ordering = ['-is_active', '-updated_at']
    
    def __str__(self):
        active = " ✓" if self.is_active else ""
        return f"{self.name}{active}"
    
    def save(self, *args, **kwargs):
        """При активации конфигурации деактивируем остальные"""
        if self.is_active:
            SearchConfiguration.objects.exclude(pk=self.pk).update(is_active=False)
        super().save(*args, **kwargs)
    
    @classmethod
    def get_active(cls):
        """Возвращает активную конфигурацию или создаёт дефолтную"""
        config = cls.objects.filter(is_active=True).first()
        if not config:
            config = cls.objects.first()
            if config:
                config.is_active = True
                config.save()
            else:
                config = cls.objects.create(name="default", is_active=True)
        return config
    
    def get_price(self, provider: str, token_type: str) -> float:
        """Возвращает цену за 1М токенов для провайдера"""
        field_name = f"{provider}_{token_type}_price"
        return float(getattr(self, field_name, 0))
    
    def to_dict(self) -> dict:
        """Возвращает снимок конфигурации как словарь"""
        return {
            'name': self.name,
            'primary_provider': self.primary_provider,
            'fallback_chain': self.fallback_chain,
            'temperature': self.temperature,
            'timeout': self.timeout,
            'max_search_results': self.max_search_results,
            'search_context_size': self.search_context_size,
            'grok_model': self.grok_model,
            'anthropic_model': self.anthropic_model,
            'gemini_model': self.gemini_model,
            'openai_model': self.openai_model,
            'max_news_per_resource': self.max_news_per_resource,
            'delay_between_requests': self.delay_between_requests,
            'prompts': self.prompts or {},
            'prices': {
                'grok': {'input': float(self.grok_input_price), 'output': float(self.grok_output_price)},
                'anthropic': {'input': float(self.anthropic_input_price), 'output': float(self.anthropic_output_price)},
                'gemini': {'input': float(self.gemini_input_price), 'output': float(self.gemini_output_price)},
                'openai': {'input': float(self.openai_input_price), 'output': float(self.openai_output_price)},
            }
        }


class NewsDiscoveryRun(models.Model):
    """
    Модель для отслеживания запусков поиска новостей.
    Хранит историю с полными метриками и снимком конфигурации.
    """
    last_search_date = models.DateField(
        _("Last Search Date"),
        default=get_today_date,
        help_text=_("Дата последнего успешного поиска новостей")
    )
    
    # Снимок конфигурации на момент запуска
    config_snapshot = models.JSONField(
        _("Config Snapshot"),
        null=True,
        blank=True,
        help_text=_("Копия конфигурации на момент запуска поиска")
    )
    
    # Временные метрики
    started_at = models.DateTimeField(
        _("Started At"),
        null=True,
        blank=True,
        help_text=_("Время начала поиска")
    )
    finished_at = models.DateTimeField(
        _("Finished At"),
        null=True,
        blank=True,
        help_text=_("Время завершения поиска")
    )
    
    # Метрики API
    total_requests = models.IntegerField(
        _("Total Requests"),
        default=0,
        help_text=_("Общее количество запросов к API")
    )
    total_input_tokens = models.IntegerField(
        _("Total Input Tokens"),
        default=0,
        help_text=_("Общее количество входных токенов")
    )
    total_output_tokens = models.IntegerField(
        _("Total Output Tokens"),
        default=0,
        help_text=_("Общее количество выходных токенов")
    )
    estimated_cost_usd = models.DecimalField(
        _("Estimated Cost (USD)"),
        max_digits=10,
        decimal_places=4,
        default=0,
        help_text=_("Расчётная стоимость в USD")
    )
    
    # Метрики по провайдерам
    provider_stats = models.JSONField(
        _("Provider Stats"),
        default=dict,
        blank=True,
        help_text=_("Статистика по провайдерам: {provider: {requests, input_tokens, output_tokens, cost, errors}}")
    )
    
    # Результаты
    news_found = models.IntegerField(
        _("News Found"),
        default=0,
        help_text=_("Количество найденных новостей")
    )
    news_duplicates = models.IntegerField(
        _("News Duplicates"),
        default=0,
        help_text=_("Количество дубликатов (пропущенных)")
    )
    resources_processed = models.IntegerField(
        _("Resources Processed"),
        default=0,
        help_text=_("Количество обработанных ресурсов")
    )
    resources_failed = models.IntegerField(
        _("Resources Failed"),
        default=0,
        help_text=_("Количество ресурсов с ошибками")
    )
    
    created_at = models.DateTimeField(_("Created At"), auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated At"), auto_now=True)
    
    class Meta:
        verbose_name = _("News Discovery Run")
        verbose_name_plural = _("News Discovery Runs")
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
        ]
    
    def __str__(self):
        cost = f"${self.estimated_cost_usd:.2f}" if self.estimated_cost_usd else "$0"
        return f"Run {self.created_at.strftime('%Y-%m-%d %H:%M')} - {self.news_found} news, {cost}"
    
    def get_duration_seconds(self) -> int:
        """Возвращает длительность поиска в секундах"""
        if self.started_at and self.finished_at:
            return int((self.finished_at - self.started_at).total_seconds())
        return 0
    
    def get_duration_display(self) -> str:
        """Возвращает длительность в формате HH:MM:SS"""
        seconds = self.get_duration_seconds()
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    
    def get_efficiency(self) -> float:
        """Возвращает эффективность: новости / доллар"""
        if self.estimated_cost_usd and self.estimated_cost_usd > 0:
            return float(self.news_found / float(self.estimated_cost_usd))
        return 0
    
    @classmethod
    def get_last_search_date(cls):
        """Возвращает дату последнего поиска или сегодняшнюю дату, если поисков еще не было"""
        last_run = cls.objects.first()
        if last_run:
            return last_run.last_search_date
        return timezone.now().date()
    
    @classmethod
    def update_last_search_date(cls, date=None):
        """Обновляет дату последнего поиска"""
        if date is None:
            date = timezone.now().date()
        
        last_run = cls.objects.first()
        if last_run:
            last_run.last_search_date = date
            last_run.save()
        else:
            cls.objects.create(last_search_date=date)
    
    @classmethod
    def start_new_run(cls, config: 'SearchConfiguration' = None):
        """Создаёт новый запуск поиска с конфигурацией"""
        if config is None:
            config = SearchConfiguration.get_active()
        
        return cls.objects.create(
            last_search_date=timezone.now().date(),
            config_snapshot=config.to_dict() if config else None,
            started_at=timezone.now(),
            provider_stats={}
        )
    
    def finish(self):
        """Завершает запуск поиска"""
        self.finished_at = timezone.now()
        self.save()
    
    def add_api_call(self, provider: str, input_tokens: int, output_tokens: int, 
                     cost: float, success: bool = True):
        """Добавляет статистику вызова API"""
        if provider not in self.provider_stats:
            self.provider_stats[provider] = {
                'requests': 0,
                'input_tokens': 0,
                'output_tokens': 0,
                'cost': 0,
                'errors': 0
            }
        
        stats = self.provider_stats[provider]
        stats['requests'] += 1
        stats['input_tokens'] += input_tokens
        stats['output_tokens'] += output_tokens
        stats['cost'] += cost
        if not success:
            stats['errors'] += 1
        
        self.total_requests += 1
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens
        self.estimated_cost_usd = float(self.estimated_cost_usd) + cost
        self.save()


class DiscoveryAPICall(models.Model):
    """
    Детальная запись каждого вызова API при поиске новостей.
    Позволяет анализировать эффективность по источникам и провайдерам.
    """
    discovery_run = models.ForeignKey(
        NewsDiscoveryRun,
        on_delete=models.CASCADE,
        related_name='api_calls',
        verbose_name=_("Discovery Run")
    )
    resource = models.ForeignKey(
        'references.NewsResource',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='discovery_calls',
        verbose_name=_("Resource")
    )
    manufacturer = models.ForeignKey(
        'references.Manufacturer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='discovery_calls',
        verbose_name=_("Manufacturer")
    )
    
    provider = models.CharField(
        _("Provider"),
        max_length=20,
        help_text=_("Провайдер LLM")
    )
    model = models.CharField(
        _("Model"),
        max_length=50,
        help_text=_("Использованная модель")
    )
    
    input_tokens = models.IntegerField(
        _("Input Tokens"),
        default=0
    )
    output_tokens = models.IntegerField(
        _("Output Tokens"),
        default=0
    )
    cost_usd = models.DecimalField(
        _("Cost (USD)"),
        max_digits=10,
        decimal_places=6,
        default=0
    )
    
    duration_ms = models.IntegerField(
        _("Duration (ms)"),
        default=0,
        help_text=_("Время выполнения запроса в миллисекундах")
    )
    success = models.BooleanField(
        _("Success"),
        default=True
    )
    error_message = models.TextField(
        _("Error Message"),
        blank=True,
        default=''
    )
    
    news_extracted = models.IntegerField(
        _("News Extracted"),
        default=0,
        help_text=_("Количество новостей, извлечённых из этого запроса")
    )
    
    created_at = models.DateTimeField(_("Created At"), auto_now_add=True)
    
    class Meta:
        verbose_name = _("Discovery API Call")
        verbose_name_plural = _("Discovery API Calls")
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['discovery_run', '-created_at']),
            models.Index(fields=['provider', '-created_at']),
        ]
    
    def __str__(self):
        target = self.resource.name if self.resource else (self.manufacturer.name if self.manufacturer else "Unknown")
        return f"{self.provider}: {target} - {self.news_extracted} news"


class NewsDiscoveryStatus(models.Model):
    """
    Модель для отслеживания текущего статуса поиска новостей.
    Используется для индикатора прогресса в админ-интерфейсе.
    """
    STATUS_CHOICES = [
        ('running', _('Running')),
        ('completed', _('Completed')),
        ('error', _('Error')),
    ]
    
    SEARCH_TYPE_CHOICES = [
        ('resources', _('Resources')),
        ('manufacturers', _('Manufacturers')),
    ]
    
    search_type = models.CharField(
        _("Search Type"),
        max_length=20,
        choices=SEARCH_TYPE_CHOICES,
        default='resources',
        help_text=_("Тип поиска: источники или производители")
    )
    
    processed_count = models.IntegerField(
        _("Processed Count"),
        default=0,
        help_text=_("Количество обработанных источников/производителей")
    )
    total_count = models.IntegerField(
        _("Total Count"),
        default=0,
        help_text=_("Общее количество источников/производителей для обработки")
    )
    status = models.CharField(
        _("Status"),
        max_length=20,
        choices=STATUS_CHOICES,
        default='running',
        help_text=_("Статус процесса поиска")
    )
    provider = models.CharField(
        _("Provider"),
        max_length=20,
        choices=[
            ('auto', _('Автоматический выбор (цепочка)')),
            ('grok', _('Grok 4.1 Fast')),
            ('anthropic', _('Anthropic Claude Haiku 4.5')),
            ('openai', _('OpenAI GPT-5.2')),
        ],
        default='auto',
        help_text=_("Провайдер LLM для поиска новостей")
    )
    created_at = models.DateTimeField(_("Created At"), auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated At"), auto_now=True)
    
    class Meta:
        verbose_name = _("News Discovery Status")
        verbose_name_plural = _("News Discovery Statuses")
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['search_type', 'status']),
        ]
    
    def __str__(self):
        return f"Status: {self.status} ({self.processed_count}/{self.total_count})"
    
    def get_progress_percent(self):
        """Возвращает процент выполнения (0-100)"""
        if self.total_count == 0:
            return 0
        return int((self.processed_count / self.total_count) * 100)
    
    @classmethod
    def get_current_status(cls, search_type='resources'):
        """Возвращает текущий статус для указанного типа поиска или None"""
        return cls.objects.filter(status='running', search_type=search_type).first()
    
    @classmethod
    def create_new_status(cls, total_count, search_type='resources', provider='auto'):
        """Создает новый статус для начала поиска"""
        # Закрываем все предыдущие running статусы для этого типа поиска
        cls.objects.filter(status='running', search_type=search_type).update(status='completed')
        return cls.objects.create(
            total_count=total_count,
            search_type=search_type,
            provider=provider,
            processed_count=0,
            status='running'
        )


# ============================================================================
# AI-рейтинг новостей
# ============================================================================

class NewsDuplicateGroup(models.Model):
    """
    Группа дубликатов новостей.
    Когда одна и та же новость найдена в нескольких источниках,
    они объединяются в группу с общим текстом.
    """
    merged_title = models.CharField(
        _("Merged Title"),
        max_length=500,
        blank=True,
        help_text=_("Объединённый заголовок из всех дубликатов")
    )
    merged_body = models.TextField(
        _("Merged Body"),
        blank=True,
        help_text=_("Объединённый текст из всех дубликатов (сформирован LLM)")
    )
    source_count = models.IntegerField(
        _("Source Count"),
        default=0,
        help_text=_("Количество источников, в которых найдена новость")
    )
    created_at = models.DateTimeField(_("Created At"), auto_now_add=True)

    class Meta:
        verbose_name = _("News Duplicate Group")
        verbose_name_plural = _("News Duplicate Groups")
        ordering = ['-created_at']

    def __str__(self):
        return f"Duplicate Group: {self.merged_title[:80]} ({self.source_count} sources)"


class RatingCriterion(models.Model):
    """
    Настраиваемый критерий оценки новостей.
    Критерии организованы по уровням звёзд и могут быть двухуровневыми:
    - Уровень 1: если критерий сработал → базовый star_rating
    - Уровень 2 (дочерний): если сработал И родитель И ребёнок → override_star_rating
    """
    STAR_RATING_CHOICES = [
        (0, _('0 — Не классифицировано')),
        (2, _('2 — Не по теме')),
        (3, _('3 — Не интересно')),
        (4, _('4 — Ограниченно интересно')),
        (5, _('5 — Интересно')),
    ]

    star_rating = models.IntegerField(
        _("Star Rating"),
        choices=STAR_RATING_CHOICES,
        help_text=_("Уровень звёзд, к которому относится критерий")
    )
    name = models.CharField(
        _("Name"),
        max_length=255,
        help_text=_("Короткое имя критерия для отображения в списке")
    )
    description = models.TextField(
        _("Description"),
        help_text=_("Полное описание критерия для промпта LLM. "
                   "Чем подробнее, тем точнее будет оценка.")
    )
    keywords = models.JSONField(
        _("Keywords"),
        default=list,
        blank=True,
        help_text=_("Подсказки по ключевым словам: ['назначение', 'увольнение', 'CEO']")
    )
    is_active = models.BooleanField(
        _("Is Active"),
        default=True,
        help_text=_("Неактивные критерии не участвуют в оценке")
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        verbose_name=_("Parent Criterion"),
        help_text=_("Родительский критерий для двухуровневой оценки")
    )
    override_star_rating = models.IntegerField(
        _("Override Star Rating"),
        null=True,
        blank=True,
        help_text=_("Если сработал И родитель И этот критерий, "
                   "используем этот рейтинг вместо родительского")
    )
    order = models.IntegerField(
        _("Order"),
        default=0,
        help_text=_("Порядок отображения в списке")
    )
    created_at = models.DateTimeField(_("Created At"), auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated At"), auto_now=True)

    class Meta:
        verbose_name = _("Rating Criterion")
        verbose_name_plural = _("Rating Criteria")
        ordering = ['star_rating', 'order', 'name']
        indexes = [
            models.Index(fields=['star_rating', 'is_active']),
        ]

    def __str__(self):
        stars = '★' * self.star_rating
        parent_info = f" → {self.override_star_rating}★" if self.parent and self.override_star_rating else ""
        return f"{stars} {self.name}{parent_info}"


class RatingConfiguration(models.Model):
    """
    Конфигурация AI-рейтинга новостей.
    Аналогична SearchConfiguration, но для процесса оценки.
    """
    PROVIDER_CHOICES = [
        ('grok', 'Grok (xAI)'),
        ('anthropic', 'Anthropic Claude'),
        ('gemini', 'Google Gemini'),
        ('openai', 'OpenAI GPT'),
    ]

    name = models.CharField(
        _("Configuration Name"),
        max_length=100,
        default="default",
        help_text=_("Название конфигурации для идентификации")
    )
    is_active = models.BooleanField(
        _("Is Active"),
        default=False,
        help_text=_("Только одна конфигурация может быть активной")
    )

    # Основной провайдер и цепочка fallback
    primary_provider = models.CharField(
        _("Primary Provider"),
        max_length=20,
        choices=PROVIDER_CHOICES,
        default='grok',
        help_text=_("Основной провайдер для оценки")
    )
    fallback_chain = models.JSONField(
        _("Fallback Chain"),
        default=list,
        blank=True,
        help_text=_("Цепочка резервных провайдеров: ['anthropic', 'gemini', 'openai']")
    )

    # LLM параметры
    temperature = models.FloatField(
        _("Temperature"),
        default=0.2,
        help_text=_("Температура LLM (0.0-1.0). Для рейтинга рекомендуется низкая (0.1-0.3)")
    )
    timeout = models.IntegerField(
        _("Timeout (seconds)"),
        default=120,
        help_text=_("Таймаут запроса к LLM в секундах")
    )

    # Модели LLM
    grok_model = models.CharField(_("Grok Model"), max_length=50, default='grok-4-1-fast')
    anthropic_model = models.CharField(_("Anthropic Model"), max_length=50, default='claude-haiku-4-5')
    gemini_model = models.CharField(_("Gemini Model"), max_length=50, default='gemini-2.5-flash')
    openai_model = models.CharField(_("OpenAI Model"), max_length=50, default='gpt-4.1-mini')

    # Настройки рейтинга
    batch_size = models.IntegerField(
        _("Batch Size"),
        default=10,
        help_text=_("Количество новостей в одном батче для LLM (10-20)")
    )
    duplicate_similarity_threshold = models.FloatField(
        _("Duplicate Similarity Threshold"),
        default=0.75,
        help_text=_("Порог схожести заголовков для определения дубликатов (0.0-1.0)")
    )

    # Тарифы для расчёта стоимости (цена за 1М токенов в USD)
    grok_input_price = models.DecimalField(_("Grok Input Price"), max_digits=10, decimal_places=4, default=0.20)
    grok_output_price = models.DecimalField(_("Grok Output Price"), max_digits=10, decimal_places=4, default=0.50)
    anthropic_input_price = models.DecimalField(_("Anthropic Input Price"), max_digits=10, decimal_places=4, default=1.00)
    anthropic_output_price = models.DecimalField(_("Anthropic Output Price"), max_digits=10, decimal_places=4, default=5.00)
    gemini_input_price = models.DecimalField(_("Gemini Input Price"), max_digits=10, decimal_places=4, default=0.30)
    gemini_output_price = models.DecimalField(_("Gemini Output Price"), max_digits=10, decimal_places=4, default=2.50)
    openai_input_price = models.DecimalField(_("OpenAI Input Price"), max_digits=10, decimal_places=4, default=0.40)
    openai_output_price = models.DecimalField(_("OpenAI Output Price"), max_digits=10, decimal_places=4, default=1.60)

    # Промпты (JSON)
    prompts = models.JSONField(
        _("Prompts"),
        default=dict,
        blank=True,
        help_text=_("Промпты для рейтинга: {system_prompt, rating_prompt, duplicate_prompt, merge_prompt}. "
                   "Пустой {} = дефолтные промпты.")
    )

    created_at = models.DateTimeField(_("Created At"), auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated At"), auto_now=True)

    class Meta:
        verbose_name = _("Rating Configuration")
        verbose_name_plural = _("Rating Configurations")
        ordering = ['-is_active', '-updated_at']

    def __str__(self):
        active = " ✓" if self.is_active else ""
        return f"{self.name}{active}"

    def save(self, *args, **kwargs):
        """При активации конфигурации деактивируем остальные"""
        if self.is_active:
            RatingConfiguration.objects.exclude(pk=self.pk).update(is_active=False)
        super().save(*args, **kwargs)

    @classmethod
    def get_active(cls):
        """Возвращает активную конфигурацию или создаёт дефолтную"""
        config = cls.objects.filter(is_active=True).first()
        if not config:
            config = cls.objects.first()
            if config:
                config.is_active = True
                config.save()
            else:
                config = cls.objects.create(name="default", is_active=True)
        return config

    def get_price(self, provider: str, token_type: str) -> float:
        """Возвращает цену за 1М токенов для провайдера"""
        field_name = f"{provider}_{token_type}_price"
        return float(getattr(self, field_name, 0))

    def to_dict(self) -> dict:
        """Возвращает снимок конфигурации как словарь"""
        return {
            'name': self.name,
            'primary_provider': self.primary_provider,
            'fallback_chain': self.fallback_chain,
            'temperature': self.temperature,
            'timeout': self.timeout,
            'grok_model': self.grok_model,
            'anthropic_model': self.anthropic_model,
            'gemini_model': self.gemini_model,
            'openai_model': self.openai_model,
            'batch_size': self.batch_size,
            'duplicate_similarity_threshold': self.duplicate_similarity_threshold,
            'prompts': self.prompts or {},
            'prices': {
                'grok': {'input': float(self.grok_input_price), 'output': float(self.grok_output_price)},
                'anthropic': {'input': float(self.anthropic_input_price), 'output': float(self.anthropic_output_price)},
                'gemini': {'input': float(self.gemini_input_price), 'output': float(self.gemini_output_price)},
                'openai': {'input': float(self.openai_input_price), 'output': float(self.openai_output_price)},
            }
        }


class RatingRun(models.Model):
    """
    Запуск AI-рейтинга новостей.
    Аналогичен NewsDiscoveryRun, но для процесса оценки.
    """
    discovery_run = models.ForeignKey(
        NewsDiscoveryRun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rating_runs',
        verbose_name=_("Discovery Run"),
        help_text=_("Discovery-запуск, после которого был запущен рейтинг")
    )
    config_snapshot = models.JSONField(
        _("Config Snapshot"),
        null=True,
        blank=True,
        help_text=_("Копия конфигурации рейтинга на момент запуска")
    )

    started_at = models.DateTimeField(_("Started At"), null=True, blank=True)
    finished_at = models.DateTimeField(_("Finished At"), null=True, blank=True)

    # Метрики
    total_news_rated = models.IntegerField(_("Total News Rated"), default=0)
    total_requests = models.IntegerField(_("Total Requests"), default=0)
    total_input_tokens = models.IntegerField(_("Total Input Tokens"), default=0)
    total_output_tokens = models.IntegerField(_("Total Output Tokens"), default=0)
    estimated_cost_usd = models.DecimalField(
        _("Estimated Cost (USD)"),
        max_digits=10,
        decimal_places=4,
        default=0
    )
    provider_stats = models.JSONField(
        _("Provider Stats"),
        default=dict,
        blank=True
    )
    rating_distribution = models.JSONField(
        _("Rating Distribution"),
        default=dict,
        blank=True,
        help_text=_('Распределение по звёздам: {"0": 5, "1": 20, "2": 50, "3": 200, "4": 30, "5": 10}')
    )
    duplicates_found = models.IntegerField(_("Duplicates Found"), default=0)

    # Статус
    STATUS_CHOICES = [
        ('running', _('Running')),
        ('completed', _('Completed')),
        ('error', _('Error')),
    ]
    status = models.CharField(
        _("Status"),
        max_length=20,
        choices=STATUS_CHOICES,
        default='running'
    )
    error_message = models.TextField(_("Error Message"), blank=True, default='')

    # Прогресс
    total_to_rate = models.IntegerField(_("Total To Rate"), default=0,
        help_text=_("Общее количество новостей для оценки"))
    processed_count = models.IntegerField(_("Processed Count"), default=0,
        help_text=_("Количество уже обработанных новостей"))
    current_phase = models.CharField(_("Current Phase"), max_length=100, blank=True, default='',
        help_text=_("Текущий этап: quick_rules / llm_rating / duplicates / completed"))

    created_at = models.DateTimeField(_("Created At"), auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated At"), auto_now=True)

    class Meta:
        verbose_name = _("Rating Run")
        verbose_name_plural = _("Rating Runs")
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        cost = f"${self.estimated_cost_usd:.2f}" if self.estimated_cost_usd else "$0"
        return f"Rating Run {self.created_at.strftime('%Y-%m-%d %H:%M')} - {self.total_news_rated} rated, {cost}"

    def get_duration_seconds(self) -> int:
        if self.started_at and self.finished_at:
            return int((self.finished_at - self.started_at).total_seconds())
        return 0

    def get_duration_display(self) -> str:
        seconds = self.get_duration_seconds()
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"

    @classmethod
    def start_new_run(cls, config: 'RatingConfiguration' = None, discovery_run=None):
        """Создаёт новый запуск рейтинга"""
        if config is None:
            config = RatingConfiguration.get_active()
        return cls.objects.create(
            discovery_run=discovery_run,
            config_snapshot=config.to_dict() if config else None,
            started_at=timezone.now(),
            provider_stats={}
        )

    def finish(self, error_message=''):
        """Завершает запуск рейтинга"""
        self.finished_at = timezone.now()
        self.status = 'error' if error_message else 'completed'
        self.error_message = error_message
        self.current_phase = 'completed'
        self.save()

    def update_progress(self, processed: int, total: int, phase: str):
        """Обновляет прогресс выполнения"""
        self.processed_count = processed
        self.total_to_rate = total
        self.current_phase = phase
        self.save(update_fields=['processed_count', 'total_to_rate', 'current_phase', 'updated_at'])

    def add_api_call(self, provider: str, input_tokens: int, output_tokens: int,
                     cost: float, success: bool = True):
        """Добавляет статистику вызова API"""
        if provider not in self.provider_stats:
            self.provider_stats[provider] = {
                'requests': 0, 'input_tokens': 0, 'output_tokens': 0,
                'cost': 0, 'errors': 0
            }
        stats = self.provider_stats[provider]
        stats['requests'] += 1
        stats['input_tokens'] += input_tokens
        stats['output_tokens'] += output_tokens
        stats['cost'] += cost
        if not success:
            stats['errors'] += 1

        self.total_requests += 1
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens
        self.estimated_cost_usd = float(self.estimated_cost_usd) + cost
        self.save()
