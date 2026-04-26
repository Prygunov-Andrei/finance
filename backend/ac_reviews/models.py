from __future__ import annotations

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from core.models import TimestampedModel


class Review(TimestampedModel):
    """Пользовательский отзыв о модели кондиционера. Премодерация — status."""

    class Status(models.TextChoices):
        PENDING = "pending", "На модерации"
        APPROVED = "approved", "Одобрен"
        REJECTED = "rejected", "Отклонён"

    model = models.ForeignKey(
        "ac_catalog.ACModel",
        related_name="reviews",
        on_delete=models.CASCADE,
        verbose_name="Модель",
    )
    author_name = models.CharField(max_length=100, verbose_name="Имя автора")
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        verbose_name="Оценка (1-5)",
    )
    pros = models.TextField(blank=True, default="", verbose_name="Достоинства")
    cons = models.TextField(blank=True, default="", verbose_name="Недостатки")
    comment = models.TextField(blank=True, default="", verbose_name="Комментарий")
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
        verbose_name="Статус модерации",
        help_text="По умолчанию pending. Публично видны только approved.",
    )
    ip_address = models.GenericIPAddressField(
        null=True, blank=True, verbose_name="IP-адрес",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Отзыв"
        verbose_name_plural = "Отзывы"

    def __str__(self) -> str:
        return f"{self.author_name} → {self.model_id} ({self.rating}★)"
