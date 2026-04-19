from __future__ import annotations

import logging

from django.contrib import admin, messages

from ac_scoring.engine import recalculate_all

from .models import CalculationResult, CalculationRun

logger = logging.getLogger(__name__)


class CalculationResultInline(admin.TabularInline):
    model = CalculationResult
    extra = 0
    readonly_fields = (
        "model", "criterion", "raw_value",
        "normalized_score", "weighted_score", "above_reference",
    )
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(CalculationRun)
class CalculationRunAdmin(admin.ModelAdmin):
    list_display = (
        "pk", "methodology", "status", "models_processed",
        "triggered_by", "started_at", "finished_at",
    )
    list_filter = ("status", "methodology")
    list_select_related = ("methodology", "triggered_by")
    readonly_fields = (
        "methodology", "status", "models_processed",
        "triggered_by", "started_at", "finished_at", "error_message",
    )
    inlines = [CalculationResultInline]
    actions = ["run_full_recalculation"]

    def has_add_permission(self, request):
        return False

    @admin.action(description="Запустить полный пересчёт по активной методике")
    def run_full_recalculation(self, request, queryset):
        try:
            run = recalculate_all(user=request.user)
            messages.success(
                request,
                f"Расчёт #{run.pk} завершён: {run.models_processed} моделей.",
            )
        except ValueError as e:
            messages.error(request, f"Ошибка: {e}")
