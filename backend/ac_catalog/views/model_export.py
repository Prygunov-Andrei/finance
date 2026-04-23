"""CSV-экспорт характеристик отдельной модели.

polish-4 п.8 (2026-04-23): кнопка «CSV» в блоке характеристик на детальной
странице модели должна скачивать CSV с 4 столбцами — группа / критерий /
значение / единица. Используется `ModelRawValue` (значения параметров) +
`Criterion.group_display` (человекочитаемая группа).
"""
from __future__ import annotations

import csv
import io

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.request import Request

from ..models import ACModel


# Порядок групп в CSV совпадает с порядком на UI (DetailSpecs):
# климат → компрессор → акустика → управление → габариты → прочее.
# Criterion без group → попадает в «Прочее» (default модели).
GROUP_ORDER = (
    "climate", "compressor", "acoustics",
    "control", "dimensions", "other",
)


class ACModelCSVExportView(generics.GenericAPIView):
    """GET /api/public/v1/rating/models/<slug>/export.csv

    Возвращает CSV-дамп параметров модели. 404 если модель не published.
    """

    permission_classes = [AllowAny]
    # Публичный endpoint, без пагинации.
    pagination_class = None

    def get(self, request: Request, slug: str, *args, **kwargs) -> HttpResponse:
        model = get_object_or_404(
            ACModel.objects.select_related("brand").prefetch_related(
                "raw_values__criterion",
            ),
            slug=slug,
            publish_status=ACModel.PublishStatus.PUBLISHED,
        )

        # Сортируем: сперва по group (фиксированный порядок), потом по code.
        # raw_value без criterion (orphan) — в конце, в «Прочее».
        def sort_key(rv):
            if rv.criterion is None:
                return (len(GROUP_ORDER), "", rv.criterion_code or "")
            group = rv.criterion.group or "other"
            try:
                group_idx = GROUP_ORDER.index(group)
            except ValueError:
                group_idx = len(GROUP_ORDER)
            return (group_idx, group, rv.criterion.code)

        raw_values = sorted(
            [rv for rv in model.raw_values.all() if (rv.raw_value or "").strip()],
            key=sort_key,
        )

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["Группа", "Критерий", "Значение", "Единица"])
        for rv in raw_values:
            if rv.criterion:
                group_display = rv.criterion.get_group_display()
                name = rv.criterion.name_ru
                unit = rv.criterion.unit or ""
            else:
                group_display = "Прочее"
                name = rv.criterion_code or ""
                unit = ""
            writer.writerow([group_display, name, rv.raw_value, unit])

        response = HttpResponse(
            buf.getvalue(),
            content_type="text/csv; charset=utf-8",
        )
        # Имя файла = slug модели. `generate_acmodel_slug` гарантирует ASCII
        # (транслитерация кириллицы + regex ASCII), поэтому cp1251-safe.
        response["Content-Disposition"] = f'attachment; filename="{model.slug}.csv"'
        return response
