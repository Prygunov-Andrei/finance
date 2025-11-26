from django.contrib import admin
from .models import Correspondence

@admin.register(Correspondence)
class CorrespondenceAdmin(admin.ModelAdmin):
    list_display = ('type', 'number', 'date', 'subject', 'contract', 'counterparty', 'status')
    list_filter = ('type', 'category', 'status', 'date')
    search_fields = ('number', 'subject', 'description', 'contract__number', 'counterparty__name')
    # autocomplete_fields = ['contract', 'counterparty', 'related_to'] 
    # Autocomplete requires search_fields on related admins, assuming they exist.
