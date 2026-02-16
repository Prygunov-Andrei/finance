from django.contrib import admin
from kanban_commercial.models import CommercialCase


@admin.register(CommercialCase)
class CommercialCaseAdmin(admin.ModelAdmin):
    list_display = ['id', 'erp_object_name', 'system_name', 'erp_counterparty_name', 'created_at']
    search_fields = ['erp_object_name', 'erp_counterparty_name', 'system_name']
    readonly_fields = ['id', 'created_at', 'updated_at']
