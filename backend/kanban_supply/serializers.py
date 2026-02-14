from rest_framework import serializers

from kanban_supply.models import SupplyCase, InvoiceRef, DeliveryBatch
from kanban_core.models import Card


class SupplyCaseSerializer(serializers.ModelSerializer):
    card = serializers.PrimaryKeyRelatedField(queryset=Card.objects.all())

    class Meta:
        model = SupplyCase
        fields = ['id', 'card', 'erp_object_id', 'erp_contract_id', 'supplier_label', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class InvoiceRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceRef
        fields = ['id', 'supply_case', 'erp_invoice_id', 'cached_status', 'cached_amount_gross', 'cached_currency', 'cached_due_date', 'created_at']
        read_only_fields = ['id', 'created_at']


class DeliveryBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryBatch
        fields = ['id', 'supply_case', 'invoice_ref', 'status', 'planned_date', 'actual_date', 'notes', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

