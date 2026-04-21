"""URL-конфиг Estimate CRUD API (E4.1)."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .bulk_views import bulk_create_items, bulk_delete_items, bulk_update_items
from .import_views import import_excel
from .matching_views import match_works, match_works_apply, match_works_progress
from .material_views import (
    match_materials,
    match_materials_apply,
    materials_search_view,
)
from .pdf_views import import_pdf
from .views import EstimateItemViewSet, EstimateSectionViewSet, EstimateViewSet

router = DefaultRouter()
router.register(r"estimates", EstimateViewSet, basename="estimate")
router.register(r"sections", EstimateSectionViewSet, basename="section")

urlpatterns = [
    path("", include(router.urls)),
    # Nested sections under estimate
    path(
        "estimates/<uuid:estimate_pk>/sections/",
        EstimateSectionViewSet.as_view({"get": "list", "post": "create"}),
        name="estimate-sections",
    ),
    # Nested items under estimate
    path(
        "estimates/<uuid:estimate_pk>/items/",
        EstimateItemViewSet.as_view({"get": "list", "post": "create"}),
        name="estimate-items",
    ),
    # Standalone item PATCH/DELETE
    path(
        "items/<uuid:pk>/",
        EstimateItemViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="item-detail",
    ),
    # Bulk (E4.2)
    path("estimates/<uuid:estimate_pk>/items/bulk-create/", bulk_create_items, name="bulk-create-items"),
    path("estimates/<uuid:estimate_pk>/items/bulk-update/", bulk_update_items, name="bulk-update-items"),
    path("estimates/<uuid:estimate_pk>/items/bulk-delete/", bulk_delete_items, name="bulk-delete-items"),
    # Import (E7)
    path("estimates/<uuid:estimate_pk>/import/excel/", import_excel, name="import-excel"),
    # PDF import (E32) — один endpoint, без preview/apply
    path("estimates/<uuid:estimate_pk>/import/pdf/", import_pdf, name="import-pdf"),
    # Matching (E5.1)
    path("estimates/<uuid:estimate_pk>/match-works/", match_works, name="match-works"),
    path("estimates/<uuid:estimate_pk>/match-works/<str:session_id>/", match_works_progress, name="match-works-progress"),
    path("estimates/<uuid:estimate_pk>/match-works/<str:session_id>/apply/", match_works_apply, name="match-works-apply"),
    # Materials catalog + matching (E-MAT-01)
    path("materials/search/", materials_search_view, name="materials-search"),
    path(
        "estimates/<uuid:estimate_pk>/match-materials/",
        match_materials,
        name="match-materials",
    ),
    path(
        "estimates/<uuid:estimate_pk>/match-materials/apply/",
        match_materials_apply,
        name="match-materials-apply",
    ),
]
