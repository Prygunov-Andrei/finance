from rest_framework import serializers
from .models import TaxSystem, LegalEntity, Account, AccountBalance, Counterparty

class TaxSystemSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxSystem
        fields = ['id', 'code', 'name', 'vat_rate', 'has_vat', 'description']
        read_only_fields = ['id', 'code']  # Код менять нельзя, это константа системы


class LegalEntitySerializer(serializers.ModelSerializer):
    tax_system_details = TaxSystemSerializer(source='tax_system', read_only=True)

    class Meta:
        model = LegalEntity
        fields = ['id', 'name', 'short_name', 'inn', 'kpp', 'ogrn', 'tax_system', 'tax_system_details', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class AccountSerializer(serializers.ModelSerializer):
    legal_entity_name = serializers.CharField(source='legal_entity.short_name', read_only=True)
    current_balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, required=False)

    class Meta:
        model = Account
        fields = [
            'id', 'legal_entity', 'legal_entity_name', 'name', 'number', 
            'account_type', 'bank_name', 'bik', 'currency', 
            'initial_balance', 'balance_date', 'location', 'description', 
            'is_active', 'current_balance'
        ]
        read_only_fields = ['id', 'current_balance']


class AccountBalanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountBalance
        fields = ['id', 'account', 'balance_date', 'balance']


class CounterpartySerializer(serializers.ModelSerializer):
    class Meta:
        model = Counterparty
        fields = [
            'id', 'name', 'short_name', 'type', 'legal_form', 
            'inn', 'kpp', 'ogrn', 'contact_info', 'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

