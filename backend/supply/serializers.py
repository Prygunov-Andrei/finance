from rest_framework import serializers
from supply.models import BitrixIntegration, SupplyRequest


class BitrixIntegrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = BitrixIntegration
        fields = '__all__'
        extra_kwargs = {
            'outgoing_webhook_token': {'write_only': True},
        }


class BitrixIntegrationListSerializer(serializers.ModelSerializer):
    """Сокращённый сериализатор для списка (без секретов)."""

    class Meta:
        model = BitrixIntegration
        fields = [
            'id', 'name', 'portal_url', 'target_category_id',
            'target_stage_id', 'is_active', 'created_at',
        ]


class SupplyRequestSerializer(serializers.ModelSerializer):
    object_name = serializers.CharField(source='object.name', read_only=True, default=None)
    contract_number = serializers.CharField(source='contract.number', read_only=True, default=None)
    operator_name = serializers.CharField(source='operator.full_name', read_only=True, default=None)
    invoices_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = SupplyRequest
        fields = [
            'id', 'bitrix_integration', 'bitrix_deal_id', 'bitrix_deal_title',
            'object', 'object_name', 'contract', 'contract_number',
            'operator', 'operator_name',
            'request_text', 'request_file', 'notes', 'amount',
            'status', 'mapping_errors',
            'synced_at', 'created_at', 'updated_at',
            'invoices_count',
        ]
        read_only_fields = [
            'bitrix_deal_id', 'bitrix_deal_title', 'request_text', 'request_file',
            'notes', 'amount', 'mapping_errors', 'raw_deal_data', 'raw_comments_data',
            'synced_at', 'created_at', 'updated_at',
        ]


class SupplyRequestDetailSerializer(SupplyRequestSerializer):
    """Детальный сериализатор с сырыми данными Битрикс."""

    class Meta(SupplyRequestSerializer.Meta):
        fields = SupplyRequestSerializer.Meta.fields + [
            'raw_deal_data', 'raw_comments_data',
        ]
