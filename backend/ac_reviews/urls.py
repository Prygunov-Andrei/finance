"""URL-конфигурация публичного API отзывов.

Подключается через include() из ac_catalog.public_urls — namespace там же.
"""
from __future__ import annotations

from django.urls import path

from . import views

urlpatterns = [
    path(
        "models/<int:model_id>/reviews/",
        views.ReviewListView.as_view(),
        name="review-list",
    ),
    path("reviews/", views.ReviewCreateView.as_view(), name="review-create"),
]
