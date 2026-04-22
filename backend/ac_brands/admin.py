from __future__ import annotations

from django.contrib import admin, messages
from django.core.files.base import ContentFile
from django.utils.safestring import mark_safe
from django.utils.text import slugify

from .models import Brand, BrandOriginClass
from .services.dark_logo_generator import generate_dark_logo
from .services.logo_normalizer import normalize_logo_file


@admin.register(BrandOriginClass)
class BrandOriginClassAdmin(admin.ModelAdmin):
    list_display = ("origin_type", "fallback_score")
    list_editable = ("fallback_score",)


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "logo_preview",
        "logo_dark_preview",
        "origin_class",
        "sales_start_year_ru",
        "is_active",
        "created_at",
    )
    list_filter = ("is_active", "origin_class")
    search_fields = ("name",)
    list_per_page = 30
    list_select_related = ("origin_class",)
    readonly_fields = ("logo_preview_large", "logo_dark_preview_large")
    actions = ("normalize_selected_logos", "generate_dark_logos_action")

    @admin.action(description="Нормализовать логотипы (crop + canvas 200×56)")
    def normalize_selected_logos(self, request, queryset):
        ok = 0
        for brand in queryset.exclude(logo=""):
            storage = brand.logo.storage
            path = brand.logo.name
            try:
                with storage.open(path, "rb") as f:
                    src = f.read()
                normalized = normalize_logo_file(src)
            except Exception as exc:
                self.message_user(
                    request,
                    f"Ошибка для {brand.name}: {exc}",
                    level=messages.ERROR,
                )
                continue
            storage.delete(path)
            storage.save(path, ContentFile(normalized))
            ok += 1
        self.message_user(request, f"Нормализовано логотипов: {ok}")

    @admin.action(description="Сгенерировать dark-логотипы (для .dark-темы)")
    def generate_dark_logos_action(self, request, queryset):
        ok = 0
        skipped_colored = 0
        failed = 0
        for brand in queryset.exclude(logo=""):
            storage = brand.logo.storage
            path = brand.logo.name
            try:
                with storage.open(path, "rb") as f:
                    src = f.read()
            except Exception as exc:
                self.message_user(
                    request,
                    f"Ошибка чтения {brand.name}: {exc}",
                    level=messages.ERROR,
                )
                failed += 1
                continue

            try:
                dark_bytes = generate_dark_logo(src)
            except Exception as exc:
                self.message_user(
                    request,
                    f"Ошибка генерации {brand.name}: {exc}",
                    level=messages.ERROR,
                )
                failed += 1
                continue

            if dark_bytes is None:
                skipped_colored += 1
                continue

            slug = slugify(brand.name) or "brand"
            dark_name = f"ac_rating/brands/dark/{slug}.png"
            dark_storage = brand.logo_dark.storage if brand.logo_dark else storage

            if brand.logo_dark:
                old_name = brand.logo_dark.name
                try:
                    if old_name and dark_storage.exists(old_name):
                        dark_storage.delete(old_name)
                except Exception:
                    pass

            saved_name = dark_storage.save(dark_name, ContentFile(dark_bytes))
            brand.logo_dark = saved_name
            brand.save(update_fields=["logo_dark"])
            ok += 1

        self.message_user(
            request,
            (
                f"Dark-версии: сохранено={ok}, "
                f"пропущено (colored)={skipped_colored}, "
                f"ошибок={failed}."
            ),
        )

    @admin.display(description="Лого")
    def logo_preview(self, obj: Brand) -> str:
        if obj.logo:
            return mark_safe(f'<img src="{obj.logo.url}" style="height:24px;" />')
        return "—"

    @admin.display(description="Лого (dark)")
    def logo_dark_preview(self, obj: Brand) -> str:
        if obj.logo_dark:
            # Показываем на тёмном фоне (иначе белое лого не видно).
            return mark_safe(
                '<span style="display:inline-block;padding:4px 6px;background:#222;'
                f'border-radius:4px;"><img src="{obj.logo_dark.url}" '
                'style="height:24px;display:block;" /></span>'
            )
        return "—"

    @admin.display(description="Превью")
    def logo_preview_large(self, obj: Brand) -> str:
        if obj.logo:
            return mark_safe(f'<img src="{obj.logo.url}" style="max-height:80px;" />')
        return "Нет логотипа"

    @admin.display(description="Превью (dark)")
    def logo_dark_preview_large(self, obj: Brand) -> str:
        if obj.logo_dark:
            return mark_safe(
                '<span style="display:inline-block;padding:12px 16px;background:#222;'
                f'border-radius:6px;"><img src="{obj.logo_dark.url}" '
                'style="max-height:80px;display:block;" /></span>'
            )
        return "Нет dark-версии (логотип цветной или не сгенерирован)"
