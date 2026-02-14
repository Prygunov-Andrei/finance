import uuid
from django.db import models
from django.core.exceptions import ValidationError

from kanban_files.models import FileObject


class Board(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=64, unique=True)  # e.g. supply, object_tasks
    title = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Доска'
        verbose_name_plural = 'Доски'
        ordering = ['key']

    def __str__(self):
        return f'{self.key}: {self.title}'


class Column(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='columns')

    key = models.CharField(max_length=64)  # immutable in API
    title = models.CharField(max_length=255)
    order = models.IntegerField(default=0)
    wip_limit = models.IntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Колонка'
        verbose_name_plural = 'Колонки'
        ordering = ['board__key', 'order', 'key']
        unique_together = [('board', 'key')]

    def __str__(self):
        return f'{self.board.key}:{self.key}'


class Card(models.Model):
    class CardType(models.TextChoices):
        SUPPLY_CASE = 'supply_case', 'Supply case'
        OBJECT_TASK = 'object_task', 'Object task'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='cards')
    column = models.ForeignKey(Column, on_delete=models.PROTECT, related_name='cards')

    type = models.CharField(max_length=32, choices=CardType.choices)
    title = models.CharField(max_length=512)
    description = models.TextField(blank=True)
    meta = models.JSONField(default=dict, blank=True)

    due_date = models.DateField(null=True, blank=True)
    assignee_user_id = models.IntegerField(null=True, blank=True)
    assignee_username = models.CharField(max_length=150, blank=True)

    created_by_user_id = models.IntegerField(null=True, blank=True)
    created_by_username = models.CharField(max_length=150, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Карточка'
        verbose_name_plural = 'Карточки'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['board', 'column']),
            models.Index(fields=['type']),
        ]

    def clean(self):
        super().clean()
        if self.column_id and self.board_id and self.column.board_id != self.board_id:
            raise ValidationError({'column': 'Колонка не принадлежит доске карточки.'})

    def __str__(self):
        return f'{self.board.key}:{self.id}'


class CardEvent(models.Model):
    """
    Append-only аудит. Никаких update/delete, только новые записи.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=64)
    data = models.JSONField(default=dict, blank=True)

    actor_user_id = models.IntegerField(null=True, blank=True)
    actor_username = models.CharField(max_length=150, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Событие карточки'
        verbose_name_plural = 'События карточки'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['card', 'created_at']),
            models.Index(fields=['event_type']),
        ]

    def __str__(self):
        return f'{self.card_id}:{self.event_type}'


class Attachment(models.Model):
    class Kind(models.TextChoices):
        DOCUMENT = 'document', 'Документ'
        PHOTO = 'photo', 'Фото'
        OTHER = 'other', 'Другое'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name='attachments')
    file = models.ForeignKey(FileObject, on_delete=models.PROTECT, related_name='kanban_attachments')

    # Supply overlay linking (nullable, V1)
    invoice_ref_id = models.UUIDField(null=True, blank=True)
    delivery_batch_id = models.UUIDField(null=True, blank=True)

    kind = models.CharField(max_length=32, choices=Kind.choices, default=Kind.DOCUMENT)
    document_type = models.CharField(max_length=64, blank=True)  # invoice, request, primary, etc
    title = models.CharField(max_length=255, blank=True)
    meta = models.JSONField(default=dict, blank=True)

    created_by_user_id = models.IntegerField(null=True, blank=True)
    created_by_username = models.CharField(max_length=150, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Вложение'
        verbose_name_plural = 'Вложения'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['card', 'created_at']),
            models.Index(fields=['document_type']),
        ]

