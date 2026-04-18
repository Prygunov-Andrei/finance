from __future__ import annotations

from django.conf import settings
from django.db import models


class CalculationRun(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Ожидание"
        RUNNING = "running", "Выполняется"
        COMPLETED = "completed", "Завершён"
        FAILED = "failed", "Ошибка"

    methodology = models.ForeignKey(
        "ac_methodology.MethodologyVersion", on_delete=models.CASCADE,
        related_name="runs", verbose_name="Методика",
    )
    started_at = models.DateTimeField(auto_now_add=True, verbose_name="Начало")
    finished_at = models.DateTimeField(null=True, blank=True, verbose_name="Конец")
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        verbose_name="Запустил",
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING,
        verbose_name="Статус",
    )
    models_processed = models.PositiveIntegerField(default=0, verbose_name="Обработано моделей")
    error_message = models.TextField(blank=True, default="", verbose_name="Ошибка")

    class Meta:
        ordering = ["-started_at"]
        verbose_name = "Запуск расчёта"
        verbose_name_plural = "Запуски расчётов"

    def __str__(self) -> str:
        return f"Run #{self.pk} ({self.methodology.version}) — {self.get_status_display()}"


class CalculationResult(models.Model):
    run = models.ForeignKey(
        CalculationRun, on_delete=models.CASCADE, related_name="results",
        verbose_name="Запуск расчёта",
    )
    model = models.ForeignKey(
        "ac_catalog.ACModel", on_delete=models.CASCADE,
        related_name="calculation_results", verbose_name="Модель",
    )
    criterion = models.ForeignKey(
        "ac_methodology.Criterion", on_delete=models.CASCADE,
        related_name="calculation_results", verbose_name="Критерий",
    )
    raw_value = models.CharField(max_length=500, blank=True, default="", verbose_name="Исходное значение")
    normalized_score = models.FloatField(default=0, verbose_name="Нормированный балл (0-100)")
    weighted_score = models.FloatField(default=0, verbose_name="Взвешенный балл")
    above_reference = models.BooleanField(
        default=False, verbose_name="Выше эталона",
        help_text="Значение превышает max (эталонное значение)",
    )

    class Meta:
        ordering = ["criterion__code"]
        verbose_name = "Результат расчёта"
        verbose_name_plural = "Результаты расчётов"
        constraints = [
            models.UniqueConstraint(
                fields=["run", "model", "criterion"],
                name="unique_run_acmodel_criterion",
            )
        ]

    def __str__(self) -> str:
        return f"{self.model} / {self.criterion.code}: {self.normalized_score:.1f} -> {self.weighted_score:.2f}"
