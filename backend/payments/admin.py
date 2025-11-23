from django.contrib import admin
from django.utils.html import format_html
from .models import Payment, PaymentRegistry, ExpenseCategory


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
        'company_account',
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
        'company_account',
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
            'fields': ('company_account', 'description', 'document_link', 'import_batch_id')
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
            'category__parent'
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
