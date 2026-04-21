from django.contrib import admin

from .models import Estimate, EstimateItem, EstimateSection, Material


@admin.register(Estimate)
class EstimateAdmin(admin.ModelAdmin):
    list_display = ("name", "workspace", "status", "version_number", "updated_at")
    list_filter = ("status", "workspace")
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(EstimateSection)
class EstimateSectionAdmin(admin.ModelAdmin):
    list_display = ("name", "estimate", "sort_order")
    raw_id_fields = ("estimate", "workspace")


@admin.register(EstimateItem)
class EstimateItemAdmin(admin.ModelAdmin):
    list_display = ("name", "unit", "quantity", "total", "match_source", "is_key_equipment")
    list_filter = ("match_source", "is_key_equipment", "procurement_status")
    raw_id_fields = ("estimate", "section", "workspace")


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    list_display = ("name", "brand", "model_name", "unit", "price", "workspace", "is_active")
    list_filter = ("is_active", "workspace")
    search_fields = ("name", "brand", "model_name")
    raw_id_fields = ("workspace",)
    readonly_fields = ("id", "created_at", "updated_at")
