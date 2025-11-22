from django.contrib import admin
from .models import ImportLog


@admin.register(ImportLog)
class ImportLogAdmin(admin.ModelAdmin):
    list_display = (
        'file_name',
        'file_type',
        'status',
        'records_count',
        'success_count',
        'error_count',
        'user',
        'import_date',
    )
    list_filter = (
        'status',
        'file_type',
        'import_date',
        'user',
    )
    search_fields = (
        'file_name',
        'import_batch_id',
        'file_path',
        'errors',
    )
    ordering = ('-import_date',)
    readonly_fields = (
        'created_at',
        'updated_at',
        'import_date',
        'success_rate',
    )
    date_hierarchy = 'import_date'
    fieldsets = (
        ('Основная информация', {
            'fields': (
                'import_batch_id',
                'user',
                'file_name',
                'file_type',
                'file_size',
                'file_path',
            )
        }),
        ('Статус обработки', {
            'fields': (
                'status',
                'records_count',
                'success_count',
                'error_count',
                'success_rate',
            )
        }),
        ('Ошибки', {
            'fields': ('errors',),
            'classes': ('collapse',),
        }),
        ('Временные метки', {
            'fields': (
                'import_date',
                'created_at',
                'updated_at',
            )
        }),
    )
