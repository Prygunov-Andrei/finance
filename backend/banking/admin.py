from django.contrib import admin
from banking.models import (
    BankConnection,
    BankAccount,
    BankTransaction,
    BankPaymentOrder,
    BankPaymentOrderEvent,
)


class BankAccountInline(admin.TabularInline):
    model = BankAccount
    extra = 0
    readonly_fields = ('last_statement_date',)


@admin.register(BankConnection)
class BankConnectionAdmin(admin.ModelAdmin):
    list_display = ('name', 'legal_entity', 'provider', 'payment_mode', 'is_active', 'last_sync_at')
    list_filter = ('provider', 'is_active', 'payment_mode')
    search_fields = ('name', 'legal_entity__name', 'customer_code')
    inlines = [BankAccountInline]
    # Скрываем зашифрованные поля от просмотра в admin
    exclude = ('access_token', 'refresh_token', 'token_expires_at')


@admin.register(BankAccount)
class BankAccountAdmin(admin.ModelAdmin):
    list_display = ('account', 'bank_connection', 'external_account_id', 'sync_enabled', 'last_statement_date')
    list_filter = ('sync_enabled',)
    search_fields = ('account__name', 'external_account_id')


@admin.register(BankTransaction)
class BankTransactionAdmin(admin.ModelAdmin):
    list_display = ('date', 'transaction_type', 'amount', 'counterparty_name', 'purpose_short', 'reconciled')
    list_filter = ('transaction_type', 'reconciled', 'date')
    search_fields = ('counterparty_name', 'counterparty_inn', 'purpose', 'external_id')
    readonly_fields = ('raw_data',)
    date_hierarchy = 'date'

    def purpose_short(self, obj):
        return obj.purpose[:80] + '...' if len(obj.purpose) > 80 else obj.purpose
    purpose_short.short_description = 'Назначение'


class BankPaymentOrderEventInline(admin.TabularInline):
    model = BankPaymentOrderEvent
    extra = 0
    readonly_fields = ('event_type', 'user', 'created_at', 'old_value', 'new_value', 'comment')
    can_delete = False


@admin.register(BankPaymentOrder)
class BankPaymentOrderAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'recipient_name', 'amount', 'payment_date',
        'original_payment_date', 'status', 'created_by', 'approved_by',
    )
    list_filter = ('status', 'payment_date')
    search_fields = ('recipient_name', 'recipient_inn', 'purpose')
    readonly_fields = ('original_payment_date', 'raw_response')
    date_hierarchy = 'payment_date'
    inlines = [BankPaymentOrderEventInline]


@admin.register(BankPaymentOrderEvent)
class BankPaymentOrderEventAdmin(admin.ModelAdmin):
    list_display = ('order', 'event_type', 'user', 'created_at', 'comment_short')
    list_filter = ('event_type',)
    readonly_fields = ('order', 'event_type', 'user', 'old_value', 'new_value', 'comment')

    def comment_short(self, obj):
        return obj.comment[:60] + '...' if len(obj.comment) > 60 else obj.comment
    comment_short.short_description = 'Комментарий'
