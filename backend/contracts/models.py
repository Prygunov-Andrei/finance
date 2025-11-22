from decimal import Decimal
from datetime import date
from typing import Optional, Dict
from django.db import models
from core.models import TimestampedModel
from core.cashflow import CashFlowCalculator


class Contract(TimestampedModel):
    """Договор, связанный со строительным объектом"""

    class Status(models.TextChoices):
        PLANNED = 'planned', 'Планируется'
        ACTIVE = 'active', 'В работе'
        COMPLETED = 'completed', 'Завершён'
        SUSPENDED = 'suspended', 'Приостановлен'
        TERMINATED = 'terminated', 'Расторгнут'

    class Currency(models.TextChoices):
        RUB = 'RUB', 'Российский рубль'
        USD = 'USD', 'Доллар США'
        EUR = 'EUR', 'Евро'

    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.CASCADE,
        related_name='contracts',
        verbose_name='Объект'
    )
    number = models.CharField(
        max_length=100,
        verbose_name='Номер договора'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название / предмет договора'
    )
    contract_date = models.DateField(
        verbose_name='Дата заключения'
    )
    start_date = models.DateField(
        verbose_name='Дата начала работ',
        null=True,
        blank=True
    )
    end_date = models.DateField(
        verbose_name='Плановая дата завершения',
        null=True,
        blank=True
    )
    contractor = models.CharField(
        max_length=255,
        verbose_name='Контрагент'
    )
    total_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Сумма договора'
    )
    currency = models.CharField(
        max_length=3,
        choices=Currency.choices,
        default=Currency.RUB,
        verbose_name='Валюта'
    )
    vat_rate = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=20.00,
        verbose_name='Ставка НДС, %'
    )
    vat_included = models.BooleanField(
        default=True,
        verbose_name='Сумма включает НДС'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PLANNED,
        verbose_name='Статус'
    )
    document_link = models.CharField(
        max_length=500,
        blank=True,
        verbose_name='Ссылка на договор'
    )
    notes = models.TextField(
        blank=True,
        verbose_name='Примечания'
    )

    class Meta:
        verbose_name = 'Договор'
        verbose_name_plural = 'Договоры'
        ordering = ['-contract_date', '-created_at']
        unique_together = ('object', 'number')

    def __str__(self) -> str:
        return f"{self.number} — {self.name}"
    
    def get_cash_flow(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Decimal]:
        """
        Рассчитывает cash-flow для договора за период
        
        Args:
            start_date: Начало периода (опционально)
            end_date: Конец периода (опционально)
        
        Returns:
            Dict с ключами: income, expense, cash_flow
        """
        return CashFlowCalculator.calculate_for_contract(
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
            contract_id=self.id,
            period_type=period_type,
            start_date=start_date,
            end_date=end_date
        )
