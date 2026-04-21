from __future__ import annotations

from django.conf import settings
from django.core.validators import MaxLengthValidator, MaxValueValidator, MinValueValidator
from django.db import models

from core.models import TimestampedModel


class EquipmentType(models.Model):
    name = models.CharField(max_length=255, unique=True, verbose_name="Тип оборудования")

    class Meta:
        verbose_name = "Тип оборудования (рейтинг кондиционеров)"
        verbose_name_plural = "Типы оборудования (рейтинг кондиционеров)"

    def __str__(self) -> str:
        return self.name


class ACModel(TimestampedModel):
    class PublishStatus(models.TextChoices):
        DRAFT = "draft", "Черновик"
        REVIEW = "review", "На проверке"
        PUBLISHED = "published", "Опубликован"
        ARCHIVED = "archived", "В архиве"

    brand = models.ForeignKey(
        "ac_brands.Brand", on_delete=models.PROTECT, related_name="models",
        verbose_name="Бренд",
    )
    series = models.CharField(max_length=255, blank=True, default="", verbose_name="Серия")
    inner_unit = models.CharField(max_length=255, verbose_name="Модель внутреннего блока")
    outer_unit = models.CharField(max_length=255, blank=True, default="", verbose_name="Модель наружного блока")
    nominal_capacity = models.FloatField(
        null=True, blank=True, verbose_name="Номинальная холодопроизводительность (Вт)",
    )
    equipment_type = models.ForeignKey(
        EquipmentType, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="models", verbose_name="Тип оборудования",
    )
    publish_status = models.CharField(
        max_length=20, choices=PublishStatus.choices, default=PublishStatus.DRAFT,
        db_index=True, verbose_name="Статус публикации",
    )

    total_index = models.FloatField(
        default=0, db_index=True, verbose_name="Итоговый индекс",
    )

    youtube_url = models.URLField(max_length=512, blank=True, default="")
    rutube_url = models.URLField(max_length=512, blank=True, default="")
    vk_url = models.URLField(max_length=512, blank=True, default="")

    price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name="Рекомендованная цена (руб.)",
    )
    slug = models.SlugField(
        max_length=500, unique=True, blank=True, default="",
        verbose_name="URL-slug",
        help_text="Генерируется автоматически из бренда, серии и блоков",
        allow_unicode=True,
    )
    pros_text = models.TextField(blank=True, default="", verbose_name="Плюсы (AI)")
    cons_text = models.TextField(blank=True, default="", verbose_name="Минусы (AI)")

    is_ad = models.BooleanField(default=False, verbose_name="Рекламная модель")
    ad_position = models.PositiveIntegerField(
        null=True, blank=True, verbose_name="Позиция в рейтинге",
        help_text="Номер позиции в списке (1 = первая). Пусто = не рекламная.",
    )

    # M4.1: editorial-обзор для секции «Обзор» на детальной странице.
    editorial_lede = models.TextField(
        blank=True, default="",
        verbose_name="Обзор: вводный абзац",
        help_text="Вводный абзац редакторского обзора. Показывается первым "
                  "абзацем в секции «Обзор» на детальной странице.",
    )
    editorial_body = models.TextField(
        blank=True, default="",
        verbose_name="Обзор: основной текст",
        validators=[MaxLengthValidator(5000)],
        help_text="Основной текст обзора. Plain text с разделителями \\n\\n. "
                  "Markdown не поддерживается. Длина ≤5000 символов.",
    )
    editorial_quote = models.TextField(
        blank=True, default="",
        verbose_name="Обзор: цитата",
        help_text="Цитата-выноска редактора (pull quote).",
    )
    editorial_quote_author = models.CharField(
        max_length=200, blank=True, default="",
        verbose_name="Обзор: автор цитаты",
        help_text="Например: «А. Петров, главред».",
    )

    # M4.2: габариты и вес внутреннего/наружного блоков для hero-секции.
    inner_unit_dimensions = models.CharField(
        max_length=100, blank=True, default="",
        verbose_name="Габариты внутреннего блока",
        help_text="Например: «850 × 295 × 189 мм». Свободная форма строки.",
    )
    inner_unit_weight_kg = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True,
        verbose_name="Вес внутреннего блока (кг)",
    )
    outer_unit_dimensions = models.CharField(
        max_length=100, blank=True, default="",
        verbose_name="Габариты наружного блока",
    )
    outer_unit_weight_kg = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True,
        verbose_name="Вес наружного блока (кг)",
    )

    class Meta:
        ordering = ["-total_index"]
        verbose_name = "Модель кондиционера"
        verbose_name_plural = "Модели кондиционеров"

    def _normalize_unit_names(self) -> None:
        """Хранить названия блоков в верхнем регистре (латиница и кириллица)."""
        self.inner_unit = (self.inner_unit or "").strip().upper()
        self.outer_unit = (self.outer_unit or "").strip().upper()

    def _generate_slug(self) -> None:
        from .utils import generate_acmodel_slug

        if not self.slug:
            self.slug = generate_acmodel_slug(
                self.brand.name, self.series, self.inner_unit, self.outer_unit,
            )

    def save(self, *args, **kwargs):
        self._normalize_unit_names()
        self._generate_slug()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.brand.name} {self.inner_unit}"


class ModelRegion(models.Model):
    class RegionCode(models.TextChoices):
        RU = "ru", "Россия"
        EU = "eu", "Европа"

    model = models.ForeignKey(
        ACModel, on_delete=models.CASCADE, related_name="regions",
        verbose_name="Модель",
    )
    region_code = models.CharField(
        max_length=10, choices=RegionCode.choices, verbose_name="Регион",
    )

    class Meta:
        verbose_name = "Доступность в регионе"
        verbose_name_plural = "Доступность в регионах"
        constraints = [
            models.UniqueConstraint(
                fields=["model", "region_code"],
                name="unique_acmodel_region",
            )
        ]

    def __str__(self) -> str:
        return f"{self.model} — {self.get_region_code_display()}"


class ModelRawValue(TimestampedModel):
    class VerificationStatus(models.TextChoices):
        CATALOG = "catalog", "Данные по каталогу"
        EDITORIAL = "editorial", "Проверено редакцией"
        LAB = "lab", "Подтверждено лабораторией"

    class LabStatus(models.TextChoices):
        NOT_MEASURED = "not_measured", "Не измерено"
        PENDING = "pending", "Ожидает измерения"
        NOT_IN_MODE = "not_in_mode", "Не участвует в данном режиме"
        MEASURED = "measured", "Измерено"

    model = models.ForeignKey(
        ACModel, on_delete=models.CASCADE, related_name="raw_values",
        verbose_name="Модель",
    )
    criterion = models.ForeignKey(
        "ac_methodology.Criterion", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="values",
        verbose_name="Критерий",
    )
    criterion_code = models.CharField(
        max_length=50, blank=True, default="",
        verbose_name="Код критерия",
        help_text="Дублирует criterion.code для сохранения идентичности при удалении критерия",
        db_index=True,
    )
    raw_value = models.CharField(max_length=500, blank=True, default="", verbose_name="Значение")
    compressor_model = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="Модель компрессора",
        help_text="Используется для критерия «Мощность компрессора».",
    )
    numeric_value = models.FloatField(null=True, blank=True, verbose_name="Числовое значение")

    source = models.CharField(max_length=255, blank=True, default="", verbose_name="Источник")
    source_url = models.URLField(max_length=512, blank=True, default="", verbose_name="Ссылка на источник")
    comment = models.TextField(blank=True, default="", verbose_name="Комментарий")

    verification_status = models.CharField(
        max_length=20, choices=VerificationStatus.choices,
        default=VerificationStatus.CATALOG, verbose_name="Статус верификации",
        db_index=True,
    )
    lab_status = models.CharField(
        max_length=20, choices=LabStatus.choices,
        default=LabStatus.NOT_MEASURED, verbose_name="Статус лаб. измерения",
        db_index=True,
    )

    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="ac_entered_values", verbose_name="Внёс данные",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="ac_approved_values", verbose_name="Утвердил данные",
    )

    class Meta:
        ordering = ["criterion__code"]
        verbose_name = "Значение параметра модели"
        verbose_name_plural = "Значения параметров моделей"
        constraints = [
            models.UniqueConstraint(
                fields=["model", "criterion"],
                name="unique_acmodel_criterion_value",
                condition=models.Q(criterion__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["model", "criterion_code"],
                name="unique_acmodel_criterion_code_orphan",
                condition=models.Q(criterion__isnull=True),
            ),
        ]

    def save(self, *args, **kwargs):
        if self.criterion_id and self.criterion:
            self.criterion_code = self.criterion.code
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        code = self.criterion.code if self.criterion else self.criterion_code
        return f"{self.model} / {code}: {self.raw_value}"


class ACModelPhoto(TimestampedModel):
    model = models.ForeignKey(
        ACModel, on_delete=models.CASCADE, related_name="photos",
        verbose_name="Модель",
    )
    image = models.ImageField(upload_to="ac_rating/photos/", verbose_name="Фото")
    alt = models.CharField(
        max_length=255, blank=True, default="",
        verbose_name="Alt-текст", help_text="Alt-текст для SEO и доступности",
    )
    order = models.PositiveSmallIntegerField(default=0, verbose_name="Порядок")

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "Фото модели"
        verbose_name_plural = "Фото моделей"

    def __str__(self) -> str:
        return f"{self.model} — фото #{self.order}"


class ACModelSupplier(TimestampedModel):
    class Availability(models.TextChoices):
        IN_STOCK = "in_stock", "В наличии"
        LOW_STOCK = "low_stock", "Осталось мало"
        OUT_OF_STOCK = "out_of_stock", "Нет в наличии"
        UNKNOWN = "unknown", "Не известно"

    model = models.ForeignKey(
        ACModel, on_delete=models.CASCADE, related_name="suppliers",
        verbose_name="Модель",
    )
    name = models.CharField(max_length=200, verbose_name="Название поставщика")
    url = models.URLField(verbose_name="Ссылка")
    order = models.PositiveSmallIntegerField(default=0, verbose_name="Порядок")

    # M4.3: enrichment-поля для блока «Где купить» на детальной странице.
    price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name="Цена (руб.)",
        help_text="Цена у поставщика. null = не известна.",
    )
    city = models.CharField(
        max_length=100, blank=True, default="",
        verbose_name="Город",
        help_text="Город склада / магазина, например «Москва».",
    )
    rating = models.DecimalField(
        max_digits=3, decimal_places=1, null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        verbose_name="Рейтинг магазина",
        help_text="0.0–5.0.",
    )
    availability = models.CharField(
        max_length=20, choices=Availability.choices,
        default=Availability.UNKNOWN,
        verbose_name="Наличие",
    )
    note = models.CharField(
        max_length=200, blank=True, default="",
        verbose_name="Пометка",
        help_text="Например: «с монтажом · 2 дня», «самовывоз · завтра».",
    )

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "Поставщик (Где купить)"
        verbose_name_plural = "Поставщики (Где купить)"

    def __str__(self) -> str:
        return f"{self.model} — {self.name}"
