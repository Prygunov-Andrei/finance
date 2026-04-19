from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import models, transaction

from core.models import TimestampedModel


class MethodologyVersion(TimestampedModel):
    version = models.CharField(max_length=30, unique=True, verbose_name="Версия")
    name = models.CharField(max_length=255, verbose_name="Название")
    description = models.TextField(blank=True, default="", verbose_name="Описание")
    tab_description_index = models.TextField(
        blank=True, default="",
        verbose_name="Описание таба «По индексу»",
    )
    tab_description_quiet = models.TextField(
        blank=True, default="",
        verbose_name="Описание таба «Самые тихие»",
    )
    tab_description_custom = models.TextField(
        blank=True, default="",
        verbose_name="Описание таба «Пользовательский рейтинг»",
    )
    is_active = models.BooleanField(
        default=False, verbose_name="Активна",
        help_text="Только одна методика может быть активной",
    )
    criteria = models.ManyToManyField(
        "Criterion", through="MethodologyCriterion",
        related_name="methodologies", verbose_name="Параметры",
    )
    needs_recalculation = models.BooleanField(
        default=False, verbose_name="Требуется пересчёт",
        help_text="Устанавливается при изменении весов или формул",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Версия методики"
        verbose_name_plural = "Версии методики"

    def __str__(self) -> str:
        active = " [АКТИВНА]" if self.is_active else ""
        return f"{self.name} (v{self.version}){active}"

    def save(self, *args, **kwargs):
        # Атомарность: деактивация других активных + сохранение себя — одной
        # транзакцией. Без atomic между двумя SQL-запросами есть окно гонки,
        # в котором два параллельных save() могут оставить 0 или 2 активных
        # методики (Ф2 риск #9). UPDATE ... WHERE is_active=True держит
        # row-level lock на затронутых строках до конца транзакции.
        with transaction.atomic():
            if self.is_active:
                MethodologyVersion.objects.filter(is_active=True).exclude(pk=self.pk).update(
                    is_active=False
                )
            super().save(*args, **kwargs)


class Criterion(TimestampedModel):
    """Справочник параметров (standalone, без привязки к методике)."""

    class ValueType(models.TextChoices):
        NUMERIC = "numeric", "Числовой"
        BINARY = "binary", "Бинарный (да/нет)"
        CATEGORICAL = "categorical", "Категориальный"
        CUSTOM_SCALE = "custom_scale", "Индивидуальная шкала"
        FORMULA = "formula", "Формульная логика"
        LAB = "lab", "Лабораторный"
        FALLBACK = "fallback", "С fallback-логикой"
        BRAND_AGE = "brand_age", "Возраст бренда в РФ"

    code = models.CharField(
        max_length=50, unique=True, verbose_name="Код",
        help_text="Уникальный код параметра, напр. noise_min",
    )

    name_ru = models.CharField(max_length=255, verbose_name="Название (RU)")
    name_en = models.CharField(max_length=255, blank=True, default="", verbose_name="Название (EN)")
    name_de = models.CharField(max_length=255, blank=True, default="", verbose_name="Название (DE)")
    name_pt = models.CharField(max_length=255, blank=True, default="", verbose_name="Название (PT)")

    description_ru = models.TextField(blank=True, default="", verbose_name="Описание (RU)")
    description_en = models.TextField(blank=True, default="", verbose_name="Описание (EN)")
    description_de = models.TextField(blank=True, default="", verbose_name="Описание (DE)")
    description_pt = models.TextField(blank=True, default="", verbose_name="Описание (PT)")

    unit = models.CharField(max_length=50, blank=True, default="", verbose_name="Ед. измерения")

    photo = models.ImageField(
        upload_to="ac_rating/criteria/", blank=True, default="",
        verbose_name="Фото",
    )

    value_type = models.CharField(
        max_length=30, choices=ValueType.choices, verbose_name="Тип значения",
    )

    is_active = models.BooleanField(default=True, verbose_name="Активен")

    class Meta:
        ordering = ["code"]
        verbose_name = "Параметр"
        verbose_name_plural = "Параметры"

    def __str__(self) -> str:
        return f"{self.name_ru} ({self.code})"


class MethodologyCriterion(TimestampedModel):
    """Связь параметра с версией методики + все настройки оценки."""

    class ScoringType(models.TextChoices):
        MIN_MEDIAN_MAX = "min_median_max", "Min / Median / Max"
        BINARY = "binary", "Бинарный (0 или 100)"
        UNIVERSAL_SCALE = "universal_scale", "Универсальная шкала (100/70/50/30/0)"
        CUSTOM_SCALE = "custom_scale", "Индивидуальная шкала (JSON)"
        FORMULA = "formula", "Формула (JSON)"
        INTERVAL = "interval", "Интервальная шкала"

    class RegionScope(models.TextChoices):
        GLOBAL = "global", "Глобальный"
        RU = "ru", "Только Россия"
        EU = "eu", "Только Европа"

    methodology = models.ForeignKey(
        MethodologyVersion, on_delete=models.CASCADE,
        related_name="methodology_criteria",
        verbose_name="Методика",
    )
    criterion = models.ForeignKey(
        "Criterion", on_delete=models.CASCADE,
        related_name="methodology_entries",
        verbose_name="Параметр",
    )

    scoring_type = models.CharField(
        max_length=30, choices=ScoringType.choices, verbose_name="Тип скоринга",
    )
    weight = models.FloatField(
        default=0, verbose_name="Вес (%)",
        help_text="Вес параметра в процентах. Сумма весов всех параметров = 100%",
    )

    min_value = models.FloatField(null=True, blank=True, verbose_name="Min")
    median_value = models.FloatField(null=True, blank=True, verbose_name="Медиана")
    max_value = models.FloatField(null=True, blank=True, verbose_name="Max")

    is_inverted = models.BooleanField(
        default=False, verbose_name="Инвертированная шкала",
        help_text="Если включено: min = хорошо (100), max = плохо (0). Для шума, вибрации и т.п.",
    )
    median_by_capacity = models.JSONField(
        null=True, blank=True, verbose_name="Медианы по мощности (JSON)",
        help_text='Формат: {"2.0": 0.18, "2.5": 0.21, "3.5": 0.30}. '
                  'Ключ — номинальная мощность кВт, значение — медиана.',
    )

    custom_scale_json = models.JSONField(
        null=True, blank=True, verbose_name="Индивидуальная шкала (JSON)",
        help_text='Формат: {"значение": балл, ...} или [{"from": x, "to": y, "score": z}, ...]',
    )
    formula_json = models.JSONField(
        null=True, blank=True, verbose_name="Формула (JSON)",
        help_text="Описание формулы расчёта для формульных параметров",
    )

    is_required_lab = models.BooleanField(default=False, verbose_name="Обязателен для LAB режима")
    is_required_checklist = models.BooleanField(default=False, verbose_name="Обязателен для CHECKLIST")
    is_required_catalog = models.BooleanField(default=False, verbose_name="Обязателен для CATALOG")

    use_in_lab = models.BooleanField(default=True, verbose_name="Используется в LAB")
    use_in_checklist = models.BooleanField(default=True, verbose_name="Используется в CHECKLIST")
    use_in_catalog = models.BooleanField(default=True, verbose_name="Используется в CATALOG")

    region_scope = models.CharField(
        max_length=10, choices=RegionScope.choices, default=RegionScope.GLOBAL,
        verbose_name="Регион",
    )
    is_public = models.BooleanField(default=True, verbose_name="Публичный")
    display_order = models.PositiveIntegerField(default=0, verbose_name="Порядок отображения")
    is_active = models.BooleanField(default=True, verbose_name="Активен")

    class Meta:
        ordering = ["display_order"]
        verbose_name = "Параметр методики"
        verbose_name_plural = "Параметры методики"
        constraints = [
            models.UniqueConstraint(
                fields=["methodology", "criterion"],
                name="unique_methodology_criterion",
            ),
            models.CheckConstraint(
                check=models.Q(weight__gte=0),
                name="mc_weight_non_negative",
            ),
        ]

    # Несовместимые пары (value_type параметра × scoring_type методики).
    # Ловит явные опечатки: напр. бинарное поле нельзя скорить линейной
    # шкалой min-median-max. Всё, что не в списке — допустимо.
    _INCOMPATIBLE_SCORING = {
        "binary": {"min_median_max", "interval"},
        "categorical": {"min_median_max", "interval"},
    }

    def clean(self):
        super().clean()
        if self.weight < 0:
            raise ValidationError({"weight": "Вес не может быть отрицательным."})
        if self.min_value is not None and self.max_value is not None:
            if self.min_value > self.max_value:
                raise ValidationError({"min_value": "min_value не может быть больше max_value."})
        if self.median_value is not None:
            if self.min_value is not None and self.median_value < self.min_value:
                raise ValidationError({"median_value": "median_value не может быть меньше min_value."})
            if self.max_value is not None and self.median_value > self.max_value:
                raise ValidationError({"median_value": "median_value не может быть больше max_value."})

        # Совместимость value_type параметра и scoring_type методики.
        # criterion_id может быть None, если форма ещё не выбрала параметр.
        if self.criterion_id:
            vt = self.criterion.value_type
            forbidden = self._INCOMPATIBLE_SCORING.get(vt, set())
            if self.scoring_type in forbidden:
                raise ValidationError({
                    "scoring_type": (
                        f"Тип скоринга «{self.get_scoring_type_display()}» "
                        f"несовместим с типом значения параметра «{vt}». "
                        f"Выберите другой тип скоринга."
                    ),
                })

        # Обязательные поля для конкретных scoring_type.
        if self.scoring_type == self.ScoringType.MIN_MEDIAN_MAX:
            if self.min_value is None or self.max_value is None:
                raise ValidationError({
                    "min_value": "Для скоринга «Min / Median / Max» обязательны min_value и max_value.",
                })
        elif self.scoring_type == self.ScoringType.CUSTOM_SCALE:
            if not self.custom_scale_json:
                raise ValidationError({
                    "custom_scale_json": "Для скоринга «Индивидуальная шкала» нужно заполнить JSON.",
                })
        elif self.scoring_type == self.ScoringType.FORMULA:
            if not self.formula_json:
                raise ValidationError({
                    "formula_json": "Для скоринга «Формула» нужно заполнить JSON.",
                })

    def __str__(self) -> str:
        return f"{self.criterion.name_ru} ({self.weight}%) — {self.methodology}"

    # --- Proxy-свойства для обратной совместимости со скорерами ---

    @property
    def code(self):
        return self.criterion.code

    @property
    def value_type(self):
        return self.criterion.value_type

    @property
    def name_ru(self):
        return self.criterion.name_ru

    @property
    def name_en(self):
        return self.criterion.name_en

    @property
    def name_de(self):
        return self.criterion.name_de

    @property
    def name_pt(self):
        return self.criterion.name_pt

    @property
    def description_ru(self):
        return self.criterion.description_ru

    @property
    def description_en(self):
        return self.criterion.description_en

    @property
    def description_de(self):
        return self.criterion.description_de

    @property
    def description_pt(self):
        return self.criterion.description_pt

    @property
    def unit(self):
        return self.criterion.unit
