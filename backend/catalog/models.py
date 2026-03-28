from django.db import models
from django.core.exceptions import ValidationError
from core.models import TimestampedModel
from core.text_utils import normalize_name as _normalize_name


class Category(TimestampedModel):
    """Категория товаров/услуг с неограниченной вложенностью"""
    
    name = models.CharField(max_length=255, verbose_name='Название')
    code = models.CharField(
        max_length=100, 
        unique=True, 
        verbose_name='Код',
        help_text='Уникальный код категории (например: ventilation_fans)'
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        related_name='children',
        null=True,
        blank=True,
        verbose_name='Родительская категория'
    )
    description = models.TextField(blank=True, verbose_name='Описание')
    level = models.PositiveIntegerField(
        default=0,
        verbose_name='Уровень вложенности',
        help_text='Автоматически рассчитывается при сохранении'
    )
    sort_order = models.PositiveIntegerField(default=0, verbose_name='Порядок сортировки')
    is_active = models.BooleanField(default=True, verbose_name='Активна')

    class Meta:
        verbose_name = 'Категория товаров'
        verbose_name_plural = 'Категории товаров'
        ordering = ['level', 'sort_order', 'name']
        indexes = [
            models.Index(fields=['parent', 'is_active']),
            models.Index(fields=['code']),
        ]

    def __str__(self):
        return self.get_full_path()

    def get_full_path(self) -> str:
        """Возвращает полный путь: Родитель → Ребёнок → ..."""
        if self.parent:
            return f"{self.parent.get_full_path()} → {self.name}"
        return self.name

    def clean(self):
        # Проверка на циклическую ссылку
        if self.parent:
            parent = self.parent
            while parent:
                if parent.pk == self.pk:
                    raise ValidationError('Нельзя создать циклическую ссылку')
                parent = parent.parent

    def save(self, *args, **kwargs):
        # Автоматический расчёт уровня
        if self.parent:
            self.level = self.parent.level + 1
        else:
            self.level = 0
        super().save(*args, **kwargs)


class Product(TimestampedModel):
    """Товар или услуга из счетов"""
    
    class Status(models.TextChoices):
        NEW = 'new', 'Новый'
        VERIFIED = 'verified', 'Проверен'
        MERGED = 'merged', 'Объединён'
        ARCHIVED = 'archived', 'Архив'

    name = models.CharField(max_length=500, verbose_name='Наименование')
    normalized_name = models.CharField(
        max_length=500,
        db_index=True,
        verbose_name='Нормализованное название',
        help_text='Lowercase, без спецсимволов, для поиска'
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        related_name='products',
        null=True,
        blank=True,
        verbose_name='Категория'
    )
    default_unit = models.CharField(
        max_length=20,
        default='шт',
        verbose_name='Единица измерения по умолчанию'
    )
    is_service = models.BooleanField(
        default=False,
        verbose_name='Это услуга',
        help_text='Услуга, а не товар'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
        verbose_name='Статус'
    )
    merged_into = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        related_name='merged_products',
        null=True,
        blank=True,
        verbose_name='Объединён в',
        help_text='Если товар объединён с другим'
    )
    created_from_payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_products',
        verbose_name='Создан из платежа'
    )

    # --- Обогащённые поля (из каталогов поставщиков) ---
    images = models.JSONField(
        default=list, blank=True,
        verbose_name='Изображения',
        help_text='Список URL-ов изображений товара'
    )
    booklet_url = models.URLField(
        blank=True, verbose_name='Буклет (PDF)'
    )
    manual_url = models.URLField(
        blank=True, verbose_name='Инструкция (PDF)'
    )
    description = models.TextField(
        blank=True, verbose_name='Описание'
    )
    brand = models.CharField(
        max_length=255, blank=True, verbose_name='Бренд'
    )
    series = models.CharField(
        max_length=255, blank=True, verbose_name='Серия'
    )
    tech_specs = models.JSONField(
        default=dict, blank=True,
        verbose_name='Технические характеристики',
        help_text='Словарь ТХ: {"Мощность": "2.5 кВт", ...}'
    )
    default_work_item = models.ForeignKey(
        'pricelists.WorkItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='default_for_products',
        verbose_name='Расценка по умолчанию',
        help_text='Если указана — используется при подборе работ без дополнительного поиска'
    )

    class Meta:
        verbose_name = 'Товар/Услуга'
        verbose_name_plural = 'Товары/Услуги'
        ordering = ['name']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['normalized_name']),
            models.Index(fields=['category', 'status']),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # Нормализация названия
        self.normalized_name = self.normalize_name(self.name)
        super().save(*args, **kwargs)

    @staticmethod
    def normalize_name(name: str) -> str:
        """Нормализует название для поиска.

        Делегирует в core.text_utils.normalize_name (без strip_legal_forms).
        """
        return _normalize_name(name)


class ProductAlias(TimestampedModel):
    """Альтернативные названия товара из разных счетов"""
    
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='aliases',
        verbose_name='Товар'
    )
    alias_name = models.CharField(max_length=500, verbose_name='Альтернативное название')
    normalized_alias = models.CharField(
        max_length=500,
        db_index=True,
        verbose_name='Нормализованный алиас'
    )
    source_payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_aliases',
        verbose_name='Источник (платёж)'
    )

    class Meta:
        verbose_name = 'Синоним товара'
        verbose_name_plural = 'Синонимы товаров'
        unique_together = [['product', 'normalized_alias']]

    def __str__(self):
        return f"{self.alias_name} → {self.product.name}"

    def save(self, *args, **kwargs):
        self.normalized_alias = Product.normalize_name(self.alias_name)
        super().save(*args, **kwargs)


class ProductPriceHistory(TimestampedModel):
    """История цен товара от разных поставщиков"""
    
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='price_history',
        verbose_name='Товар'
    )
    counterparty = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.CASCADE,
        related_name='product_prices',
        verbose_name='Поставщик'
    )
    price = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Цена за единицу'
    )
    unit = models.CharField(max_length=20, verbose_name='Единица измерения')
    invoice_date = models.DateField(verbose_name='Дата счёта')
    invoice_number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Номер счёта'
    )
    payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_prices',
        verbose_name='Платёж-источник'
    )
    invoice = models.ForeignKey(
        'payments.Invoice',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_prices',
        verbose_name='Счёт-источник'
    )

    class Meta:
        verbose_name = 'История цены товара'
        verbose_name_plural = 'История цен товаров'
        ordering = ['-invoice_date']
        indexes = [
            models.Index(fields=['product', 'invoice_date']),
            models.Index(fields=['counterparty']),
        ]

    def __str__(self):
        return f"{self.product.name} @ {self.price} {self.unit} ({self.counterparty.name})"


class ProductWorkMapping(TimestampedModel):
    """Историческое сопоставление товара с работой из прайс-листа.
    Система обучается на решениях сметчика — каждое ручное сопоставление
    увеличивает usage_count, повышая приоритет при автоподборе."""
    
    class Source(models.TextChoices):
        MANUAL = 'manual', 'Ручное сопоставление'
        RULE = 'rule', 'По правилам категорий'
        LLM = 'llm', 'Подобрано LLM'
    
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='work_mappings',
        verbose_name='Товар'
    )
    work_item = models.ForeignKey(
        'pricelists.WorkItem',
        on_delete=models.CASCADE,
        related_name='product_mappings',
        verbose_name='Работа из прайс-листа'
    )
    confidence = models.FloatField(
        default=1.0,
        verbose_name='Уверенность',
        help_text='1.0 = ручное сопоставление, 0.x = автоматическое'
    )
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.MANUAL,
        verbose_name='Источник'
    )
    usage_count = models.PositiveIntegerField(
        default=1,
        verbose_name='Количество использований'
    )

    class Meta:
        verbose_name = 'Сопоставление товар → работа'
        verbose_name_plural = 'Сопоставления товар → работа'
        unique_together = ('product', 'work_item')
        ordering = ['-usage_count', '-confidence']
        indexes = [
            models.Index(fields=['product', '-usage_count']),
        ]

    def __str__(self):
        return f"{self.product.name} → {self.work_item.name} ({self.usage_count}x)"


class ProductKnowledge(TimestampedModel):
    """База знаний: какие работы нужны для каких товаров/позиций сметы.

    Накапливается автоматически через LLM и веб-поиск, используется при
    будущих подборах работ (Уровень 3 pipeline). Двойное хранение:
    БД (для быстрого поиска) + .md файлы (для ручного редактирования операторами).
    """

    class Source(models.TextChoices):
        LLM = 'llm', 'LLM semantic match'
        WEB = 'web', 'Web search'
        MANUAL = 'manual', 'Ручной ввод'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Ожидает проверки'
        VERIFIED = 'verified', 'Подтверждено сметчиком'
        REJECTED = 'rejected', 'Отклонено'

    item_name_pattern = models.CharField(
        max_length=500,
        db_index=True,
        verbose_name='Нормализованное имя позиции',
        help_text='Normalized form через Product.normalize_name()'
    )
    work_item = models.ForeignKey(
        'pricelists.WorkItem',
        on_delete=models.CASCADE,
        related_name='knowledge_entries',
        verbose_name='Подходящая работа'
    )
    work_section = models.ForeignKey(
        'pricelists.WorkSection',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='knowledge_entries',
        verbose_name='Раздел работ'
    )

    confidence = models.FloatField(
        default=0.5,
        verbose_name='Уверенность (0.0-1.0)'
    )
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        verbose_name='Источник знания'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name='Статус верификации'
    )

    llm_reasoning = models.TextField(
        blank=True,
        verbose_name='Обоснование LLM',
        help_text='Почему LLM выбрал эту работу'
    )
    web_search_query = models.TextField(
        blank=True,
        verbose_name='Поисковый запрос'
    )
    web_search_result_summary = models.TextField(
        blank=True,
        verbose_name='Результат поиска',
        help_text='Краткое содержание найденной информации'
    )

    md_file_path = models.CharField(
        max_length=500,
        blank=True,
        verbose_name='Путь к .md файлу',
        help_text='Относительный путь в data/knowledge/'
    )

    usage_count = models.PositiveIntegerField(
        default=0,
        verbose_name='Количество использований'
    )
    last_used_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Последнее использование'
    )
    verified_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name='Подтвердил'
    )

    class Meta:
        verbose_name = 'Знание о товаре → работе'
        verbose_name_plural = 'База знаний (товар → работа)'
        unique_together = ('item_name_pattern', 'work_item')
        indexes = [
            models.Index(fields=['item_name_pattern', '-confidence']),
            models.Index(fields=['status', '-usage_count']),
        ]

    def __str__(self):
        return f"{self.item_name_pattern} → {self.work_item.name} ({self.get_source_display()})"


class SupplierCatalog(TimestampedModel):
    """PDF-каталог поставщика, загруженный для парсинга через LLM."""

    class Status(models.TextChoices):
        UPLOADED = 'uploaded', 'Загружен'
        DETECTING_TOC = 'detecting_toc', 'Анализ оглавления'
        TOC_READY = 'toc_ready', 'Оглавление готово'
        PARSING = 'parsing', 'Парсинг'
        PARSED = 'parsed', 'Разобран'
        IMPORTING = 'importing', 'Импорт в БД'
        IMPORTED = 'imported', 'Импортирован'
        ERROR = 'error', 'Ошибка'

    name = models.CharField(
        max_length=255,
        verbose_name='Название каталога',
        help_text='Например: Каталог WHEIL v23.1'
    )
    supplier_name = models.CharField(
        max_length=100,
        db_index=True,
        verbose_name='Код поставщика',
        help_text='Латинское имя: galvent, wheil, и т.д.'
    )
    pdf_file = models.FileField(
        upload_to='catalogs/suppliers/',
        verbose_name='PDF-файл каталога'
    )
    json_file = models.FileField(
        upload_to='catalogs/suppliers/',
        blank=True,
        verbose_name='JSON результат парсинга'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.UPLOADED,
        verbose_name='Статус'
    )
    total_pages = models.PositiveIntegerField(
        default=0,
        verbose_name='Всего страниц'
    )

    # Секции (оглавление) — определяются LLM или вручную
    sections = models.JSONField(
        default=list, blank=True,
        verbose_name='Секции каталога',
        help_text='[{name, pages: [start, end], category_code, is_new_category, ...}]'
    )

    # Прогресс парсинга
    current_section = models.PositiveIntegerField(default=0, verbose_name='Текущая секция')
    total_sections = models.PositiveIntegerField(default=0, verbose_name='Всего секций')
    current_batch = models.PositiveIntegerField(default=0, verbose_name='Текущий батч')
    total_batches = models.PositiveIntegerField(default=0, verbose_name='Всего батчей')

    # Результаты
    products_count = models.PositiveIntegerField(default=0, verbose_name='Товаров найдено')
    variants_count = models.PositiveIntegerField(default=0, verbose_name='Вариантов найдено')
    imported_count = models.PositiveIntegerField(default=0, verbose_name='Импортировано в БД')
    categories_created = models.PositiveIntegerField(default=0, verbose_name='Создано категорий')

    # Ошибки и Celery
    errors = models.JSONField(default=list, blank=True, verbose_name='Ошибки парсинга')
    error_message = models.TextField(blank=True, verbose_name='Сообщение об ошибке')
    task_id = models.CharField(max_length=255, blank=True, verbose_name='ID задачи Celery')

    class Meta:
        verbose_name = 'Каталог поставщика'
        verbose_name_plural = 'Каталоги поставщиков'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"
