"""Админка моделей кондиционеров."""

from __future__ import annotations

import tempfile
from pathlib import Path

from django.contrib import admin, messages
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.template.response import TemplateResponse
from django.urls import path, reverse

from ac_methodology.models import MethodologyVersion
from ac_scoring.engine import update_model_total_index

from ac_catalog.models import ACModel, ModelRawValue
from ac_catalog.services import ensure_all_criteria_rows, generate_import_template_xlsx
from ac_catalog.services.model_import import find_existing_models_in_file, import_models_from_file
from ac_catalog.sync_brand_age import sync_brand_age_for_model

from .forms import ACModelForm, ACModelImportForm
from .inlines import ACModelPhotoInline, ACModelSupplierInline, ModelRawValueInline, ModelRegionInline


@admin.register(ACModel)
class ACModelAdmin(admin.ModelAdmin):
    # Шаблон лежит в ac_catalog/templates/admin/ac_catalog/acmodel/ — Django найдёт сам по
    # app_label/model_name, оставляем явный путь для документирования.
    change_list_template = "admin/ac_catalog/acmodel/change_list.html"
    form = ACModelForm
    list_display = (
        "brand",
        "inner_unit",
        "series",
        "nominal_capacity",
        "total_index",
        "publish_status",
        "is_ad",
    )
    list_filter = ("publish_status", "brand", "equipment_type", "is_ad")
    list_select_related = ("brand", "equipment_type")
    search_fields = ("inner_unit", "outer_unit", "brand__name", "series")
    list_per_page = 30
    ordering = ("-total_index",)
    inlines = [ModelRegionInline, ACModelPhotoInline, ACModelSupplierInline, ModelRawValueInline]
    readonly_fields = ("total_index", "created_at", "updated_at")
    # generate_pros_cons (Anthropic AI генерация плюсов/минусов) удалена в Ф4B —
    # вернём в Ф8B вместе с UI методики и явным human-in-the-loop обзором.
    actions = ["recalculate_selected"]

    fieldsets = (
        (
            "Основное",
            {
                "fields": (
                    "brand",
                    "series",
                    "inner_unit",
                    "outer_unit",
                    "nominal_capacity",
                    "equipment_type",
                ),
            },
        ),
        ("Публикация", {"fields": ("publish_status", "total_index", "price")}),
        ("Реклама", {"fields": ("is_ad", "ad_position")}),
        (
            "Плюсы / Минусы (AI)",
            {"classes": ("collapse",), "fields": ("pros_text", "cons_text")},
        ),
        (
            "Видео",
            {"classes": ("collapse",), "fields": ("youtube_url", "rutube_url", "vk_url")},
        ),
        (
            "Даты",
            {"classes": ("collapse",), "fields": ("created_at", "updated_at")},
        ),
    )

    def get_urls(self):
        info = self.opts.app_label, self.opts.model_name
        return [
            path(
                "import-template-xlsx/",
                self.admin_site.admin_view(self.download_import_template_xlsx),
                name="%s_%s_import_template_xlsx" % info,
            ),
            path(
                "import-models/",
                self.admin_site.admin_view(self.import_models_view),
                name="%s_%s_import_models" % info,
            ),
            *super().get_urls(),
        ]

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        methodology = MethodologyVersion.objects.filter(is_active=True).first()
        extra_context["import_template_available"] = methodology is not None
        extra_context["import_models_url"] = reverse(
            "admin:%s_%s_import_models" % (self.opts.app_label, self.opts.model_name),
        )
        if methodology:
            extra_context["import_template_url"] = reverse(
                "admin:%s_%s_import_template_xlsx" % (self.opts.app_label, self.opts.model_name),
            )
        return super().changelist_view(request, extra_context=extra_context)

    def download_import_template_xlsx(self, request: HttpRequest) -> HttpResponse:
        try:
            content, filename = generate_import_template_xlsx()
        except ValueError as e:
            messages.error(request, str(e))
            return redirect(
                "admin:%s_%s_changelist" % (self.opts.app_label, self.opts.model_name),
            )
        response = HttpResponse(
            content,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    def import_models_view(self, request: HttpRequest):
        opts = self.model._meta
        if request.method == "POST":
            form = ACModelImportForm(request.POST, request.FILES)
            if form.is_valid():
                upload = form.cleaned_data["file"]
                publish = bool(form.cleaned_data["publish"])
                confirm_update_existing = bool(form.cleaned_data["confirm_update_existing"])
                suffix = Path(upload.name).suffix.lower()
                if suffix not in {".csv", ".xls", ".xlsx"}:
                    form.add_error("file", "Поддерживаются только .csv, .xls, .xlsx")
                else:
                    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
                        for chunk in upload.chunks():
                            tmp.write(chunk)
                        tmp.flush()
                        existing = find_existing_models_in_file(Path(tmp.name))
                        if existing and not confirm_update_existing:
                            preview = ", ".join(existing[:5])
                            more = f" и ещё {len(existing) - 5}" if len(existing) > 5 else ""
                            form.add_error(
                                None,
                                "В файле найдены уже существующие модели. "
                                "Подтвердите обновление критериев существующих моделей "
                                "(новые одноимённые не будут созданы). "
                                f"Примеры: {preview}{more}.",
                            )
                            context = {
                                **self.admin_site.each_context(request),
                                "opts": opts,
                                "form": form,
                                "title": "Импорт моделей",
                                "subtitle": "Загрузка CSV/XLS/XLSX",
                            }
                            return TemplateResponse(
                                request,
                                "admin/ac_catalog/acmodel/import_models.html",
                                context,
                            )
                        try:
                            imported, errors = import_models_from_file(Path(tmp.name), publish=publish)
                        except ValueError as e:
                            messages.error(request, str(e))
                        else:
                            for err in errors:
                                messages.warning(request, err)
                            messages.success(
                                request,
                                f"Импорт завершён: {imported} моделей, предупреждений: {len(errors)}.",
                            )
                            return redirect(
                                "admin:%s_%s_changelist" % (self.opts.app_label, self.opts.model_name),
                            )
        else:
            form = ACModelImportForm()

        context = {
            **self.admin_site.each_context(request),
            "opts": opts,
            "form": form,
            "title": "Импорт моделей",
            "subtitle": "Загрузка CSV/XLS/XLSX",
        }
        return TemplateResponse(request, "admin/ac_catalog/acmodel/import_models.html", context)

    def change_view(self, request: HttpRequest, object_id, form_url="", extra_context=None):
        ac_model = self.get_object(request, object_id)
        if ac_model:
            ensure_all_criteria_rows(ac_model)
            sync_brand_age_for_model(ac_model)
        return super().change_view(request, object_id, form_url, extra_context)

    @admin.action(description="Пересчитать индекс для выбранных моделей")
    def recalculate_selected(self, request, queryset):
        methodology = MethodologyVersion.objects.filter(is_active=True).first()
        if methodology is None:
            messages.error(request, "Нет активной методики.")
            return
        n = 0
        for obj in queryset.select_related("brand", "brand__origin_class"):
            if update_model_total_index(obj):
                n += 1
        messages.success(request, f"Индекс пересчитан для моделей: {n}.")

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for obj in instances:
            if isinstance(obj, ModelRawValue) and not obj.entered_by_id:
                obj.entered_by = request.user
            obj.save()
        for obj in formset.deleted_objects:
            obj.delete()
        formset.save_m2m()

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        instance = form.instance
        sync_brand_age_for_model(instance)
        update_model_total_index(instance)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if not change:
            ensure_all_criteria_rows(obj)
        sync_brand_age_for_model(obj)
