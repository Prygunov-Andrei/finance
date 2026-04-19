from __future__ import annotations

from django.contrib import admin
from django.utils.safestring import mark_safe

from .models import Brand, BrandOriginClass


@admin.register(BrandOriginClass)
class BrandOriginClassAdmin(admin.ModelAdmin):
    list_display = ("origin_type", "fallback_score")
    list_editable = ("fallback_score",)


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("name", "logo_preview", "origin_class", "sales_start_year_ru", "is_active", "created_at")
    list_filter = ("is_active", "origin_class")
    search_fields = ("name",)
    list_per_page = 30
    list_select_related = ("origin_class",)
    readonly_fields = ("logo_preview_large",)

    @admin.display(description="Лого")
    def logo_preview(self, obj: Brand) -> str:
        if obj.logo:
            return mark_safe(f'<img src="{obj.logo.url}" style="height:24px;" />')
        return "—"

    @admin.display(description="Превью")
    def logo_preview_large(self, obj: Brand) -> str:
        if obj.logo:
            return mark_safe(f'<img src="{obj.logo.url}" style="max-height:80px;" />')
        return "Нет логотипа"
