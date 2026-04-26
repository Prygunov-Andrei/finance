from __future__ import annotations

from django.contrib import admin, messages
from django.utils.html import format_html

from finans_assistant.admin_site import ac_admin_site

from ..models import Criterion

KEY_MEASUREMENT_NOTE = (
    "⚠️ Заметка про «Ключевой замер» (is_key_measurement): "
    "флаг применяется на фронте ТОЛЬКО для критериев, включённых в активную "
    "методологию (MethodologyVersion.is_active=True + "
    "MethodologyCriterion.is_active=True). Сейчас активна методология v1.0. "
    "Если помеченный критерий не показывается на детальной странице модели — "
    "проверь что он включён в v1.0 через раздел «Методологии»."
)

PHOTO_HELP = (
    "📸 Фото критерия отображается на странице методики "
    "(/rating-split-system/methodology/) в карточке параметра. "
    "Загрузите PNG/JPG/WebP до ~2 МБ. Рекомендуемое соотношение — 4:3 или 16:9."
)


@admin.register(Criterion, site=ac_admin_site)
class CriterionAdmin(admin.ModelAdmin):
    """Справочник параметров (standalone).

    См. KEY_MEASUREMENT_NOTE про связку is_key_measurement ↔ активная методология.
    """

    list_display = (
        "code", "name_ru", "photo_thumb", "unit", "value_type", "group",
        "is_active", "is_key_measurement",
    )
    list_editable = ("is_key_measurement",)
    list_filter = ("value_type", "group", "is_active", "is_key_measurement")
    search_fields = ("code", "name_ru", "name_en")
    list_per_page = 50
    ordering = ("code",)
    readonly_fields = ("photo_preview_large",)
    fieldsets = (
        ("Основное", {
            "fields": ("code", "name_ru", "name_en", "name_de", "name_pt", "unit"),
        }),
        ("Фото критерия", {
            "description": PHOTO_HELP,
            "fields": ("photo", "photo_preview_large"),
        }),
        ("Описание", {
            "classes": ("collapse",),
            "fields": (
                "description_ru", "description_en", "description_de", "description_pt",
            ),
        }),
        ("Тип и статус", {
            "description": KEY_MEASUREMENT_NOTE,
            "fields": ("value_type", "group", "is_active", "is_key_measurement"),
        }),
    )

    def photo_thumb(self, obj):
        if not obj.photo:
            return format_html(
                '<span style="color:#bbb;font-size:11px">—</span>'
            )
        return format_html(
            '<img src="{}" style="height:40px;border-radius:3px;object-fit:cover" />',
            obj.photo.url,
        )
    photo_thumb.short_description = "Фото"

    def photo_preview_large(self, obj):
        if not obj.pk or not obj.photo:
            return format_html(
                '<span style="color:#888">Загрузите файл и сохраните, '
                'чтобы увидеть превью</span>'
            )
        return format_html(
            '<img src="{}" style="max-width:320px;max-height:240px;'
            'border:1px solid #ddd;border-radius:4px;display:block" />',
            obj.photo.url,
        )
    photo_preview_large.short_description = "Превью"

    def changelist_view(self, request, extra_context=None):
        messages.info(request, KEY_MEASUREMENT_NOTE)
        return super().changelist_view(request, extra_context=extra_context)
