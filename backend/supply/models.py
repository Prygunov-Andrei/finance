from django.db import models
from django.conf import settings
from core.models import TimestampedModel


def supply_request_file_path(instance, filename):
    return f'supply/requests/{instance.bitrix_deal_id}/{filename}'


# =============================================================================
# BitrixIntegration — настройки подключения к Битрикс24
# =============================================================================

class BitrixIntegration(TimestampedModel):
    """Настройки подключения к Битрикс24 для модуля снабжения."""

    name = models.CharField(
        max_length=255,
        verbose_name='Название подключения',
        help_text='Например: "SRM Август — Снабжение"',
    )
    portal_url = models.URLField(
        verbose_name='URL портала Битрикс24',
        help_text='Например: https://mycompany.bitrix24.ru',
    )
    webhook_url = models.CharField(
        max_length=500,
        verbose_name='URL входящего вебхука',
        help_text='Incoming webhook для обратных вызовов к Битрикс24 API. '
                  'Формат: https://xxx.bitrix24.ru/rest/{user_id}/{secret}/',
    )
    outgoing_webhook_token = models.CharField(
        max_length=255,
        verbose_name='Токен исходящего вебхука',
        help_text='application_token из настроек Outgoing Webhook в Битрикс24',
    )

    # --- Целевая стадия воронки ---
    target_category_id = models.IntegerField(
        default=0,
        verbose_name='ID воронки (категории)',
        help_text='0 = воронка по умолчанию',
    )
    target_stage_id = models.CharField(
        max_length=50,
        verbose_name='STAGE_ID целевой стадии',
        help_text='ID стадии "Передан в Оплату" из crm.status.list',
    )

    # --- Маппинг кастомных полей ---
    contract_field_mapping = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Поле "Номер договора"',
        help_text='Системное имя кастомного поля (UF_CRM_xxx). '
                  'Если пусто — парсинг из заголовка карточки.',
    )
    object_field_mapping = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Поле "Название объекта"',
        help_text='Системное имя кастомного поля (UF_CRM_xxx). '
                  'Если пусто — парсинг из заголовка карточки.',
    )

    is_active = models.BooleanField(
        default=True,
        verbose_name='Активно',
    )

    class Meta:
        verbose_name = 'Интеграция Битрикс24'
        verbose_name_plural = 'Интеграции Битрикс24'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.portal_url})'


# =============================================================================
# SupplyRequest — запрос на снабжение из Битрикс24
# =============================================================================

class SupplyRequest(TimestampedModel):
    """Запрос на снабжение, полученный из SRM Битрикс24."""

    class Status(models.TextChoices):
        RECEIVED = 'received', 'Получен'
        PROCESSING = 'processing', 'Обрабатывается'
        COMPLETED = 'completed', 'Завершён'
        ERROR = 'error', 'Ошибка'

    bitrix_integration = models.ForeignKey(
        BitrixIntegration,
        on_delete=models.CASCADE,
        related_name='supply_requests',
        verbose_name='Интеграция Битрикс24',
    )
    bitrix_deal_id = models.IntegerField(
        unique=True,
        verbose_name='ID сделки в Битрикс24',
    )
    bitrix_deal_title = models.CharField(
        max_length=500,
        blank=True,
        verbose_name='Заголовок карточки',
    )

    # --- Привязки к ERP ---
    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='supply_requests',
        verbose_name='Объект',
    )
    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='supply_requests',
        verbose_name='Договор',
    )
    operator = models.ForeignKey(
        'personnel.Employee',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='supply_requests',
        verbose_name='Оператор-снабженец',
    )

    # --- Данные запроса ---
    request_text = models.TextField(
        blank=True,
        verbose_name='Текст запроса',
        help_text='Текст из комментария со словом "запрос"',
    )
    request_file = models.FileField(
        upload_to=supply_request_file_path,
        blank=True,
        null=True,
        verbose_name='Файл запроса',
    )
    notes = models.TextField(
        blank=True,
        verbose_name='Заметки',
        help_text='Описание из карточки Битрикс, комментарии к запросу',
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Сумма из Битрикс',
    )

    # --- Статус ---
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.RECEIVED,
        verbose_name='Статус',
    )
    mapping_errors = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='Ошибки маппинга',
        help_text='{"contract": "not_found", "object": "not_found"}',
    )

    # --- Сырые данные Битрикс ---
    raw_deal_data = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='Данные сделки (raw)',
    )
    raw_comments_data = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Комментарии (raw)',
    )
    synced_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Дата синхронизации',
    )

    class Meta:
        verbose_name = 'Запрос на снабжение'
        verbose_name_plural = 'Запросы на снабжение'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['bitrix_deal_id']),
            models.Index(fields=['status']),
            models.Index(fields=['object', 'status']),
        ]

    def __str__(self):
        return f'Запрос #{self.bitrix_deal_id} — {self.bitrix_deal_title[:60]}'
