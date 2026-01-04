from django.contrib import admin
from .models import Contract, FrameworkContract


@admin.register(FrameworkContract)
class FrameworkContractAdmin(admin.ModelAdmin):
    list_display = [
        'number', 'name', 'counterparty', 'legal_entity', 
        'status', 'valid_from', 'valid_until', 'is_active_display', 
        'contracts_count'
    ]
    list_filter = ['status', 'legal_entity', 'valid_from', 'valid_until']
    search_fields = ['number', 'name', 'counterparty__name']
    filter_horizontal = ['price_lists']
    readonly_fields = ['created_by', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Основное', {
            'fields': ('number', 'name', 'date', 'status')
        }),
        ('Стороны', {
            'fields': ('legal_entity', 'counterparty')
        }),
        ('Срок действия', {
            'fields': ('valid_from', 'valid_until')
        }),
        ('Прайс-листы', {
            'fields': ('price_lists',)
        }),
        ('Файлы и примечания', {
            'fields': ('file', 'notes')
        }),
        ('Служебное', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def is_active_display(self, obj):
        return obj.is_active
    is_active_display.boolean = True
    is_active_display.short_description = 'Активен'
    
    def contracts_count(self, obj):
        return obj.contracts_count
    contracts_count.short_description = 'Договоров'
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Contract)
class ContractAdmin(admin.ModelAdmin):
    list_display = (
        'number',
        'name',
        'object',
        'counterparty', 
        'total_amount',
        'currency',
        'status',
        'contract_date',
        'technical_proposal',
        'mounting_proposal',
        'framework_contract',
        'responsible_manager',
        'responsible_engineer',
    )
    list_filter = (
        'status',
        'currency',
        'contract_date',
        'object__name',
        'framework_contract',
        'responsible_manager',
        'responsible_engineer',
    )
    search_fields = (
        'number',
        'name',
        'counterparty__name', 
        'object__name',
    )
    ordering = ('-contract_date',)
    
    fieldsets = (
        ('Основное', {
            'fields': ('object', 'number', 'name', 'contract_date', 'status')
        }),
        ('Стороны', {
            'fields': ('legal_entity', 'counterparty', 'contract_type')
        }),
        ('Основания', {
            'fields': ('technical_proposal', 'mounting_proposal', 'parent_contract')
        }),
        ('Рамочный договор и ответственные', {
            'fields': ('framework_contract', 'responsible_manager', 'responsible_engineer')
        }),
        ('Сроки', {
            'fields': ('start_date', 'end_date')
        }),
        ('Финансы', {
            'fields': ('total_amount', 'currency', 'vat_rate', 'vat_included')
        }),
        ('Файлы и примечания', {
            'fields': ('file', 'notes')
        }),
    )
