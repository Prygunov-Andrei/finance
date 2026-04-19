from __future__ import annotations

from rest_framework.exceptions import ValidationError

from ac_catalog.i18n import DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES


class LangMixin:
    """Передаёт lang в контекст сериализатора из query params."""

    def get_serializer_context(self) -> dict:
        ctx = super().get_serializer_context()  # type: ignore[misc]
        lang = self.request.query_params.get("lang", DEFAULT_LANGUAGE)  # type: ignore[attr-defined]
        ctx["lang"] = lang if lang in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE
        return ctx


def parse_float_param(value: str | None, name: str) -> float | None:
    if not value:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        raise ValidationError({name: f"Неверное числовое значение: {value}"})
