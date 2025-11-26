from django.contrib import admin
from .models import Contract, CommercialProposal


@admin.register(CommercialProposal)
class CommercialProposalAdmin(admin.ModelAdmin):
    list_display = ('number', 'date', 'proposal_type', 'counterparty', 'object', 'total_amount', 'status')
    list_filter = ('status', 'proposal_type', 'object', 'counterparty')
    search_fields = ('number', 'description', 'counterparty__name')


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
        'commercial_proposal',
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
        'counterparty__name', 
        'object__name',
    )
    ordering = ('-contract_date',)
