from django.contrib import admin

from .models import LLMProvider, LLMTaskConfig, ParsedDocument


@admin.register(LLMProvider)
class LLMProviderAdmin(admin.ModelAdmin):
    list_display = ('provider_type', 'model_name', 'is_active', 'is_default', 'supports_web_search')
    list_filter = ('provider_type', 'is_active', 'is_default', 'supports_web_search')
    list_editable = ('is_active', 'is_default', 'supports_web_search')


@admin.register(LLMTaskConfig)
class LLMTaskConfigAdmin(admin.ModelAdmin):
    list_display = ('task_type', 'provider', 'is_enabled')
    list_filter = ('is_enabled',)
    list_editable = ('provider', 'is_enabled')


@admin.register(ParsedDocument)
class ParsedDocumentAdmin(admin.ModelAdmin):
    list_display = ('original_filename', 'status', 'provider', 'confidence_score', 'created_at')
    list_filter = ('status', 'provider')
    readonly_fields = ('file_hash', 'raw_response', 'parsed_data')
