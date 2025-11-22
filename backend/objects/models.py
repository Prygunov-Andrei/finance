from django.db import models
from core.models import TimestampedModel


class Object(TimestampedModel):
    """Модель объекта для строительной компании"""
    
    name = models.CharField(
        max_length=200,
        unique=True,
        verbose_name='Название объекта'
    )
    address = models.CharField(
        max_length=255,
        verbose_name='Адрес объекта'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание объекта'
    )

    class Meta:
        verbose_name = 'Объект'
        verbose_name_plural = 'Объекты'
        ordering = ['-created_at']

    def __str__(self):
        return self.name