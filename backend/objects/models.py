import os
from decimal import Decimal
from datetime import date
from typing import Optional, Dict
from django.db import models
from core.models import TimestampedModel
from core.cashflow import CashFlowCalculator


def object_photo_upload_path(instance, filename):
    ext = filename.split('.')[-1]
    return os.path.join('objects', 'photos', f'object_{instance.id}_photo.{ext}')


class Object(TimestampedModel):
    """Модель объекта для строительной компании"""
    
    class Status(models.TextChoices):
        PLANNED = 'planned', 'Планируется'
        IN_PROGRESS = 'in_progress', 'В работе'
        COMPLETED = 'completed', 'Завершен'
        SUSPENDED = 'suspended', 'Приостановлен'
    
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
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.IN_PROGRESS,
        verbose_name='Статус'
    )
    start_date = models.DateField(
        null=True, blank=True,
        verbose_name='Дата начала'
    )
    end_date = models.DateField(
        null=True, blank=True,
        verbose_name='Дата окончания'
    )
    latitude = models.DecimalField(
        max_digits=10, decimal_places=7,
        null=True, blank=True,
        verbose_name='Широта (центр геозоны)'
    )
    longitude = models.DecimalField(
        max_digits=10, decimal_places=7,
        null=True, blank=True,
        verbose_name='Долгота (центр геозоны)'
    )
    geo_radius = models.IntegerField(
        default=500,
        verbose_name='Радиус геозоны в метрах',
        help_text='Радиус для проверки геолокации при регистрации на смену'
    )
    allow_geo_bypass = models.BooleanField(
        default=False,
        verbose_name='Разрешить регистрацию вне геозоны',
        help_text='Если включено, монтажники смогут регистрироваться на смену находясь за пределами геозоны (с пометкой)'
    )
    registration_window_minutes = models.PositiveIntegerField(
        default=0,
        verbose_name='Окно регистрации (минуты)',
        help_text='За сколько минут до начала и после окончания смены разрешена регистрация. 0 = без ограничений.'
    )
    photo = models.ImageField(
        upload_to=object_photo_upload_path,
        blank=True,
        null=True,
        verbose_name='Фото объекта'
    )

    class Meta:
        verbose_name = 'Объект'
        verbose_name_plural = 'Объекты'
        ordering = ['-created_at']

    def __str__(self):
        return self.name
    
    def get_cash_flow(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Decimal]:
        """
        Рассчитывает cash-flow для объекта за период
        
        Args:
            start_date: Начало периода (опционально)
            end_date: Конец периода (опционально)
        
        Returns:
            Dict с ключами: income, expense, cash_flow
        """
        return CashFlowCalculator.calculate_for_object(
            self.id,
            start_date=start_date,
            end_date=end_date
        )
    
    def get_cash_flow_by_periods(
        self,
        period_type: str = 'month',
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> list:
        """
        Рассчитывает cash-flow с разбивкой по периодам
        
        Args:
            period_type: Тип периода ('month', 'week', 'day')
            start_date: Начало периода (опционально)
            end_date: Конец периода (опционально)
        
        Returns:
            List[Dict] с данными по каждому периоду
        """
        return CashFlowCalculator.calculate_by_periods(
            object_id=self.id,
            period_type=period_type,
            start_date=start_date,
            end_date=end_date
        )
