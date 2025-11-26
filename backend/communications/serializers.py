from rest_framework import serializers
from core.serializer_mixins import DisplayFieldMixin
from .models import Correspondence
from contracts.models import Contract
from accounting.models import Counterparty

class CorrespondenceSerializer(DisplayFieldMixin, serializers.ModelSerializer):
    contract_number = serializers.CharField(source='contract.number', read_only=True, allow_null=True)
    counterparty_name = serializers.CharField(source='counterparty.name', read_only=True, allow_null=True)
    related_to_number = serializers.CharField(source='related_to.number', read_only=True, allow_null=True)
    
    type_display = DisplayFieldMixin.get_display_field('type')
    category_display = DisplayFieldMixin.get_display_field('category')
    status_display = DisplayFieldMixin.get_display_field('status')

    class Meta:
        model = Correspondence
        fields = [
            'id',
            'type', 'type_display',
            'category', 'category_display',
            'status', 'status_display',
            'contract', 'contract_number',
            'counterparty', 'counterparty_name',
            'number',
            'date',
            'subject',
            'description',
            'file',
            'related_to', 'related_to_number',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'type_display', 'category_display', 'status_display']

class CorrespondenceListSerializer(DisplayFieldMixin, serializers.ModelSerializer):
    contract_number = serializers.CharField(source='contract.number', read_only=True, allow_null=True)
    counterparty_name = serializers.CharField(source='counterparty.short_name', read_only=True, allow_null=True)
    type_display = DisplayFieldMixin.get_display_field('type')
    status_display = DisplayFieldMixin.get_display_field('status')

    class Meta:
        model = Correspondence
        fields = [
            'id',
            'type', 'type_display',
            'number',
            'date',
            'subject',
            'contract_number',
            'counterparty_name',
            'status', 'status_display',
            'file'
        ]

