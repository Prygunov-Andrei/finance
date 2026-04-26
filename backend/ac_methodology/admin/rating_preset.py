from __future__ import annotations

from django.contrib import admin

from finans_assistant.admin_site import ac_admin_site

from ..models import RatingPreset


@admin.register(RatingPreset, site=ac_admin_site)
class RatingPresetAdmin(admin.ModelAdmin):
    """Редактор пресетов таба «Свой рейтинг» на странице рейтинга.

    `filter_horizontal` на M2M `criteria` даёт удобный двухпанельный UI
    выбора критериев. Если включён `is_all_selected` — M2M не играет роли
    (пресет динамически подтягивает все активные критерии активной
    методики при каждом запросе к `/methodology/`).
    """

    list_display = (
        "order",
        "label",
        "slug",
        "is_active",
        "is_all_selected",
        "criteria_count",
    )
    list_display_links = ("label",)
    list_editable = ("order", "is_active")
    list_filter = ("is_active", "is_all_selected")
    search_fields = ("slug", "label")
    filter_horizontal = ("criteria",)
    fields = (
        "slug",
        "label",
        "order",
        "is_active",
        "is_all_selected",
        "description",
        "criteria",
    )

    @admin.display(description="Критериев")
    def criteria_count(self, obj: RatingPreset) -> str:
        if obj.is_all_selected:
            return "ВСЕ"
        return str(obj.criteria.count())
