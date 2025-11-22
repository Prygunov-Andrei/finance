from django.db import models
from django.contrib.auth.models import User
from core.models import TimestampedModel


class ImportLog(TimestampedModel):
    """Журнал импорта данных из файлов"""

    class Status(models.TextChoices):
        PENDING = 'pending', 'В обработке'
        SUCCESS = 'success', 'Успешно'
        FAILED = 'failed', 'Ошибка'
        PARTIAL = 'partial', 'Частично успешно'

    class FileType(models.TextChoices):
        PAYMENTS_ACTUAL = 'payments_actual', 'Фактические платежи'
        PAYMENTS_PLAN = 'payments_plan', 'Плановые платежи'
        INCOMES = 'incomes', 'Поступления'
        BALANCE = 'balance', 'Задолженность'

    import_batch_id = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
        verbose_name='Идентификатор импорта'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='import_logs',
        verbose_name='Пользователь'
    )
    file_name = models.CharField(
        max_length=255,
        verbose_name='Имя файла'
    )
    file_type = models.CharField(
        max_length=50,
        choices=FileType.choices,
        verbose_name='Тип файла'
    )
    file_size = models.PositiveIntegerField(
        verbose_name='Размер файла (байт)'
    )
    file_path = models.CharField(
        max_length=500,
        blank=True,
        verbose_name='Путь к файлу'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name='Статус обработки'
    )
    records_count = models.PositiveIntegerField(
        default=0,
        verbose_name='Количество записей'
    )
    success_count = models.PositiveIntegerField(
        default=0,
        verbose_name='Успешно обработано'
    )
    error_count = models.PositiveIntegerField(
        default=0,
        verbose_name='Ошибок'
    )
    errors = models.TextField(
        blank=True,
        verbose_name='Описание ошибок'
    )
    import_date = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата импорта'
    )

    class Meta:
        verbose_name = 'Журнал импорта'
        verbose_name_plural = 'Журнал импортов'
        ordering = ['-import_date', '-created_at']
        indexes = [
            models.Index(fields=['import_batch_id']),
            models.Index(fields=['status', 'import_date']),
            models.Index(fields=['file_type', 'import_date']),
            models.Index(fields=['user', 'import_date']),
        ]

    def __str__(self) -> str:
        return f"{self.file_name} ({self.get_file_type_display()}) - {self.get_status_display()}"

    @property
    def success_rate(self) -> float:
        """Процент успешно обработанных записей"""
        if self.records_count == 0:
            return 0.0
        return (self.success_count / self.records_count) * 100
