"""Формы и formset для админки каталога."""

from __future__ import annotations

from django import forms
from django.forms import BaseInlineFormSet
from django.urls import reverse
from django.utils.safestring import mark_safe

from ac_methodology.models import Criterion, MethodologyCriterion, MethodologyVersion

from ac_catalog.models import ACModel

from .datalist import DatalistTextInput, build_hint, build_options, format_number


class RawValueFormSet(BaseInlineFormSet):
    """Настройка виджета raw_value по типу критерия."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        criterion_ids = {
            f.instance.criterion_id
            for f in self.forms
            if f.instance and f.instance.criterion_id
        }
        if not criterion_ids:
            return

        # Загружаем standalone Criterion для value_type/code
        criteria_cache: dict[int, Criterion] = {
            c.pk: c
            for c in Criterion.objects.filter(pk__in=criterion_ids)
        }

        # Загружаем MethodologyCriterion для активной методики (min/max/scale и т.д.)
        active = MethodologyVersion.objects.filter(is_active=True).first()
        mc_cache: dict[int, MethodologyCriterion] = {}
        if active:
            mc_cache = {
                mc.criterion_id: mc
                for mc in MethodologyCriterion.objects.filter(
                    methodology=active,
                    criterion_id__in=criterion_ids,
                ).select_related("criterion")
            }

        for form in self.forms:
            inst = form.instance
            if not inst or not inst.criterion_id:
                continue

            criterion = criteria_cache.get(inst.criterion_id)
            if not criterion:
                continue

            if criterion.value_type == Criterion.ValueType.BRAND_AGE:
                brand = inst.model.brand
                year = brand.sales_start_year_ru
                form.initial["raw_value"] = str(year) if year is not None else ""
                form.fields["raw_value"].widget.attrs["readonly"] = "readonly"
                form.fields["raw_value"].widget.attrs["style"] = (
                    "width:180px;background:#f4f4f4;cursor:not-allowed;"
                )
                url = reverse("admin:ac_brands_brand_change", args=[brand.pk])
                form.fields["raw_value"].help_text = mark_safe(
                    "Автоматически из поля «Год начала продаж в РФ» в "
                    f'<a href="{url}" target="_blank" rel="noopener">справочнике брендов</a>.'
                )
                form.fields["compressor_model"].widget.attrs["readonly"] = "readonly"
                form.fields["compressor_model"].widget.attrs["style"] = (
                    "width:220px;background:#f4f4f4;cursor:not-allowed;"
                )
                continue

            if criterion.code != "compressor_power":
                form.fields["compressor_model"].widget.attrs["readonly"] = "readonly"
                form.fields["compressor_model"].widget.attrs["style"] = (
                    "width:220px;background:#f4f4f4;cursor:not-allowed;"
                )
                form.fields["compressor_model"].help_text = "Заполняется только для критерия «Мощность компрессора»."
            else:
                form.fields["compressor_model"].help_text = "Например: Panasonic R32 Inverter"

            mc = mc_cache.get(inst.criterion_id)
            if mc:
                result = build_options(mc)
                hint = build_hint(mc)

                if result:
                    if result.use_select:
                        choices = [("", "—")] + [(o, o) for o in result.options]
                        form.fields["raw_value"].widget = forms.Select(
                            choices=choices,
                            attrs={"style": "width:180px;"},
                        )
                    else:
                        form.fields["raw_value"].widget = DatalistTextInput(
                            datalist_options=result.options,
                        )
                if hint:
                    form.fields["raw_value"].help_text = hint


_CAPACITY_OPTIONS = [str(v) for v in range(2000, 4100, 100)]


class ACModelForm(forms.ModelForm):
    class Meta:
        model = ACModel
        fields = "__all__"
        widgets = {
            "nominal_capacity": DatalistTextInput(
                datalist_options=_CAPACITY_OPTIONS,
                attrs={"style": "width:200px;"},
            ),
        }


class ACModelImportForm(forms.Form):
    file = forms.FileField(
        label="Файл импорта",
        help_text="Поддерживаются форматы .csv, .xls, .xlsx",
    )
    publish = forms.BooleanField(
        required=False,
        label="Сразу публиковать импортированные модели",
    )
    confirm_update_existing = forms.BooleanField(
        required=False,
        label="Если модель уже есть в базе — обновить её критерии (не создавать дубликат)",
    )
