from rest_framework import serializers
from banking.models import (
    BankConnection,
    BankAccount,
    BankTransaction,
    BankPaymentOrder,
    BankPaymentOrderEvent,
)


# =============================================================================
# BankConnection
# =============================================================================

class BankConnectionListSerializer(serializers.ModelSerializer):
    """Список подключений (без секретов)."""
    legal_entity_name = serializers.CharField(source='legal_entity.short_name', read_only=True)
    provider_display = serializers.CharField(source='get_provider_display', read_only=True)
    payment_mode_display = serializers.CharField(source='get_payment_mode_display', read_only=True)

    class Meta:
        model = BankConnection
        fields = [
            'id', 'name', 'legal_entity', 'legal_entity_name',
            'provider', 'provider_display',
            'payment_mode', 'payment_mode_display',
            'customer_code', 'is_active', 'last_sync_at',
            'created_at',
        ]


class BankConnectionCreateSerializer(serializers.ModelSerializer):
    """Создание / обновление подключения."""

    class Meta:
        model = BankConnection
        fields = [
            'id', 'name', 'legal_entity', 'provider',
            'client_id', 'client_secret', 'customer_code',
            'payment_mode', 'is_active',
        ]
        extra_kwargs = {
            'client_id': {'write_only': True},
            'client_secret': {'write_only': True},
        }


# =============================================================================
# BankAccount
# =============================================================================

class BankAccountSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source='account.name', read_only=True)
    account_number = serializers.CharField(source='account.number', read_only=True)
    connection_name = serializers.CharField(source='bank_connection.name', read_only=True)

    class Meta:
        model = BankAccount
        fields = [
            'id', 'account', 'account_name', 'account_number',
            'bank_connection', 'connection_name',
            'external_account_id', 'last_statement_date',
            'sync_enabled', 'created_at',
        ]


# =============================================================================
# BankTransaction
# =============================================================================

class BankTransactionSerializer(serializers.ModelSerializer):
    transaction_type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.account.name', read_only=True)

    class Meta:
        model = BankTransaction
        fields = [
            'id', 'bank_account', 'bank_account_name',
            'external_id', 'transaction_type', 'transaction_type_display',
            'amount', 'date', 'purpose',
            'counterparty_name', 'counterparty_inn', 'counterparty_kpp',
            'counterparty_account', 'counterparty_bank_name',
            'counterparty_bik', 'counterparty_corr_account',
            'document_number', 'payment', 'reconciled',
            'created_at',
        ]
        read_only_fields = ['external_id', 'raw_data']


class ReconcileSerializer(serializers.Serializer):
    """Сериализатор для привязки транзакции к платежу."""
    payment_id = serializers.IntegerField()


# =============================================================================
# BankPaymentOrder
# =============================================================================

class BankPaymentOrderListSerializer(serializers.ModelSerializer):
    """Список платёжных поручений."""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.account.name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    approved_by_username = serializers.CharField(source='approved_by.username', read_only=True, default='')
    reschedule_count = serializers.IntegerField(read_only=True)
    can_reschedule = serializers.BooleanField(read_only=True)

    class Meta:
        model = BankPaymentOrder
        fields = [
            'id', 'bank_account', 'bank_account_name',
            'payment_registry',
            'recipient_name', 'recipient_inn',
            'amount', 'purpose', 'vat_info',
            'payment_date', 'original_payment_date',
            'status', 'status_display',
            'created_by', 'created_by_username',
            'approved_by', 'approved_by_username', 'approved_at',
            'sent_at', 'executed_at',
            'error_message',
            'reschedule_count', 'can_reschedule',
            'created_at',
        ]


class BankPaymentOrderCreateSerializer(serializers.ModelSerializer):
    """Создание платёжного поручения."""

    class Meta:
        model = BankPaymentOrder
        fields = [
            'bank_account', 'payment_registry',
            'recipient_name', 'recipient_inn', 'recipient_kpp',
            'recipient_account', 'recipient_bank_name',
            'recipient_bik', 'recipient_corr_account',
            'amount', 'purpose', 'vat_info',
            'payment_date',
        ]


class ApproveSerializer(serializers.Serializer):
    """Сериализатор для одобрения платежа."""
    payment_date = serializers.DateField(required=False)
    comment = serializers.CharField(required=False, default='', allow_blank=True)


class RejectSerializer(serializers.Serializer):
    """Сериализатор для отклонения платежа."""
    comment = serializers.CharField(required=False, default='', allow_blank=True)


class RescheduleSerializer(serializers.Serializer):
    """Сериализатор для переноса даты оплаты."""
    payment_date = serializers.DateField()
    comment = serializers.CharField(min_length=1, help_text='Причина переноса (обязательно)')


# =============================================================================
# BankPaymentOrderEvent
# =============================================================================

class BankPaymentOrderEventSerializer(serializers.ModelSerializer):
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True, default='')

    class Meta:
        model = BankPaymentOrderEvent
        fields = [
            'id', 'order', 'event_type', 'event_type_display',
            'user', 'username',
            'old_value', 'new_value', 'comment',
            'created_at',
        ]
