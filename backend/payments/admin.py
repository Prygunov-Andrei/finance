from django.contrib import admin
from .models import Payment, PaymentRegistry


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        'payment_type',
        'amount',
        'payment_date',
        'contract',
        'company_account',
        'created_at',
    )
    list_filter = (
        'payment_type',
        'payment_date',
        'contract__object',
        'contract__status',
        'created_at',
    )
    search_fields = (
        'contract__number',
        'contract__name',
        'contract__object__name',
        'description',
        'company_account',
        'import_batch_id',
    )
    ordering = ('-payment_date',)
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'payment_date'


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
