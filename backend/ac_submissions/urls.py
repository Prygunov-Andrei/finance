"""URL-конфигурация публичного API заявок и брендов.

Подключается через include() из ac_catalog.public_urls — namespace там же.
"""
from __future__ import annotations

from django.urls import path

from .views import ACSubmissionCreateView, BrandListView

urlpatterns = [
    path("brands/", BrandListView.as_view(), name="brand-list"),
    path("submissions/", ACSubmissionCreateView.as_view(), name="submission-create"),
]
