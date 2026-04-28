from django.contrib import admin

from .models import ImportLog, LLMProfile


@admin.register(LLMProfile)
class LLMProfileAdmin(admin.ModelAdmin):
    list_display = ("name", "base_url", "extract_model", "is_default", "created_at")
    list_filter = ("is_default", "vision_supported")
    search_fields = ("name", "extract_model")
    # api_key_encrypted намеренно скрыт — даже для admin'а отображать его
    # не нужно (только в момент proxy-вызова через get_api_key()).
    exclude = ("api_key_encrypted",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(ImportLog)
class ImportLogAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "estimate",
        "profile",
        "file_type",
        "items_created",
        "cost_usd",
    )
    list_filter = ("file_type", "profile")
    search_fields = ("file_name", "estimate__name")
    readonly_fields = ("created_at", "llm_metadata")
