from rest_framework import serializers
from contracts.models import Contract
from core.serializer_mixins import DisplayFieldMixin
from .models import Payment, PaymentRegistry


class PaymentSerializer(DisplayFieldMixin, serializers.ModelSerializer):
    """Сериализатор для модели Payment"""
    
    contract_number = serializers.CharField(source='contract.number', read_only=True)
    contract_name = serializers.CharField(source='contract.name', read_only=True)
    contract_id = serializers.PrimaryKeyRelatedField(
        queryset=Contract.objects.all(),
        source='contract',
        write_only=True
    )
    payment_type_display = DisplayFieldMixin.get_display_field('payment_type')
    
    class Meta:
        model = Payment
        fields = [
            'id',
            'contract_id',
            'contract_number',
            'contract_name',
            'payment_type',
            'payment_type_display',
            'payment_date',
            'amount',
            'company_account',
            'description',
            'document_link',
            'import_batch_id',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'contract_number',
            'contract_name',
            'payment_type_display',
            'created_at',
            'updated_at',
        ]


class PaymentListSerializer(DisplayFieldMixin, serializers.ModelSerializer):
    """Упрощённый сериализатор для списка платежей"""
    
    contract_number = serializers.CharField(source='contract.number', read_only=True)
    payment_type_display = DisplayFieldMixin.get_display_field('payment_type')
    
    class Meta:
        model = Payment
        fields = [
            'id',
            'contract_number',
            'payment_type',
            'payment_type_display',
            'payment_date',
            'amount',
            'company_account',
        ]
        read_only_fields = ['id', 'contract_number', 'payment_type_display']


class PaymentRegistrySerializer(DisplayFieldMixin, serializers.ModelSerializer):
    """Сериализатор для модели PaymentRegistry"""
    
    contract_number = serializers.CharField(source='contract.number', read_only=True)
    contract_name = serializers.CharField(source='contract.name', read_only=True)
    contract_id = serializers.PrimaryKeyRelatedField(
        queryset=Contract.objects.all(),
        source='contract',
        write_only=True
    )
    status_display = DisplayFieldMixin.get_display_field('status')
    
    class Meta:
        model = PaymentRegistry
        fields = [
            'id',
            'contract_id',
            'contract_number',
            'contract_name',
            'planned_date',
            'amount',
            'status',
            'status_display',
            'initiator',
            'comment',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'contract_number',
            'contract_name',
            'status_display',
            'created_at',
            'updated_at',
        ]


class PaymentRegistryListSerializer(DisplayFieldMixin, serializers.ModelSerializer):
    """Упрощённый сериализатор для списка плановых платежей"""
    
    contract_number = serializers.CharField(source='contract.number', read_only=True)
    status_display = DisplayFieldMixin.get_display_field('status')
    
    class Meta:
        model = PaymentRegistry
        fields = [
            'id',
            'contract_number',
            'planned_date',
            'amount',
            'status',
            'status_display',
            'initiator',
        ]
        read_only_fields = ['id', 'contract_number', 'status_display']

