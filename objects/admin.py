from django.contrib import admin
from .models import Object


@admin.register(Object)
class ObjectAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'address',
        'created_at',
        'updated_at',
    )
    list_filter = (
        'created_at',
        'updated_at',
    )
    search_fields = (
        'name',
        'address',
        'description',
    )
    ordering = ('-created_at',)
    readonly_fields = ('created_at', 'updated_at')
