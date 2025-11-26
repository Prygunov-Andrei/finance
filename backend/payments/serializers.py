from rest_framework import serializers
from contracts.models import Contract, Act
from accounting.models import Account, LegalEntity
from core.serializer_mixins import DisplayFieldMixin
from .models import Payment, PaymentRegistry, ExpenseCategory


class ExpenseCategorySerializer(serializers.ModelSerializer):
    """Сериализатор для категории расходов/доходов"""
    
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    full_path = serializers.SerializerMethodField()
    
    class Meta:
        model = ExpenseCategory
        fields = [
            'id',
            'name',
            'code',
            'parent',
            'parent_name',
            'full_path',
            'description',
            'is_active',
            'requires_contract',
            'sort_order',
        ]
        read_only_fields = ['id', 'parent_name', 'full_path']
    
    def get_full_path(self, obj):
        """Возвращает полный путь категории"""
        return obj.get_full_path()


class PaymentSerializer(DisplayFieldMixin, serializers.ModelSerializer):
    """Сериализатор для модели Payment"""
    
    contract_number = serializers.CharField(source='contract.number', read_only=True, allow_null=True)
    contract_name = serializers.CharField(source='contract.name', read_only=True, allow_null=True)
    contract_id = serializers.PrimaryKeyRelatedField(
        queryset=Contract.objects.all(),
        source='contract',
        write_only=True,
        required=False,
        allow_null=True
    )
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=ExpenseCategory.objects.filter(is_active=True),
        source='category',
        write_only=True
    )
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_full_path = serializers.SerializerMethodField()
    
    account_id = serializers.PrimaryKeyRelatedField(
        queryset=Account.objects.all(),
        source='account',
        write_only=True,
        required=False,
        allow_null=True
    )
    account_name = serializers.CharField(source='account.name', read_only=True, allow_null=True)
    
    legal_entity_id = serializers.PrimaryKeyRelatedField(
        queryset=LegalEntity.objects.all(),
        source='legal_entity',
        write_only=True,
        required=False,
        allow_null=True
    )
    legal_entity_name = serializers.CharField(source='legal_entity.short_name', read_only=True, allow_null=True)

    payment_type_display = DisplayFieldMixin.get_display_field('payment_type')
    status_display = DisplayFieldMixin.get_display_field('status')
    
    class Meta:
        model = Payment
        fields = [
            'id',
            'contract_id',
            'contract_number',
            'contract_name',
            'category_id',
            'category_name',
            'category_full_path',
            'account_id',
            'account_name',
            'legal_entity_id',
            'legal_entity_name',
            'payment_type',
            'payment_type_display',
            'status',
            'status_display',
            'payment_date',
            'amount',
            'amount_gross',
            'amount_net',
            'vat_amount',
            'description',
            'scan_file',
            'payment_registry',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'contract_number',
            'contract_name',
            'category_name',
            'category_full_path',
            'account_name',
            'legal_entity_name',
            'payment_type_display',
            'status_display',
            'created_at',
            'updated_at',
            'payment_registry',
        ]
    
    def get_category_full_path(self, obj):
        """Возвращает полный путь категории"""
        if obj.category:
            return obj.category.get_full_path()
        return None
    
    def validate(self, data):
        """Валидация данных платежа"""
        category = data.get('category')
        contract = data.get('contract')
        
        if category and category.requires_contract and not contract:
            raise serializers.ValidationError({
                'contract_id': f'Категория "{category.name}" требует указания договора'
            })
        
        return data


class PaymentListSerializer(DisplayFieldMixin, serializers.ModelSerializer):
    """Упрощённый сериализатор для списка платежей"""
    
    contract_number = serializers.CharField(source='contract.number', read_only=True, allow_null=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True, allow_null=True)
    payment_type_display = DisplayFieldMixin.get_display_field('payment_type')
    status_display = DisplayFieldMixin.get_display_field('status')
    
    class Meta:
        model = Payment
        fields = [
            'id',
            'contract_number',
            'category_name',
            'account_name',
            'payment_type',
            'payment_type_display',
            'status',
            'status_display',
            'payment_date',
            'amount',
        ]
        read_only_fields = ['id', 'contract_number', 'category_name', 'account_name', 'payment_type_display', 'status_display']


class PaymentRegistrySerializer(DisplayFieldMixin, serializers.ModelSerializer):
    """Сериализатор для модели PaymentRegistry"""
    
    contract_number = serializers.CharField(source='contract.number', read_only=True, allow_null=True)
    contract_name = serializers.CharField(source='contract.name', read_only=True, allow_null=True)
    contract_id = serializers.PrimaryKeyRelatedField(
        queryset=Contract.objects.all(),
        source='contract',
        write_only=True,
        required=False,
        allow_null=True
    )
    
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=ExpenseCategory.objects.filter(is_active=True),
        source='category',
        write_only=True,
        required=False,
        allow_null=True
    )
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    
    account_id = serializers.PrimaryKeyRelatedField(
        queryset=Account.objects.all(),
        source='account',
        write_only=True,
        required=False,
        allow_null=True
    )
    account_name = serializers.CharField(source='account.name', read_only=True, allow_null=True)
    
    act_id = serializers.PrimaryKeyRelatedField(
        queryset=Act.objects.all(),
        source='act',
        write_only=True,
        required=False,
        allow_null=True
    )
    act_number = serializers.CharField(source='act.number', read_only=True, allow_null=True)

    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True, allow_null=True)
    status_display = DisplayFieldMixin.get_display_field('status')
    
    payment_id = serializers.PrimaryKeyRelatedField(source='payment_fact', read_only=True, allow_null=True)

    class Meta:
        model = PaymentRegistry
        fields = [
            'id',
            'contract_id',
            'contract_number',
            'contract_name',
            'category_id',
            'category_name',
            'account_id',
            'account_name',
            'act_id',
            'act_number',
            'planned_date',
            'amount',
            'status',
            'status_display',
            'initiator',
            'approved_by',
            'approved_by_name',
            'approved_at',
            'comment',
            'invoice_file',
            'payment_id',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'contract_number',
            'contract_name',
            'category_name',
            'account_name',
            'act_number',
            'status_display',
            'approved_by',
            'approved_by_name',
            'approved_at',
            'payment_id',
            'created_at',
            'updated_at',
        ]


class PaymentRegistryListSerializer(DisplayFieldMixin, serializers.ModelSerializer):
    """Упрощённый сериализатор для списка плановых платежей"""
    
    contract_number = serializers.CharField(source='contract.number', read_only=True, allow_null=True)
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    account_name = serializers.CharField(source='account.name', read_only=True, allow_null=True)
    status_display = DisplayFieldMixin.get_display_field('status')
    
    class Meta:
        model = PaymentRegistry
        fields = [
            'id',
            'contract_number',
            'category_name',
            'account_name',
            'planned_date',
            'amount',
            'status',
            'status_display',
            'initiator',
        ]
        read_only_fields = ['id', 'contract_number', 'category_name', 'account_name', 'status_display']
