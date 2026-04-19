"""Админка типов оборудования."""

from django.contrib import admin

from ac_catalog.models import EquipmentType


@admin.register(EquipmentType)
class EquipmentTypeAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)
