from rest_framework import serializers
from django.contrib.auth.models import User
from core.serializer_mixins import DisplayFieldMixin
from .models import ImportLog


class ImportLogSerializer(DisplayFieldMixin, serializers.ModelSerializer):
    """Сериализатор для модели ImportLog"""
    
    user_username = serializers.CharField(source='user.username', read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='user',
        write_only=True,
        required=False,
        allow_null=True
    )
    status_display = DisplayFieldMixin.get_display_field('status')
    file_type_display = DisplayFieldMixin.get_display_field('file_type')
    success_rate = serializers.FloatField(read_only=True)
    
    class Meta:
        model = ImportLog
        fields = [
            'id',
            'import_batch_id',
            'user_id',
            'user_username',
            'file_name',
            'file_type',
            'file_type_display',
            'file_size',
            'file_path',
            'status',
            'status_display',
            'records_count',
            'success_count',
            'error_count',
            'success_rate',
            'errors',
            'import_date',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'user_username',
            'status_display',
            'file_type_display',
            'success_rate',
            'import_date',
            'created_at',
            'updated_at',
        ]


class ImportLogListSerializer(DisplayFieldMixin, serializers.ModelSerializer):
    """Упрощённый сериализатор для списка импортов"""
    
    user_username = serializers.CharField(source='user.username', read_only=True)
    status_display = DisplayFieldMixin.get_display_field('status')
    file_type_display = DisplayFieldMixin.get_display_field('file_type')
    success_rate = serializers.FloatField(read_only=True)
    
    class Meta:
        model = ImportLog
        fields = [
            'id',
            'import_batch_id',
            'file_name',
            'file_type_display',
            'status_display',
            'user_username',
            'records_count',
            'success_count',
            'error_count',
            'success_rate',
            'import_date',
        ]
        read_only_fields = [
            'id',
            'file_type_display',
            'status_display',
            'user_username',
            'success_rate',
        ]

