import os
from django.db import models
from django.conf import settings
from core.models import TimestampedModel


class LLMProvider(TimestampedModel):
    """Настройка LLM-провайдера"""
    
    class ProviderType(models.TextChoices):
        OPENAI = 'openai', 'OpenAI'
        GEMINI = 'gemini', 'Google Gemini'
        GROK = 'grok', 'xAI Grok'
    
    provider_type = models.CharField(
        max_length=20,
        choices=ProviderType.choices,
        verbose_name='Тип провайдера'
    )
    model_name = models.CharField(
        max_length=100,
        verbose_name='Название модели',
        help_text='Например: gpt-4o, gemini-1.5-pro, grok-2-vision'
    )
    env_key_name = models.CharField(
        max_length=100,
        verbose_name='Имя ENV переменной',
        help_text='Например: OPENAI_API_KEY'
    )
    is_active = models.BooleanField(default=True, verbose_name='Активен')
    is_default = models.BooleanField(default=False, verbose_name='По умолчанию')
    
    class Meta:
        verbose_name = 'LLM-провайдер'
        verbose_name_plural = 'LLM-провайдеры'
        ordering = ['-is_default', 'provider_type']
    
    def __str__(self):
        default_mark = ' (по умолчанию)' if self.is_default else ''
        return f"{self.get_provider_type_display()}: {self.model_name}{default_mark}"
    
    def get_api_key(self) -> str:
        """Получает API-ключ из ENV"""
        key = os.environ.get(self.env_key_name)
        if not key:
            raise ValueError(f"Не найден API-ключ в переменной окружения: {self.env_key_name}")
        return key
    
    def save(self, *args, **kwargs):
        # Если ставим is_default=True, сбрасываем у других
        if self.is_default:
            LLMProvider.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)
    
    @classmethod
    def get_default(cls) -> 'LLMProvider':
        """Возвращает провайдер по умолчанию"""
        # Сначала ищем явно помеченный как default
        provider = cls.objects.filter(is_default=True, is_active=True).first()
        if provider:
            return provider
        
        # Если нет — берём первый активный по pk (детерминизм)
        provider = cls.objects.filter(is_active=True).order_by('pk').first()
        if not provider:
            raise cls.DoesNotExist("Нет доступных LLM-провайдеров. Запустите: python manage.py setup_providers")
        
        return provider


class ParsedDocument(TimestampedModel):
    """Результат парсинга документа через LLM"""
    
    class Status(models.TextChoices):
        PENDING = 'pending', 'В обработке'
        SUCCESS = 'success', 'Успешно'
        FAILED = 'failed', 'Ошибка'
        NEEDS_REVIEW = 'needs_review', 'Требует проверки'
    
    file_hash = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        verbose_name='SHA256 хэш файла'
    )
    original_filename = models.CharField(
        max_length=255,
        verbose_name='Исходное имя файла'
    )
    file = models.FileField(
        upload_to='parsed_documents/%Y/%m/',
        verbose_name='Файл',
        null=True,
        blank=True
    )
    payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='parsed_documents',
        verbose_name='Связанный платёж'
    )
    provider = models.ForeignKey(
        LLMProvider,
        on_delete=models.SET_NULL,
        null=True,
        related_name='parsed_documents',
        verbose_name='Использованный провайдер'
    )
    raw_response = models.JSONField(
        null=True,
        blank=True,
        verbose_name='Сырой ответ LLM'
    )
    parsed_data = models.JSONField(
        null=True,
        blank=True,
        verbose_name='Распарсенные данные'
    )
    confidence_score = models.FloatField(
        null=True,
        blank=True,
        verbose_name='Уверенность (0.0-1.0)'
    )
    processing_time_ms = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Время обработки (мс)'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name='Статус'
    )
    error_message = models.TextField(
        blank=True,
        verbose_name='Сообщение об ошибке'
    )
    retry_count = models.PositiveSmallIntegerField(
        default=0,
        verbose_name='Количество попыток парсинга'
    )
    
    class Meta:
        verbose_name = 'Распарсенный документ'
        verbose_name_plural = 'Распарсенные документы'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['file_hash']),
            models.Index(fields=['status']),
            models.Index(fields=['status', 'created_at']),  # Для cleanup
            models.Index(fields=['provider', 'created_at']),  # Для аналитики по провайдерам
        ]
    
    def __str__(self):
        return f"{self.original_filename} ({self.get_status_display()})"
