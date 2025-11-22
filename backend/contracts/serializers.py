from rest_framework import serializers
from objects.models import Object
from .models import Contract


class ContractSerializer(serializers.ModelSerializer):
    """Сериализатор для модели Contract"""
    
    object_name = serializers.CharField(source='object.name', read_only=True)
    object_id = serializers.PrimaryKeyRelatedField(
        queryset=Object.objects.all(),
        source='object',
        write_only=True
    )
    
    class Meta:
        model = Contract
        fields = [
            'id',
            'object_id',
            'object_name',
            'number',
            'name',
            'contract_date',
            'start_date',
            'end_date',
            'contractor',
            'total_amount',
            'currency',
            'vat_rate',
            'vat_included',
            'status',
            'document_link',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'object_name', 'created_at', 'updated_at']


class ContractListSerializer(serializers.ModelSerializer):
    """Упрощённый сериализатор для списка договоров"""
    
    object_name = serializers.CharField(source='object.name', read_only=True)
    
    class Meta:
        model = Contract
        fields = [
            'id',
            'object_name',
            'number',
            'name',
            'contractor',
            'total_amount',
            'currency',
            'status',
            'contract_date',
        ]
        read_only_fields = ['id', 'object_name']

