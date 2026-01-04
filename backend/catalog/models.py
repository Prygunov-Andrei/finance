from django.db import models
from django.core.exceptions import ValidationError
from core.models import TimestampedModel


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
        """Нормализует название для поиска"""
        import re
        # Lowercase
        normalized = name.lower()
        # Удаляем спецсимволы, оставляем буквы, цифры, пробелы
        normalized = re.sub(r'[^\w\s]', ' ', normalized)
        # Убираем множественные пробелы
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        return normalized


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
