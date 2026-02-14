from rest_framework import serializers
from django.conf import settings

from .models import FileObject


class FileInitSerializer(serializers.Serializer):
    sha256 = serializers.CharField(min_length=64, max_length=64)
    size_bytes = serializers.IntegerField(min_value=1)
    mime_type = serializers.CharField(required=False, allow_blank=True, default='')
    original_filename = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_size_bytes(self, value: int):
        max_size = getattr(settings, 'KANBAN_FILE_MAX_SIZE_BYTES', 0) or 0
        if max_size and value > max_size:
            raise serializers.ValidationError('File is too large')
        return value

    def validate_mime_type(self, value: str):
        allowed = getattr(settings, 'KANBAN_FILE_ALLOWED_MIME', set()) or set()
        if value and allowed and value not in allowed:
            raise serializers.ValidationError('Mime type is not allowed')
        return value


class FileFinalizeSerializer(serializers.Serializer):
    file_id = serializers.UUIDField()


class FileObjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = FileObject
        fields = [
            'id', 'sha256', 'size_bytes', 'mime_type', 'original_filename',
            'bucket', 'object_key', 'status', 'created_at',
        ]
        read_only_fields = fields

