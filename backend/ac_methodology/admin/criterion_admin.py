from __future__ import annotations

from django.contrib import admin

from ..models import Criterion


@admin.register(Criterion)
class CriterionAdmin(admin.ModelAdmin):
    """Справочник параметров (standalone)."""

    list_display = ("code", "name_ru", "unit", "value_type", "is_active")
    list_filter = ("value_type", "is_active")
    search_fields = ("code", "name_ru", "name_en")
    list_per_page = 50
    ordering = ("code",)
    fieldsets = (
        ("Основное", {
            "fields": ("code", "name_ru", "name_en", "name_de", "name_pt", "unit", "photo"),
        }),
        ("Описание", {
            "classes": ("collapse",),
            "fields": (
                "description_ru", "description_en", "description_de", "description_pt",
            ),
        }),
        ("Тип и статус", {
            "fields": ("value_type", "is_active"),
        }),
    )
