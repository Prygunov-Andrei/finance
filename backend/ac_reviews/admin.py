from __future__ import annotations

from django.contrib import admin, messages
from django.utils.html import format_html

from .models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = (
        "model",
        "author_name",
        "rating",
        "is_approved",
        "created_at",
        "short_comment",
    )
    list_filter = ("is_approved", "rating", "created_at")
    list_editable = ("is_approved",)
    search_fields = (
        "author_name",
        "comment",
        "pros",
        "cons",
        "model__inner_unit",
        "model__brand__name",
    )
    readonly_fields = ("ip_address", "created_at", "updated_at")
    list_select_related = ("model", "model__brand")
    list_per_page = 50
    actions = ["approve_selected", "reject_selected"]

    fieldsets = (
        ("Связь", {"fields": ("model",)}),
        ("Содержание", {"fields": ("author_name", "rating", "pros", "cons", "comment")}),
        ("Модерация", {"fields": ("is_approved",)}),
        ("Метаданные", {"fields": ("ip_address", "created_at", "updated_at"), "classes": ("collapse",)}),
    )

    @admin.display(description="Комментарий")
    def short_comment(self, obj: Review) -> str:
        text = obj.comment or ""
        return format_html("<span>{}</span>", text[:60] + ("…" if len(text) > 60 else ""))

    @admin.action(description="Одобрить выбранные отзывы")
    def approve_selected(self, request, queryset):
        updated = queryset.update(is_approved=True)
        self.message_user(request, f"Одобрено: {updated}", level=messages.SUCCESS)

    @admin.action(description="Отклонить (снять одобрение) выбранные")
    def reject_selected(self, request, queryset):
        updated = queryset.update(is_approved=False)
        self.message_user(request, f"Снято одобрение: {updated}", level=messages.WARNING)
