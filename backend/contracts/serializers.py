from rest_framework import serializers
from objects.models import Object
from accounting.models import Counterparty, LegalEntity
from accounting.serializers import LegalEntitySerializer, CounterpartySerializer
from pricelists.serializers import PriceListSerializer
from .models import (
    Contract, ContractAmendment, WorkScheduleItem, Act,
    ActPaymentAllocation, FrameworkContract,
    ContractEstimate, ContractEstimateSection, ContractEstimateItem,
    ContractText, EstimatePurchaseLink, ActItem,
)


class FrameworkContractListSerializer(serializers.ModelSerializer):
    """Упрощённый сериализатор для списков"""
    counterparty_name = serializers.CharField(source='counterparty.name', read_only=True)
    legal_entity_name = serializers.CharField(source='legal_entity.short_name', read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    contracts_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = FrameworkContract
        fields = [
            'id', 'number', 'name', 'date', 'valid_from', 'valid_until',
            'counterparty', 'counterparty_name',
            'legal_entity', 'legal_entity_name',
            'status', 'is_active', 'contracts_count',
            'created_at'
        ]


class FrameworkContractSerializer(serializers.ModelSerializer):
    legal_entity_details = LegalEntitySerializer(source='legal_entity', read_only=True)
    counterparty_details = CounterpartySerializer(source='counterparty', read_only=True)
    price_lists_details = PriceListSerializer(source='price_lists', many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    # Вычисляемые
    is_expired = serializers.BooleanField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    days_until_expiration = serializers.IntegerField(read_only=True)
    contracts_count = serializers.IntegerField(read_only=True)
    total_contracts_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    
    class Meta:
        model = FrameworkContract
        fields = [
            'id', 'number', 'name', 'date', 'valid_from', 'valid_until',
            'legal_entity', 'legal_entity_details',
            'counterparty', 'counterparty_details',
            'price_lists', 'price_lists_details',
            'status', 'file', 'notes',
            'created_by', 'created_by_name',
            'is_expired', 'is_active', 'days_until_expiration',
            'contracts_count', 'total_contracts_amount',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'number', 'created_by', 'created_at', 'updated_at']


class ContractAmendmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractAmendment
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class WorkScheduleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkScheduleItem
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class ActPaymentAllocationSerializer(serializers.ModelSerializer):
    payment_description = serializers.CharField(source='payment.description', read_only=True)
    payment_date = serializers.DateField(source='payment.payment_date', read_only=True)

    class Meta:
        model = ActPaymentAllocation
        fields = ['id', 'act', 'payment', 'payment_description', 'payment_date', 'amount', 'created_at']
        read_only_fields = ['id', 'created_at', 'payment_description', 'payment_date']


class ActItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActItem
        fields = [
            'id', 'act', 'contract_estimate_item',
            'name', 'unit', 'quantity', 'unit_price', 'amount',
            'sort_order', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ActSerializer(serializers.ModelSerializer):
    contract_number = serializers.CharField(source='contract.number', read_only=True)
    allocations = ActPaymentAllocationSerializer(source='payment_allocations', many=True, read_only=True)
    act_items = ActItemSerializer(many=True, read_only=True)
    unpaid_amount = serializers.SerializerMethodField()
    act_type_display = serializers.CharField(source='get_act_type_display', read_only=True)

    class Meta:
        model = Act
        fields = [
            'id', 'contract', 'contract_number',
            'act_type', 'act_type_display', 'contract_estimate',
            'number', 'date',
            'period_start', 'period_end', 'amount_gross', 'amount_net', 'vat_amount',
            'status', 'file', 'description', 'due_date',
            'allocations', 'act_items', 'unpaid_amount',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'contract_number', 'allocations', 'act_items', 'unpaid_amount']

    def get_unpaid_amount(self, obj) -> str:
        """
        Вычисляет неоплаченную сумму.
        Использует annotated поле paid_amount если доступно (оптимизация),
        иначе вычисляет через итерацию (fallback).
        """
        from decimal import Decimal
        
        # Используем аннотированное значение если есть (из ViewSet.get_queryset)
        if hasattr(obj, 'paid_amount'):
            paid = obj.paid_amount or Decimal('0')
        else:
            # Fallback для случаев когда объект получен не через ViewSet
            paid = sum(
                allocation.amount 
                for allocation in obj.payment_allocations.all()
            )
        
        return str(obj.amount_gross - paid)


class ContractTextSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', read_only=True,
    )
    amendment_number = serializers.CharField(
        source='amendment.number', read_only=True, allow_null=True,
    )

    class Meta:
        model = ContractText
        fields = [
            'id', 'contract', 'amendment', 'amendment_number',
            'content_md', 'version', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'version', 'created_at', 'updated_at']


class ContractEstimateItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True, allow_null=True)
    work_item_name = serializers.CharField(source='work_item.name', read_only=True, allow_null=True)
    material_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    work_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = ContractEstimateItem
        fields = [
            'id', 'contract_estimate', 'section', 'source_item',
            'item_number', 'name', 'model_name', 'unit', 'quantity',
            'material_unit_price', 'work_unit_price',
            'product', 'product_name', 'work_item', 'work_item_name',
            'is_analog', 'analog_reason', 'original_name',
            'item_type', 'sort_order',
            'material_total', 'work_total', 'line_total',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ContractEstimateSectionSerializer(serializers.ModelSerializer):
    items = ContractEstimateItemSerializer(many=True, read_only=True)

    class Meta:
        model = ContractEstimateSection
        fields = [
            'id', 'contract_estimate', 'name', 'sort_order',
            'items', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ContractEstimateSerializer(serializers.ModelSerializer):
    sections = ContractEstimateSectionSerializer(many=True, read_only=True)
    total_materials = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_works = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    source_estimate_number = serializers.CharField(
        source='source_estimate.number', read_only=True, allow_null=True,
    )
    contract_number = serializers.CharField(
        source='contract.number', read_only=True,
    )

    class Meta:
        model = ContractEstimate
        fields = [
            'id', 'contract', 'contract_number',
            'source_estimate', 'source_estimate_number',
            'number', 'name', 'status', 'signed_date', 'file',
            'version_number', 'parent_version', 'amendment', 'notes',
            'sections', 'total_materials', 'total_works', 'total_amount',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'version_number', 'parent_version',
            'created_at', 'updated_at',
        ]


class ContractEstimateListSerializer(serializers.ModelSerializer):
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    contract_number = serializers.CharField(source='contract.number', read_only=True)

    class Meta:
        model = ContractEstimate
        fields = [
            'id', 'contract', 'contract_number', 'number', 'name',
            'status', 'version_number', 'total_amount', 'created_at',
        ]


class ContractSerializer(serializers.ModelSerializer):
    """Сериализатор для модели Contract"""
    
    object_name = serializers.CharField(source='object.name', read_only=True)
    object_id = serializers.PrimaryKeyRelatedField(
        queryset=Object.objects.all(),
        source='object',
        write_only=True
    )
    counterparty_name = serializers.CharField(source='counterparty.short_name', read_only=True)
    legal_entity_name = serializers.CharField(source='legal_entity.short_name', read_only=True)
    technical_proposal_number = serializers.CharField(source='technical_proposal.number', read_only=True)
    mounting_proposal_number = serializers.CharField(source='mounting_proposal.number', read_only=True)
    framework_contract_details = FrameworkContractListSerializer(
        source='framework_contract', 
        read_only=True
    )
    responsible_manager_name = serializers.CharField(
        source='responsible_manager.get_full_name', 
        read_only=True
    )
    responsible_engineer_name = serializers.CharField(
        source='responsible_engineer.get_full_name', 
        read_only=True
    )
    
    class Meta:
        model = Contract
        fields = [
            'id',
            'object_id',
            'object_name',
            'legal_entity',
            'legal_entity_name',
            'counterparty',
            'counterparty_name',
            'contract_type',
            'technical_proposal',
            'technical_proposal_number',
            'mounting_proposal',
            'mounting_proposal_number',
            'parent_contract',
            'framework_contract', 'framework_contract_details',
            'responsible_manager', 'responsible_manager_name',
            'responsible_engineer', 'responsible_engineer_name',
            'number',
            'name',
            'contract_date',
            'start_date',
            'end_date',
            'total_amount',
            'currency',
            'vat_rate',
            'vat_included',
            'status',
            'file',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'object_name', 'counterparty_name', 'legal_entity_name', 'technical_proposal_number', 'mounting_proposal_number', 'framework_contract_details', 'responsible_manager_name', 'responsible_engineer_name', 'created_at', 'updated_at']


class ContractListSerializer(serializers.ModelSerializer):
    """Упрощённый сериализатор для списка договоров"""
    
    object_name = serializers.CharField(source='object.name', read_only=True)
    counterparty_name = serializers.CharField(source='counterparty.short_name', read_only=True)
    legal_entity_name = serializers.CharField(source='legal_entity.short_name', read_only=True)
    
    class Meta:
        model = Contract
        fields = [
            'id',
            'object_name',
            'number',
            'name',
            'contract_type',
            'counterparty_name',
            'legal_entity_name',
            'total_amount',
            'currency',
            'status',
            'contract_date',
        ]
        read_only_fields = ['id', 'object_name']


class EstimatePurchaseLinkSerializer(serializers.ModelSerializer):
    estimate_item_name = serializers.CharField(
        source='contract_estimate_item.name', read_only=True,
    )
    invoice_item_name = serializers.CharField(
        source='invoice_item.raw_name', read_only=True,
    )

    class Meta:
        model = EstimatePurchaseLink
        fields = [
            'id', 'contract_estimate_item', 'estimate_item_name',
            'invoice_item', 'invoice_item_name',
            'quantity_matched', 'match_type', 'match_reason',
            'price_exceeds', 'quantity_exceeds',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'price_exceeds', 'quantity_exceeds',
            'created_at', 'updated_at',
        ]
