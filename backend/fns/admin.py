from django.contrib import admin
from .models import FNSReport, FNSCache


@admin.register(FNSReport)
class FNSReportAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'counterparty', 'report_type', 'inn',
        'report_date', 'requested_by',
    ]
    list_filter = ['report_type', 'report_date']
    search_fields = ['inn', 'counterparty__name']
    readonly_fields = ['data', 'summary', 'report_date', 'created_at', 'updated_at']
    raw_id_fields = ['counterparty', 'requested_by']


@admin.register(FNSCache)
class FNSCacheAdmin(admin.ModelAdmin):
    list_display = ['id', 'endpoint', 'query_hash', 'created_at', 'expires_at']
    list_filter = ['endpoint']
    readonly_fields = ['query_hash', 'query_params', 'response_data', 'created_at']
