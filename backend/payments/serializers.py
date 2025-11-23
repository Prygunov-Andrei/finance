from rest_framework import serializers
from contracts.models import Contract
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
    payment_type_display = DisplayFieldMixin.get_display_field('payment_type')
    
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
            'category_name',
            'category_full_path',
            'payment_type_display',
            'created_at',
            'updated_at',
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
        
        # Если категория требует договор, то contract обязателен
        if category and category.requires_contract and not contract:
            raise serializers.ValidationError({
                'contract_id': f'Категория "{category.name}" требует указания договора'
            })
        
        return data


class PaymentListSerializer(DisplayFieldMixin, serializers.ModelSerializer):
    """Упрощённый сериализатор для списка платежей"""
    
    contract_number = serializers.CharField(source='contract.number', read_only=True, allow_null=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    payment_type_display = DisplayFieldMixin.get_display_field('payment_type')
    
    class Meta:
        model = Payment
        fields = [
            'id',
            'contract_number',
            'category_name',
            'payment_type',
            'payment_type_display',
            'payment_date',
            'amount',
            'company_account',
        ]
        read_only_fields = ['id', 'contract_number', 'category_name', 'payment_type_display']


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

