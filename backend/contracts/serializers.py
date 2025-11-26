from rest_framework import serializers
from objects.models import Object
from accounting.models import Counterparty, LegalEntity
from .models import Contract, ContractAmendment, WorkScheduleItem, Act, ActPaymentAllocation, CommercialProposal


class CommercialProposalSerializer(serializers.ModelSerializer):
    object_name = serializers.CharField(source='object.name', read_only=True)
    counterparty_name = serializers.CharField(source='counterparty.short_name', read_only=True)
    contract_id = serializers.PrimaryKeyRelatedField(source='contract', read_only=True)
    
    class Meta:
        model = CommercialProposal
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'contract']


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


class ActSerializer(serializers.ModelSerializer):
    contract_number = serializers.CharField(source='contract.number', read_only=True)
    allocations = ActPaymentAllocationSerializer(source='payment_allocations', many=True, read_only=True)
    unpaid_amount = serializers.SerializerMethodField()

    class Meta:
        model = Act
        fields = [
            'id', 'contract', 'contract_number', 'number', 'date',
            'period_start', 'period_end', 'amount_gross', 'amount_net', 'vat_amount',
            'status', 'file', 'description', 'allocations', 'unpaid_amount',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'contract_number', 'allocations', 'unpaid_amount']

    def get_unpaid_amount(self, obj) -> str:
        # Считаем, сколько уже распределено
        paid = sum(allocation.amount for allocation in obj.payment_allocations.all())
        return str(obj.amount_gross - paid)


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
    commercial_proposal_number = serializers.CharField(source='commercial_proposal.number', read_only=True)
    
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
            'commercial_proposal',
            'commercial_proposal_number',
            'parent_contract',
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
        read_only_fields = ['id', 'object_name', 'counterparty_name', 'legal_entity_name', 'commercial_proposal_number', 'created_at', 'updated_at']

    def validate(self, data):
        """Проверка бизнес-правил"""
        instance = self.instance
        
        # Получаем новые значения или оставляем старые
        status_value = data.get('status', instance.status if instance else None)
        commercial_proposal = data.get('commercial_proposal', instance.commercial_proposal if instance else None)
        
        if status_value == Contract.Status.ACTIVE:
            if not commercial_proposal:
                raise serializers.ValidationError({'status': 'Нельзя перевести договор в статус "В работе" без привязанного КП.'})
            if commercial_proposal.status != CommercialProposal.Status.APPROVED:
                raise serializers.ValidationError({'commercial_proposal': 'Привязанное КП должно быть в статусе "Согласовано".'})
        
        return data


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
