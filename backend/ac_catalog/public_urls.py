"""Публичный API рейтинга кондиционеров (/api/public/v1/rating/).

Агрегатор: каталог + методика + экспорт здесь, отзывы и заявки —
через include() из ac_reviews.urls и ac_submissions.urls.
"""
from __future__ import annotations

from django.urls import include, path

from . import views

app_name = "ac_rating_public"

urlpatterns = [
    # ac_catalog — модели + методика + экспорт
    path("models/", views.ACModelListView.as_view(), name="model-list"),
    path("models/archive/", views.ACModelArchiveListView.as_view(), name="model-archive"),
    path("models/<int:pk>/", views.ACModelDetailView.as_view(), name="model-detail"),
    path("models/by-slug/<slug:slug>/", views.ACModelDetailBySlugView.as_view(), name="model-detail-slug"),
    path("methodology/", views.MethodologyView.as_view(), name="methodology"),
    path("export/csv/", views.ExportCSVView.as_view(), name="export-csv"),

    # ac_reviews — отзывы (list по модели + create)
    path("", include(("ac_reviews.urls", "ac_reviews"))),

    # ac_submissions — бренды (для формы) + приём заявок
    path("", include(("ac_submissions.urls", "ac_submissions"))),
]
