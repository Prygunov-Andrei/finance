from django.contrib import admin
from supply.models import BitrixIntegration, SupplyRequest


@admin.register(BitrixIntegration)
class BitrixIntegrationAdmin(admin.ModelAdmin):
    list_display = ('name', 'portal_url', 'target_stage_id', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'portal_url')


@admin.register(SupplyRequest)
class SupplyRequestAdmin(admin.ModelAdmin):
    list_display = (
        'bitrix_deal_id', 'bitrix_deal_title', 'object', 'contract',
        'status', 'amount', 'created_at',
    )
    list_filter = ('status', 'bitrix_integration')
    search_fields = ('bitrix_deal_title', 'bitrix_deal_id')
    raw_id_fields = ('object', 'contract', 'operator', 'bitrix_integration')
