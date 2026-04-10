from rest_framework.routers import DefaultRouter
from .views import (
    SupplierIntegrationViewSet,
    SupplierProductViewSet,
    SupplierCategoryViewSet,
    SupplierBrandViewSet,
    SupplierSyncLogViewSet,
    SupplierRFQViewSet,
)

router = DefaultRouter()
router.register(r'supplier-integrations', SupplierIntegrationViewSet, basename='supplier-integration')
router.register(r'supplier-products', SupplierProductViewSet, basename='supplier-product')
router.register(r'supplier-categories', SupplierCategoryViewSet, basename='supplier-category')
router.register(r'supplier-brands', SupplierBrandViewSet, basename='supplier-brand')
router.register(r'supplier-sync-logs', SupplierSyncLogViewSet, basename='supplier-sync-log')
router.register(r'supplier-rfq', SupplierRFQViewSet, basename='supplier-rfq')

urlpatterns = router.urls
