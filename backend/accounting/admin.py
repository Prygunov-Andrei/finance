from django.contrib import admin
from .models import TaxSystem, LegalEntity, Account, AccountBalance, Counterparty

@admin.register(TaxSystem)
class TaxSystemAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'vat_rate', 'has_vat', 'is_active')
    search_fields = ('name', 'code')
    list_filter = ('has_vat', 'is_active')

@admin.register(LegalEntity)
class LegalEntityAdmin(admin.ModelAdmin):
    list_display = ('short_name', 'inn', 'tax_system', 'is_active')
    search_fields = ('name', 'short_name', 'inn')
    list_filter = ('tax_system', 'is_active')

@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ('name', 'number', 'legal_entity', 'account_type', 'currency', 'balance_date', 'initial_balance', 'is_active')
    search_fields = ('name', 'number', 'legal_entity__name')
    list_filter = ('account_type', 'currency', 'is_active', 'legal_entity')

@admin.register(AccountBalance)
class AccountBalanceAdmin(admin.ModelAdmin):
    list_display = ('account', 'balance_date', 'balance')
    list_filter = ('account', 'balance_date')
    date_hierarchy = 'balance_date'

@admin.register(Counterparty)
class CounterpartyAdmin(admin.ModelAdmin):
    list_display = ('short_name', 'inn', 'type', 'vendor_subtype', 'legal_form', 'is_active')
    search_fields = ('name', 'short_name', 'inn')
    list_filter = ('type', 'vendor_subtype', 'legal_form', 'is_active')
