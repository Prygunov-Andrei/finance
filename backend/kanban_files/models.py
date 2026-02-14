import uuid
from django.db import models


class FileObject(models.Model):
    class Status(models.TextChoices):
        UPLOADING = 'uploading', 'Загружается'
        READY = 'ready', 'Готово'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sha256 = models.CharField(max_length=64, unique=True)
    size_bytes = models.BigIntegerField()
    mime_type = models.CharField(max_length=255, blank=True)
    original_filename = models.CharField(max_length=512, blank=True)

    bucket = models.CharField(max_length=255)
    object_key = models.CharField(max_length=1024)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UPLOADING)

    created_by_user_id = models.IntegerField(null=True, blank=True)
    created_by_username = models.CharField(max_length=150, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Файл (registry)'
        verbose_name_plural = 'Файлы (registry)'
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['created_by_user_id']),
        ]

    def __str__(self):
        return f'{self.sha256[:12]}… ({self.status})'

