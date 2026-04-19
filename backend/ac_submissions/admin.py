from django.contrib import admin
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.html import format_html

from .models import ACSubmission, SubmissionPhoto
from .services import convert_submission_to_acmodel


class SubmissionPhotoInline(admin.TabularInline):
    model = SubmissionPhoto
    extra = 0
    readonly_fields = ("image_preview",)
    fields = ("image_preview", "image", "order")

    @admin.display(description="Превью")
    def image_preview(self, obj):
        if obj.image:
            return format_html(
                '<img src="{}" style="max-height:120px;max-width:200px;" />',
                obj.image.url,
            )
        return "—"


@admin.register(ACSubmission)
class ACSubmissionAdmin(admin.ModelAdmin):
    list_display = (
        "brand_display", "inner_unit", "submitter_email",
        "status", "created_at",
    )
    list_filter = ("status", "created_at")
    list_editable = ("status",)
    search_fields = ("inner_unit", "outer_unit", "submitter_email", "custom_brand_name")
    readonly_fields = (
        "inner_he_surface_area", "outer_he_surface_area",
        "ip_address", "created_at", "updated_at",
        "converted_model_link",
    )
    inlines = [SubmissionPhotoInline]
    actions = ["convert_to_acmodel"]

    fieldsets = (
        ("Модель", {
            "fields": (
                "status", "brand", "custom_brand_name", "series",
                "inner_unit", "outer_unit", "compressor_model",
                "nominal_capacity_watt", "price",
            ),
        }),
        ("Характеристики", {
            "fields": (
                "drain_pan_heater", "erv", "fan_speed_outdoor", "remote_backlight",
                "fan_speeds_indoor", "fine_filters",
                "ionizer_type", "russian_remote", "uv_lamp",
            ),
        }),
        ("Теплообменник внутр. блока", {
            "fields": (
                "inner_he_length_mm", "inner_he_tube_count",
                "inner_he_tube_diameter_mm", "inner_he_surface_area",
            ),
        }),
        ("Теплообменник наруж. блока", {
            "fields": (
                "outer_he_length_mm", "outer_he_tube_count",
                "outer_he_tube_diameter_mm", "outer_he_thickness_mm",
                "outer_he_surface_area",
            ),
        }),
        ("Ссылки", {
            "fields": ("video_url", "buy_url", "supplier_url"),
        }),
        ("Контакт", {
            "fields": ("submitter_email", "consent"),
        }),
        ("Служебное", {
            "fields": (
                "ip_address", "admin_notes",
                "converted_model_link", "created_at", "updated_at",
            ),
            "classes": ("collapse",),
        }),
    )

    @admin.display(description="Бренд")
    def brand_display(self, obj):
        if obj.brand:
            return obj.brand.name
        return f"[NEW] {obj.custom_brand_name}"

    @admin.display(description="Созданная модель")
    def converted_model_link(self, obj):
        if obj.converted_model:
            url = reverse(
                "admin:ac_catalog_acmodel_change",
                args=[obj.converted_model.pk],
            )
            return format_html('<a href="{}">{}</a>', url, obj.converted_model)
        return "—"

    @admin.action(description="Конвертировать в ACModel (черновик)")
    def convert_to_acmodel(self, request, queryset):
        converted = 0
        for submission in queryset.filter(
            status=ACSubmission.Status.PENDING,
            converted_model__isnull=True,
        ):
            ac = convert_submission_to_acmodel(submission)
            converted += 1
            if queryset.count() == 1:
                return redirect(
                    reverse("admin:ac_catalog_acmodel_change", args=[ac.pk]),
                )
        self.message_user(
            request,
            f"Конвертировано заявок: {converted}. "
            f"Модели созданы в статусе «Черновик».",
        )
