"""Админский API рейтинга кондиционеров (/api/hvac/rating/).

Ф8A: CRUD моделей и брендов для ERP-операторов.
Ф8B/C: добавятся критерии, методики, отзывы, заявки.
"""
from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from ac_brands import admin_views as brand_admin_views

from . import admin_views

app_name = "ac_rating_admin"

router = DefaultRouter()
router.register(r"models", admin_views.ACModelAdminViewSet, basename="model")
router.register(
    r"brands", brand_admin_views.BrandAdminViewSet, basename="brand",
)
router.register(
    r"equipment-types",
    admin_views.EquipmentTypeAdminViewSet,
    basename="equipment-type",
)
router.register(
    r"regions",
    admin_views.ModelRegionAdminViewSet,
    basename="region",
)

urlpatterns = [
    # Action endpoint'ы регистрируем ДО include(router.urls): иначе
    # `brands/normalize-logos/` риcкует попасть в `brands/<pk>/` маршрут.
    path(
        "brands/normalize-logos/",
        brand_admin_views.BrandNormalizeLogosView.as_view(),
        name="brand-normalize-logos",
    ),
    path(
        "brands/generate-dark-logos/",
        brand_admin_views.BrandGenerateDarkLogosView.as_view(),
        name="brand-generate-dark-logos",
    ),
    path(
        "models/<int:pk>/recalculate/",
        admin_views.ACModelRecalculateView.as_view(),
        name="model-recalculate",
    ),
    path(
        "models/<int:model_id>/photos/",
        admin_views.ACModelPhotoListCreateView.as_view(),
        name="model-photos",
    ),
    path(
        "models/<int:model_id>/photos/reorder/",
        admin_views.ACModelPhotoReorderView.as_view(),
        name="model-photos-reorder",
    ),
    path(
        "models/<int:model_id>/photos/<int:pk>/",
        admin_views.ACModelPhotoDetailView.as_view(),
        name="model-photo-detail",
    ),
    path("", include(router.urls)),
]
