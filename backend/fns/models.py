from django.db import models
from django.conf import settings
from core.models import TimestampedModel


class FNSReport(TimestampedModel):
    """Отчет проверки контрагента через API-FNS."""

    class ReportType(models.TextChoices):
        CHECK = 'check', 'Проверка контрагента'
        EGR = 'egr', 'Данные ЕГРЮЛ/ЕГРИП'
        BO = 'bo', 'Бухгалтерская отчетность'

    counterparty = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.CASCADE,
        related_name='fns_reports',
        verbose_name='Контрагент',
    )
    report_type = models.CharField(
        max_length=10,
        choices=ReportType.choices,
        verbose_name='Тип отчета',
    )
    inn = models.CharField(
        max_length=12,
        verbose_name='ИНН на момент запроса',
    )
    report_date = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата формирования',
    )
    data = models.JSONField(
        verbose_name='Полный JSON-ответ API-FNS',
    )
    summary = models.JSONField(
        null=True,
        blank=True,
        verbose_name='Краткая выжимка',
        help_text='Структурированная сводка для быстрого отображения (позитивные/негативные факторы)',
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fns_reports',
        verbose_name='Запросил',
    )

    class Meta:
        verbose_name = 'Отчет ФНС'
        verbose_name_plural = 'Отчеты ФНС'
        ordering = ['-report_date']
        indexes = [
            models.Index(fields=['counterparty', '-report_date']),
            models.Index(fields=['inn']),
        ]

    def __str__(self):
        return f"{self.get_report_type_display()} — {self.inn} ({self.report_date:%d.%m.%Y %H:%M})"


class FNSCache(models.Model):
    """Кэш ответов API-FNS для экономии запросов."""

    query_hash = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        verbose_name='Хеш запроса',
    )
    endpoint = models.CharField(
        max_length=20,
        verbose_name='Метод API',
        help_text='search, egr, check, bo, stat',
    )
    query_params = models.JSONField(
        verbose_name='Параметры запроса',
    )
    response_data = models.JSONField(
        verbose_name='Ответ API',
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Создан',
    )
    expires_at = models.DateTimeField(
        verbose_name='Истекает',
    )

    class Meta:
        verbose_name = 'Кэш API-FNS'
        verbose_name_plural = 'Кэш API-FNS'
        indexes = [
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f"{self.endpoint} [{self.query_hash[:12]}...] до {self.expires_at:%d.%m.%Y %H:%M}"
