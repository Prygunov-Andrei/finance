from django.contrib import admin
from .models import Contract


@admin.register(Contract)
class ContractAdmin(admin.ModelAdmin):
    list_display = (
        'number',
        'name',
        'object',
        'contractor',
        'total_amount',
        'currency',
        'status',
        'contract_date',
    )
    list_filter = (
        'status',
        'currency',
        'contract_date',
        'object__name',
    )
    search_fields = (
        'number',
        'name',
        'contractor',
        'object__name',
    )
    ordering = ('-contract_date',)
