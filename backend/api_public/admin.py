from django.contrib import admin

from .models import (
    EstimateRequest, EstimateRequestFile, EstimateRequestVersion,
    PublicPortalConfig, PublicPricingConfig, CallbackRequest,
)


class EstimateRequestFileInline(admin.TabularInline):
    model = EstimateRequestFile
    extra = 0
    readonly_fields = [
        'original_filename', 'file_type', 'file_size',
        'parse_status', 'pages_total', 'pages_processed',
        'created_at',
    ]


class EstimateRequestVersionInline(admin.TabularInline):
    model = EstimateRequestVersion
    extra = 0
    readonly_fields = ['version_number', 'generated_by', 'created_at']


class CallbackRequestInline(admin.TabularInline):
    model = CallbackRequest
    extra = 0
    readonly_fields = ['phone', 'status', 'created_at']


@admin.register(EstimateRequest)
class EstimateRequestAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'project_name', 'email', 'company_name', 'status',
        'total_files', 'total_spec_items', 'matched_exact',
        'matched_analog', 'unmatched', 'created_at',
    ]
    list_filter = ['status', 'created_at']
    search_fields = ['email', 'project_name', 'company_name', 'access_token']
    readonly_fields = [
        'access_token', 'task_id', 'progress_percent',
        'total_files', 'processed_files', 'total_spec_items',
        'matched_exact', 'matched_analog', 'unmatched',
        'llm_cost', 'notification_sent', 'downloaded_at',
        'reviewed_by', 'reviewed_at', 'expires_at',
        'created_at', 'updated_at',
    ]
    raw_id_fields = ['estimate']
    inlines = [
        EstimateRequestFileInline,
        EstimateRequestVersionInline,
        CallbackRequestInline,
    ]

    def progress_percent(self, obj):
        return f'{obj.progress_percent}%'
    progress_percent.short_description = 'Прогресс'


@admin.register(EstimateRequestFile)
class EstimateRequestFileAdmin(admin.ModelAdmin):
    list_display = [
        'original_filename', 'request', 'file_type', 'file_size',
        'parse_status', 'pages_total', 'pages_processed', 'created_at',
    ]
    list_filter = ['file_type', 'parse_status']
    search_fields = ['original_filename', 'request__email']
    raw_id_fields = ['request']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(EstimateRequestVersion)
class EstimateRequestVersionAdmin(admin.ModelAdmin):
    list_display = [
        'request', 'version_number', 'generated_by', 'created_at',
    ]
    list_filter = ['generated_by']
    raw_id_fields = ['request']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(PublicPortalConfig)
class PublicPortalConfigAdmin(admin.ModelAdmin):
    list_display = [
        'auto_approve', 'max_files_per_request',
        'max_pages_per_request', 'link_expiry_days',
    ]

    def has_add_permission(self, request):
        # Singleton — разрешаем добавление только если записей нет
        return not PublicPortalConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PublicPricingConfig)
class PublicPricingConfigAdmin(admin.ModelAdmin):
    list_display = ['category', 'markup_percent', 'is_default']
    list_filter = ['is_default']
    raw_id_fields = ['category']


@admin.register(CallbackRequest)
class CallbackRequestAdmin(admin.ModelAdmin):
    list_display = [
        'phone', 'request', 'status', 'processed_by',
        'processed_at', 'created_at',
    ]
    list_filter = ['status', 'created_at']
    search_fields = ['phone', 'request__email', 'comment']
    raw_id_fields = ['request', 'processed_by']
    readonly_fields = ['created_at', 'updated_at']
