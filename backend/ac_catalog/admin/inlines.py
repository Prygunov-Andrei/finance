"""Инлайны для ACModel в админке."""

from __future__ import annotations

from django.contrib import admin

from ac_catalog.models import ACModelPhoto, ACModelSupplier, ModelRawValue, ModelRegion

from .forms import RawValueFormSet


class ModelRegionInline(admin.TabularInline):
    model = ModelRegion
    extra = 0


class ModelRawValueInline(admin.TabularInline):
    model = ModelRawValue
    formset = RawValueFormSet
    extra = 0
    fields = ("criterion", "raw_value", "compressor_model", "verification_status", "source")
    readonly_fields = ("criterion",)
    ordering = ("criterion__code",)
    can_delete = False

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("criterion", "model__brand")

    def has_add_permission(self, request, obj=None):
        return False


class ACModelPhotoInline(admin.TabularInline):
    model = ACModelPhoto
    extra = 1
    fields = ("image", "order")


class ACModelSupplierInline(admin.TabularInline):
    model = ACModelSupplier
    extra = 1
    fields = (
        "name", "url", "order",
        "price", "city", "rating", "availability", "note",
    )
