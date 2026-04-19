"""Подсказки datalist и вспомогательные функции для полей сыр. значений."""

from __future__ import annotations

from django import forms
from django.utils.safestring import mark_safe

from ac_methodology.models import Criterion, MethodologyCriterion

from .constants import INTEGER_DATALIST_CRITERION_CODES, MAX_DATALIST_OPTIONS


def numeric_step(mn: float, mx: float) -> float:
    """Шаг для числовой шкалы, чтобы получить ~20–80 вариантов."""
    rng = mx - mn
    if rng < 1:
        return 0.01
    if rng < 5:
        return 0.05
    if rng < 50:
        return 0.5
    return 1.0


def format_number(val: float) -> str:
    """Формат числа без лишних нулей."""
    if val == int(val):
        return str(int(val))
    return f"{val:.4f}".rstrip("0").rstrip(".")


def integer_range_options(mn: float, mx: float) -> list[str]:
    """Целые от mn до mx включительно."""
    start = int(round(mn))
    end = int(round(mx))
    if start > end:
        start, end = end, start
    values = list(range(start, end + 1))
    if len(values) <= MAX_DATALIST_OPTIONS:
        return [str(i) for i in values]
    step = max(1, (end - start) // (MAX_DATALIST_OPTIONS - 1))
    out: list[int] = []
    for i in range(start, end + 1, step):
        out.append(i)
    if out[-1] != end:
        out.append(end)
    return [str(i) for i in out]


class OptionsResult:
    """Результат build_options: список вариантов + рекомендуемый тип виджета."""

    __slots__ = ("options", "use_select")

    def __init__(self, options: list[str], *, use_select: bool = False):
        self.options = options
        self.use_select = use_select

    def __bool__(self) -> bool:
        return bool(self.options)


def build_options(criterion: MethodologyCriterion) -> OptionsResult:
    """Варианты для поля raw_value по типу критерия."""
    if criterion.value_type == Criterion.ValueType.BINARY:
        return OptionsResult(["есть", "нет"], use_select=True)

    if criterion.value_type == Criterion.ValueType.BRAND_AGE:
        return OptionsResult([])

    if criterion.value_type == Criterion.ValueType.FALLBACK:
        return OptionsResult([str(v) for v in range(500, 5100, 100)])

    scale = criterion.custom_scale_json
    if isinstance(scale, dict) and scale:
        seen: set[str] = set()
        opts: list[str] = []
        for key in scale:
            label = str(key).strip()
            if label.lower() not in seen:
                seen.add(label.lower())
                opts.append(label)
        return OptionsResult(opts, use_select=True)

    mn = criterion.min_value
    mx = criterion.max_value
    if mn is not None and mx is not None and mx > mn:
        if criterion.code in INTEGER_DATALIST_CRITERION_CODES:
            return OptionsResult(integer_range_options(float(mn), float(mx)))
        step = numeric_step(mn, mx)
        count = int((mx - mn) / step) + 1
        if count > MAX_DATALIST_OPTIONS:
            step = (mx - mn) / MAX_DATALIST_OPTIONS
        opts: list[str] = []
        val = mn
        while val <= mx + step * 0.01:
            opts.append(format_number(round(val, 4)))
            val += step
            if len(opts) > MAX_DATALIST_OPTIONS:
                break
        return OptionsResult(opts)

    return OptionsResult([])


def build_hint(criterion: MethodologyCriterion) -> str:
    """Текст подсказки для поля значения."""
    parts: list[str] = []

    if criterion.unit:
        parts.append(criterion.unit)

    if criterion.min_value is not None and criterion.max_value is not None:
        inv = " ↓инв." if criterion.is_inverted else ""
        parts.append(f"{criterion.min_value}–{criterion.max_value}{inv}")

    if criterion.median_value is not None:
        parts.append(f"мед. {criterion.median_value}")

    if criterion.value_type == Criterion.ValueType.BRAND_AGE:
        parts.append("авто: поле «Год начала продаж в РФ» в справочнике брендов")

    if criterion.value_type == Criterion.ValueType.FALLBACK:
        parts.append("Вт компрессора, fallback по бренду")

    return " | ".join(parts)


class DatalistTextInput(forms.TextInput):
    """Поле ввода с HTML datalist."""

    def __init__(self, datalist_options: list[str], attrs=None):
        self.datalist_options = datalist_options
        super().__init__(attrs=attrs)

    def render(self, name, value, attrs=None, renderer=None):
        dl_id = f"dl_{name}"
        attrs = attrs or {}
        attrs["list"] = dl_id
        attrs["autocomplete"] = "off"
        attrs.setdefault("style", "width:180px;")

        input_html = super().render(name, value, attrs, renderer)

        options_html = "".join(
            f'<option value="{opt}">' for opt in self.datalist_options
        )
        datalist_html = f'<datalist id="{dl_id}">{options_html}</datalist>'

        return mark_safe(input_html + datalist_html)
