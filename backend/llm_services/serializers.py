from rest_framework import serializers
from .models import LLMProvider, ParsedDocument


class LLMProviderSerializer(serializers.ModelSerializer):
    """Сериализатор LLM-провайдера"""
    
    provider_type_display = serializers.CharField(
        source='get_provider_type_display',
        read_only=True
    )
    
    class Meta:
        model = LLMProvider
        fields = [
            'id', 'provider_type', 'provider_type_display',
            'model_name', 'env_key_name', 'is_active', 'is_default',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'provider_type_display', 'created_at', 'updated_at']


class ParsedDocumentSerializer(serializers.ModelSerializer):
    """Сериализатор распарсенного документа"""
    
    status_display = serializers.CharField(
        source='get_status_display',
        read_only=True
    )
    provider_name = serializers.CharField(
        source='provider.get_provider_type_display',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = ParsedDocument
        fields = [
            'id', 'file_hash', 'original_filename', 'file',
            'payment', 'provider', 'provider_name',
            'parsed_data', 'confidence_score', 'processing_time_ms',
            'status', 'status_display', 'error_message',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'file_hash', 'created_at', 'updated_at']
