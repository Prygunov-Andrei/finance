from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError

from core.models import TimestampedModel


class SectionFeedback(TimestampedModel):
    """Замечание сотрудника к разделу ERP"""

    class Section(models.TextChoices):
        DASHBOARD = 'dashboard', 'Пункт управления'
        COMMERCIAL = 'commercial', 'Коммерческие предложения'
        ESTIMATES = 'estimates', 'Сметы'
        OBJECTS = 'objects', 'Объекты'
        FINANCE = 'finance', 'Финансы'
        CONTRACTS = 'contracts', 'Договоры'
        SUPPLY = 'supply', 'Снабжение и Склад'
        GOODS = 'goods', 'Товары и услуги'
        PTO = 'pto', 'ПТО'
        MARKETING = 'marketing', 'Маркетинг'
        COMMUNICATIONS = 'communications', 'Переписка'
        SETTINGS = 'settings', 'Справочники и Настройки'
        HVAC = 'hvac', 'HVAC-новости'
        HELP = 'help', 'Справка'

    class Status(models.TextChoices):
        NEW = 'new', 'Новый'
        IN_PROGRESS = 'in_progress', 'В работе'
        RESOLVED = 'resolved', 'Решён'

    section = models.CharField(
        max_length=30,
        choices=Section.choices,
        db_index=True,
        verbose_name='Раздел',
    )
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='section_feedbacks',
        verbose_name='Автор',
    )
    text = models.TextField(
        max_length=5000,
        verbose_name='Текст замечания',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
        verbose_name='Статус',
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['section', '-created_at']),
            models.Index(fields=['status']),
        ]
        verbose_name = 'Замечание'
        verbose_name_plural = 'Замечания'

    def __str__(self):
        return f'[{self.get_section_display()}] {self.text[:80]}'


class FeedbackReply(TimestampedModel):
    """Ответ в треде замечания"""

    feedback = models.ForeignKey(
        SectionFeedback,
        on_delete=models.CASCADE,
        related_name='replies',
        verbose_name='Замечание',
    )
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='feedback_replies',
        verbose_name='Автор',
    )
    text = models.TextField(
        max_length=5000,
        verbose_name='Текст ответа',
    )

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Ответ'
        verbose_name_plural = 'Ответы'

    def __str__(self):
        return f'Ответ от {self.author} на #{self.feedback_id}'


class FeedbackAttachment(TimestampedModel):
    """Скриншот к замечанию или ответу"""

    feedback = models.ForeignKey(
        SectionFeedback,
        on_delete=models.CASCADE,
        related_name='attachments',
        null=True,
        blank=True,
        verbose_name='Замечание',
    )
    reply = models.ForeignKey(
        FeedbackReply,
        on_delete=models.CASCADE,
        related_name='attachments',
        null=True,
        blank=True,
        verbose_name='Ответ',
    )
    file = models.ImageField(
        upload_to='section_feedback/%Y/%m/',
        verbose_name='Файл',
    )
    original_filename = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Имя файла',
    )

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Вложение'
        verbose_name_plural = 'Вложения'

    def clean(self):
        if not self.feedback and not self.reply:
            raise ValidationError('Вложение должно быть привязано к замечанию или ответу.')
        if self.feedback and self.reply:
            raise ValidationError('Вложение может быть привязано только к одному объекту.')

    def __str__(self):
        return self.original_filename or str(self.file)
