from __future__ import annotations

import csv
import io

from django.http import HttpResponse
from rest_framework import generics
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.request import Request

from ac_methodology.models import MethodologyVersion

from ..models import ACModel
from ..serializers import MethodologySerializer
from .base import LangMixin


class MethodologyView(LangMixin, generics.RetrieveAPIView):
    serializer_class = MethodologySerializer
    permission_classes = [AllowAny]

    def get_object(self):
        obj = MethodologyVersion.objects.prefetch_related(
            "methodology_criteria__criterion",
        ).filter(is_active=True).first()
        if obj is None:
            raise NotFound("Активная методика не найдена")
        return obj


class ExportCSVView(generics.GenericAPIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, *args, **kwargs) -> HttpResponse:
        models = ACModel.objects.select_related("brand").filter(
            publish_status=ACModel.PublishStatus.PUBLISHED,
        ).order_by("-total_index")

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["brand", "model", "nominal_capacity", "total_index", "publish_status"])
        for m in models:
            writer.writerow([m.brand.name, m.inner_unit, m.nominal_capacity, m.total_index, m.publish_status])

        response = HttpResponse(output.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="rating_export.csv"'
        return response
