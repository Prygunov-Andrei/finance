from rest_framework import serializers
from .models import TaxSystem, LegalEntity, Account, AccountBalance, Counterparty

class TaxSystemSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxSystem
        fields = ['id', 'code', 'name', 'vat_rate', 'has_vat', 'description']
        read_only_fields = ['id', 'code']  # Код менять нельзя, это константа системы


class LegalEntitySerializer(serializers.ModelSerializer):
    tax_system_details = serializers.SerializerMethodField()

    class Meta:
        model = LegalEntity
        fields = ['id', 'name', 'short_name', 'inn', 'kpp', 'ogrn', 'tax_system', 'tax_system_details', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_tax_system_details(self, obj):
        """Получить детали системы налогообложения"""
        if obj.tax_system:
            return TaxSystemSerializer(obj.tax_system).data
        return None


class AccountSerializer(serializers.ModelSerializer):
    legal_entity_name = serializers.CharField(source='legal_entity.short_name', read_only=True, allow_null=True)
    current_balance = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = [
            'id', 'legal_entity', 'legal_entity_name', 'name', 'number', 
            'account_type', 'bank_name', 'bik', 'currency', 
            'initial_balance', 'balance_date', 'location', 'description', 
            'is_active', 'current_balance', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'current_balance', 'created_at', 'updated_at']
    
    def get_current_balance(self, obj):
        """Получить текущий баланс счета"""
        try:
            return obj.get_current_balance()
        except Exception:
            return None


class AccountBalanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountBalance
        fields = ['id', 'account', 'balance_date', 'balance']


class CounterpartySerializer(serializers.ModelSerializer):
    vendor_subtype_display = serializers.CharField(source='get_vendor_subtype_display', read_only=True)
    
    class Meta:
        model = Counterparty
        fields = [
            'id', 'name', 'short_name', 'type', 'vendor_subtype', 'vendor_subtype_display', 
            'legal_form', 'inn', 'kpp', 'ogrn', 'address', 'contact_info', 'notes', 'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'vendor_subtype_display', 'created_at']
    
    def validate(self, data):
        """Валидация: vendor_subtype можно указывать только для type='vendor'"""
        vendor_subtype = data.get('vendor_subtype')
        counterparty_type = data.get('type') or (self.instance.type if self.instance else None)
        
        if vendor_subtype and counterparty_type != Counterparty.Type.VENDOR:
            raise serializers.ValidationError({
                'vendor_subtype': 'Подтип можно указывать только для контрагентов типа "Исполнитель/Поставщик"'
            })
        
        return data

