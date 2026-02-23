from django.contrib import admin
from .models import (
    Contract, FrameworkContract, ContractAmendment,
    WorkScheduleItem, Act, ActPaymentAllocation, ActItem,
    ContractEstimate, ContractEstimateSection, ContractEstimateItem,
    ContractText, EstimatePurchaseLink,
)


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


@admin.register(ContractText)
class ContractTextAdmin(admin.ModelAdmin):
    list_display = ['contract', 'amendment', 'version', 'created_by', 'created_at']
    list_filter = ['contract']
    search_fields = ['content_md', 'contract__number']
    readonly_fields = ['version', 'created_by', 'created_at', 'updated_at']


class ContractEstimateItemInline(admin.TabularInline):
    model = ContractEstimateItem
    extra = 0
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['product', 'work_item', 'source_item']
    fields = [
        'item_number', 'name', 'unit', 'quantity',
        'material_unit_price', 'work_unit_price',
        'product', 'item_type', 'sort_order',
    ]


@admin.register(ContractEstimate)
class ContractEstimateAdmin(admin.ModelAdmin):
    list_display = [
        'number', 'name', 'contract', 'status',
        'version_number', 'signed_date',
    ]
    list_filter = ['status', 'contract']
    search_fields = ['number', 'name']
    readonly_fields = ['version_number', 'parent_version', 'created_at', 'updated_at']


@admin.register(ContractEstimateSection)
class ContractEstimateSectionAdmin(admin.ModelAdmin):
    list_display = ['name', 'contract_estimate', 'sort_order']
    list_filter = ['contract_estimate']
    inlines = [ContractEstimateItemInline]
    readonly_fields = ['created_at', 'updated_at']


@admin.register(ContractEstimateItem)
class ContractEstimateItemAdmin(admin.ModelAdmin):
    list_display = [
        'item_number', 'name', 'contract_estimate', 'section',
        'unit', 'quantity', 'material_unit_price', 'work_unit_price',
        'item_type', 'is_analog',
    ]
    list_filter = ['contract_estimate', 'item_type', 'is_analog']
    search_fields = ['name', 'model_name']
    raw_id_fields = ['product', 'work_item', 'source_item']
    readonly_fields = ['created_at', 'updated_at']


class ActItemInline(admin.TabularInline):
    model = ActItem
    extra = 0
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['contract_estimate_item']


@admin.register(ActItem)
class ActItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'act', 'unit', 'quantity', 'unit_price', 'amount']
    list_filter = ['act']
    search_fields = ['name']
    raw_id_fields = ['contract_estimate_item']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(EstimatePurchaseLink)
class EstimatePurchaseLinkAdmin(admin.ModelAdmin):
    list_display = [
        'contract_estimate_item', 'invoice_item', 'quantity_matched',
        'match_type', 'price_exceeds', 'quantity_exceeds',
    ]
    list_filter = ['match_type', 'price_exceeds', 'quantity_exceeds']
    raw_id_fields = ['contract_estimate_item', 'invoice_item']
    readonly_fields = ['created_at', 'updated_at']
