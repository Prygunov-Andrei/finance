from django.contrib import admin
from django.utils.html import format_html
from .models import (
    Payment, PaymentRegistry, ExpenseCategory,
    Invoice, InvoiceItem, InvoiceEvent,
    RecurringPayment, IncomeRecord,
)


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    """Админка для категорий расходов/доходов"""
    list_display = (
        'name',
        'code',
        'get_parent',
        'requires_contract',
        'is_active',
        'sort_order',
        'payments_count',
    )
    list_filter = (
        'is_active',
        'requires_contract',
        'parent',
    )
    search_fields = (
        'name',
        'code',
        'description',
    )
    ordering = ('sort_order', 'name')
    readonly_fields = ('created_at', 'updated_at')
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'code', 'parent', 'description')
        }),
        ('Настройки', {
            'fields': ('is_active', 'requires_contract', 'sort_order')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_parent(self, obj):
        """Отображение родительской категории"""
        if obj.parent:
            return format_html(
                '<span style="color: #666;">{}</span>',
                obj.parent.name
            )
        return format_html('<span style="color: #999;">—</span>')
    get_parent.short_description = 'Родительская категория'
    
    def payments_count(self, obj):
        """Количество платежей в категории"""
        count = obj.payments.count()
        if count > 0:
            return format_html(
                '<a href="/admin/payments/payment/?category__id__exact={}">{}</a>',
                obj.id,
                count
            )
        return '0'
    payments_count.short_description = 'Платежей'
    
    def get_queryset(self, request):
        """Оптимизация запросов"""
        return super().get_queryset(request).select_related('parent').prefetch_related('payments')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        'payment_type',
        'amount',
        'payment_date',
        'category',
        'contract',
        'account', # Changed from company_account to account
        'created_at',
    )
    list_filter = (
        'payment_type',
        'payment_date',
        'category',
        'category__parent',
        'contract__object',
        'contract__status',
        'created_at',
    )
    search_fields = (
        'contract__number',
        'contract__name',
        'contract__object__name',
        'category__name',
        'description',
        'account__number', # Changed from company_account to account__number
        'import_batch_id',
    )
    ordering = ('-payment_date',)
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'payment_date'
    fieldsets = (
        ('Основная информация', {
            'fields': ('payment_type', 'payment_date', 'amount', 'category')
        }),
        ('Привязка к договору', {
            'fields': ('contract',),
            'description': 'Оставьте пустым для операционных расходов/доходов'
        }),
        ('Дополнительная информация', {
            'fields': ('account', 'description', 'scan_file', 'import_batch_id') # Changed company_account/document_link
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_queryset(self, request):
        """Оптимизация запросов"""
        return super().get_queryset(request).select_related(
            'contract',
            'contract__object',
            'category',
            'category__parent',
            'account'
        )


@admin.register(PaymentRegistry)
class PaymentRegistryAdmin(admin.ModelAdmin):
    list_display = (
        'amount',
        'planned_date',
        'status',
        'contract',
        'initiator',
        'created_at',
    )
    list_filter = (
        'status',
        'planned_date',
        'contract__object',
        'created_at',
    )
    search_fields = (
        'contract__number',
        'contract__name',
        'contract__object__name',
        'initiator',
        'comment',
    )
    ordering = ('planned_date',)
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'planned_date'


# =============================================================================
# Новые модели
# =============================================================================

class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0
    raw_id_fields = ('product',)


class InvoiceEventInline(admin.TabularInline):
    model = InvoiceEvent
    extra = 0
    readonly_fields = ('event_type', 'user', 'old_value', 'new_value', 'comment', 'created_at')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        'invoice_number', 'counterparty', 'amount_gross',
        'status', 'source', 'due_date', 'object', 'created_at',
    )
    list_filter = ('status', 'source', 'object')
    search_fields = (
        'invoice_number', 'counterparty__name', 'description',
    )
    raw_id_fields = (
        'counterparty', 'object', 'contract', 'category',
        'account', 'legal_entity', 'supply_request',
        'recurring_payment', 'bank_payment_order', 'parsed_document',
        'created_by', 'reviewed_by', 'approved_by',
    )
    readonly_fields = ('created_at', 'updated_at')
    inlines = [InvoiceItemInline, InvoiceEventInline]
    date_hierarchy = 'created_at'


@admin.register(RecurringPayment)
class RecurringPaymentAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'counterparty', 'amount', 'frequency',
        'next_generation_date', 'is_active',
    )
    list_filter = ('is_active', 'frequency')
    search_fields = ('name', 'counterparty__name')
    raw_id_fields = (
        'counterparty', 'category', 'account', 'contract',
        'object', 'legal_entity',
    )


@admin.register(IncomeRecord)
class IncomeRecordAdmin(admin.ModelAdmin):
    list_display = ('amount', 'payment_date', 'account', 'category', 'counterparty')
    list_filter = ('account', 'category')
    search_fields = ('description', 'counterparty__name')
    raw_id_fields = ('account', 'contract', 'category', 'legal_entity', 'counterparty')
    date_hierarchy = 'payment_date'
