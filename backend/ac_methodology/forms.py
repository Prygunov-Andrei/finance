from __future__ import annotations

from django import forms

from .models import MethodologyVersion


class DuplicateMethodologyVersionForm(forms.Form):
    version = forms.CharField(max_length=30, label="Код версии")
    name = forms.CharField(max_length=255, label="Название")
    description = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 4}),
        label="Описание",
        help_text="Если пусто — копируется описание исходной методики.",
    )

    def clean_version(self) -> str:
        v = self.cleaned_data["version"].strip()
        if MethodologyVersion.objects.filter(version=v).exists():
            raise forms.ValidationError("Версия с таким кодом уже существует.")
        return v
