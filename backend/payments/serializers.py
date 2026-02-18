import json

from rest_framework import serializers

from contracts.models import Contract, Act
from accounting.models import Account, LegalEntity, Counterparty
from core.serializer_mixins import DisplayFieldMixin
from .models import (
    Payment, PaymentRegistry, ExpenseCategory, PaymentItem,
    Invoice, InvoiceItem, InvoiceEvent,
    RecurringPayment, IncomeRecord,
    JournalEntry,
)
from .services import PaymentService

# Максимальное количество позиций в одном платеже
MAX_PAYMENT_ITEMS = 200


class ExpenseCategorySerializer(serializers.ModelSerializer):
    """Сериализатор для Внутреннего плана счетов."""

    parent_name = serializers.CharField(source='parent.name', read_only=True, default=None)
    full_path = serializers.SerializerMethodField()
    account_type_display = serializers.CharField(source='get_account_type_display', read_only=True)
    balance = serializers.SerializerMethodField()
    object_name = serializers.CharField(source='object.name', read_only=True, default=None)
    contract_number = serializers.CharField(source='contract.number', read_only=True, default=None)

    class Meta:
        model = ExpenseCategory
        fields = [
            'id',
            'name',
            'code',
            'account_type',
            'account_type_display',
            'parent',
            'parent_name',
            'full_path',
            'object',
            'object_name',
            'contract',
            'contract_number',
            'description',
            'is_active',
            'requires_contract',
            'sort_order',
            'balance',
        ]
        read_only_fields = [
            'id', 'parent_name', 'full_path',
            'account_type_display', 'balance',
            'object_name', 'contract_number',
        ]

    def get_full_path(self, obj):
        return obj.get_full_path()

    def get_balance(self, obj):
        if obj.account_type in (
            ExpenseCategory.AccountType.SYSTEM,
            ExpenseCategory.AccountType.OBJECT,
            ExpenseCategory.AccountType.CONTRACT,
        ):
            return str(obj.get_balance())
        return None


class PaymentItemSerializer(serializers.ModelSerializer):
    """Сериализатор позиции платежа"""
    
    product_name = serializers.CharField(source='product.name', read_only=True, allow_null=True)
    product_category = serializers.CharField(source='product.category.name', read_only=True, allow_null=True)
    
    class Meta:
        model = PaymentItem
        fields = [
            'id', 'raw_name', 'product', 'product_name', 'product_category',
            'quantity', 'unit', 'price_per_unit', 'amount', 'vat_amount',
            'created_at'
        ]
        read_only_fields = ['id', 'product_name', 'product_category', 'created_at']


class PaymentItemCreateSerializer(serializers.ModelSerializer):
    """Сериализатор для создания позиций платежа"""
    
    class Meta:
        model = PaymentItem
        fields = ['raw_name', 'quantity', 'unit', 'price_per_unit', 'vat_amount']


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
    
    items = PaymentItemSerializer(many=True, read_only=True)
    items_input = serializers.JSONField(write_only=True, required=False)
    items_count = serializers.SerializerMethodField()
    
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
            'is_internal_transfer',
            'internal_transfer_group',
            'items',
            'items_input',
            'items_count',
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
            'items',
            'items_count',
        ]
    
    def get_category_full_path(self, obj):
        """Возвращает полный путь категории"""
        if obj.category:
            return obj.category.get_full_path()
        return None
    
    def get_items_count(self, obj):
        """
        Возвращает количество позиций в платеже.
        Использует annotated поле если доступно (оптимизация N+1).
        """
        if hasattr(obj, 'annotated_items_count'):
            return obj.annotated_items_count
        return obj.items.count()
    
    def validate(self, data):
        """Валидация данных платежа"""
        category = data.get('category')
        contract = data.get('contract')
        
        if category and category.requires_contract and not contract:
            raise serializers.ValidationError({
                'contract_id': f'Категория "{category.name}" требует указания договора'
            })
        
        # Проверяем наличие файла при создании
        request = self.context.get('request')
        if request and request.method == 'POST':
            if not data.get('scan_file') and not request.FILES.get('scan_file'):
                raise serializers.ValidationError({
                    'scan_file': 'Документ (счёт или акт) обязателен для создания платежа'
                })
        
        # Валидация items_input
        items_input = data.get('items_input')
        if items_input is not None:
            if isinstance(items_input, str):
                try:
                    items_input = json.loads(items_input)
                    data['items_input'] = items_input
                except json.JSONDecodeError:
                    raise serializers.ValidationError({
                        'items_input': 'Неверный формат JSON'
                    })
            
            if not isinstance(items_input, list):
                raise serializers.ValidationError({
                    'items_input': 'Должен быть список'
                })
            
            # Проверяем лимит позиций
            if len(items_input) > MAX_PAYMENT_ITEMS:
                raise serializers.ValidationError({
                    'items_input': f'Слишком много позиций ({len(items_input)}). Максимум: {MAX_PAYMENT_ITEMS}'
                })
            
            # Валидируем каждую позицию
            item_serializer = PaymentItemCreateSerializer(data=items_input, many=True)
            if not item_serializer.is_valid():
                raise serializers.ValidationError({
                    'items_input': item_serializer.errors
                })
        
        return data
    
    def create(self, validated_data):
        """
        Создание платежа с учётом типа.
        Логика вынесена в PaymentService для соблюдения принципа Single Responsibility.
        """
        items_data = validated_data.pop('items_input', [])
        user = self.context.get('request').user if self.context.get('request') else None
        
        return PaymentService.create_payment(
            validated_data=validated_data,
            items_data=items_data,
            user=user
        )


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
            'amount_gross',
            'amount_net',
            'vat_amount',
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


# =============================================================================
# Invoice — новые сериализаторы
# =============================================================================

class InvoiceItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True, default=None)

    class Meta:
        model = InvoiceItem
        fields = [
            'id', 'raw_name', 'product', 'product_name',
            'quantity', 'unit', 'price_per_unit', 'amount', 'vat_amount',
        ]
        read_only_fields = ['id', 'product_name']


class InvoiceEventSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True, default=None)

    class Meta:
        model = InvoiceEvent
        fields = [
            'id', 'event_type', 'user', 'user_name',
            'old_value', 'new_value', 'comment', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class InvoiceListSerializer(serializers.ModelSerializer):
    """Сокращённый сериализатор для списка счетов."""
    counterparty_name = serializers.CharField(source='counterparty.short_name', read_only=True, default=None)
    object_name = serializers.CharField(source='object.name', read_only=True, default=None)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    account_name = serializers.CharField(source='account.name', read_only=True, default=None)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    invoice_type_display = serializers.CharField(source='get_invoice_type_display', read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_type', 'invoice_type_display',
            'source', 'source_display', 'status', 'status_display',
            'invoice_number', 'invoice_date', 'due_date',
            'counterparty', 'counterparty_name',
            'object', 'object_name',
            'category_name', 'account_name',
            'amount_gross', 'amount_net', 'vat_amount',
            'is_overdue', 'is_debt', 'skip_recognition',
            'created_at',
        ]


class InvoiceDetailSerializer(serializers.ModelSerializer):
    """Полный сериализатор для деталей счёта."""
    counterparty_name = serializers.CharField(source='counterparty.short_name', read_only=True, default=None)
    object_name = serializers.CharField(source='object.name', read_only=True, default=None)
    contract_number = serializers.CharField(source='contract.number', read_only=True, default=None)
    act_number = serializers.CharField(source='act.number', read_only=True, default=None)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    target_internal_account_name = serializers.CharField(
        source='target_internal_account.name', read_only=True, default=None,
    )
    account_name = serializers.CharField(source='account.name', read_only=True, default=None)
    legal_entity_name = serializers.CharField(source='legal_entity.short_name', read_only=True, default=None)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    invoice_type_display = serializers.CharField(source='get_invoice_type_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, default=None)
    reviewed_by_name = serializers.CharField(source='reviewed_by.get_full_name', read_only=True, default=None)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True, default=None)
    is_overdue = serializers.BooleanField(read_only=True)
    items = InvoiceItemSerializer(many=True, read_only=True)
    events = InvoiceEventSerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_type', 'invoice_type_display',
            'source', 'source_display', 'status', 'status_display',
            'invoice_file', 'invoice_number', 'invoice_date', 'due_date',
            'counterparty', 'counterparty_name',
            'object', 'object_name',
            'contract', 'contract_number',
            'act', 'act_number',
            'category', 'category_name',
            'target_internal_account', 'target_internal_account_name',
            'account', 'account_name',
            'legal_entity', 'legal_entity_name',
            'amount_gross', 'amount_net', 'vat_amount',
            'is_debt', 'skip_recognition',
            'supply_request', 'recurring_payment',
            'bank_payment_order',
            'description', 'comment',
            'recognition_confidence',
            'created_by', 'created_by_name',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at',
            'approved_by', 'approved_by_name', 'approved_at',
            'paid_at',
            'is_overdue',
            'items', 'events',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'source_display', 'status_display', 'invoice_type_display',
            'counterparty_name', 'object_name', 'contract_number',
            'act_number', 'category_name', 'target_internal_account_name',
            'account_name', 'legal_entity_name',
            'created_by_name', 'reviewed_by_name', 'approved_by_name',
            'reviewed_at', 'approved_at', 'paid_at',
            'recognition_confidence',
            'items', 'events',
            'created_at', 'updated_at',
        ]


class InvoiceCreateSerializer(serializers.ModelSerializer):
    """Сериализатор для создания счёта вручную."""

    class Meta:
        model = Invoice
        fields = [
            'id',
            'invoice_type',
            'invoice_file', 'invoice_number', 'invoice_date', 'due_date',
            'counterparty', 'object', 'contract', 'act',
            'category', 'target_internal_account',
            'account', 'legal_entity',
            'amount_gross', 'amount_net', 'vat_amount',
            'is_debt', 'skip_recognition',
            'description',
        ]
        read_only_fields = ['id']


class InvoiceActionSerializer(serializers.Serializer):
    """Сериализатор для actions (approve, reject, reschedule)."""
    comment = serializers.CharField(required=False, allow_blank=True)
    new_date = serializers.DateField(required=False)


# =============================================================================
# RecurringPayment — сериализаторы
# =============================================================================

class RecurringPaymentSerializer(serializers.ModelSerializer):
    counterparty_name = serializers.CharField(source='counterparty.short_name', read_only=True, default=None)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    account_name = serializers.CharField(source='account.name', read_only=True, default=None)
    frequency_display = serializers.CharField(source='get_frequency_display', read_only=True)

    class Meta:
        model = RecurringPayment
        fields = [
            'id', 'name',
            'counterparty', 'counterparty_name',
            'category', 'category_name',
            'account', 'account_name',
            'contract', 'object', 'legal_entity',
            'amount', 'amount_is_fixed',
            'frequency', 'frequency_display',
            'day_of_month',
            'start_date', 'end_date', 'next_generation_date',
            'description', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'counterparty_name', 'category_name', 'account_name', 'frequency_display', 'created_at', 'updated_at']


# =============================================================================
# IncomeRecord — сериализаторы
# =============================================================================

class IncomeRecordSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source='account.name', read_only=True, default=None)
    object_name = serializers.CharField(source='object.name', read_only=True, default=None)
    contract_number = serializers.CharField(source='contract.number', read_only=True, default=None)
    act_number = serializers.CharField(source='act.number', read_only=True, default=None)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    counterparty_name = serializers.CharField(source='counterparty.short_name', read_only=True, default=None)
    income_type_display = serializers.CharField(source='get_income_type_display', read_only=True)

    class Meta:
        model = IncomeRecord
        fields = [
            'id', 'income_type', 'income_type_display',
            'account', 'account_name',
            'object', 'object_name',
            'contract', 'contract_number',
            'act', 'act_number',
            'category', 'category_name',
            'legal_entity', 'counterparty', 'counterparty_name',
            'bank_transaction', 'is_cash',
            'amount', 'payment_date', 'description', 'scan_file',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'income_type_display',
            'account_name', 'object_name', 'contract_number',
            'act_number', 'category_name', 'counterparty_name',
            'created_at', 'updated_at',
        ]


# =============================================================================
# JournalEntry — сериализаторы проводок
# =============================================================================

class JournalEntrySerializer(serializers.ModelSerializer):
    from_account_name = serializers.CharField(source='from_account.name', read_only=True)
    to_account_name = serializers.CharField(source='to_account.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, default=None)
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True, default=None)

    class Meta:
        model = JournalEntry
        fields = [
            'id', 'date',
            'from_account', 'from_account_name',
            'to_account', 'to_account_name',
            'amount', 'description',
            'invoice', 'invoice_number',
            'income_record',
            'created_by', 'created_by_name',
            'is_auto',
            'created_at',
        ]
        read_only_fields = [
            'id', 'from_account_name', 'to_account_name',
            'created_by_name', 'invoice_number',
            'created_at',
        ]
