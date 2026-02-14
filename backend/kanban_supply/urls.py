from rest_framework.routers import DefaultRouter

from kanban_supply.views import SupplyCaseViewSet, InvoiceRefViewSet, DeliveryBatchViewSet


router = DefaultRouter()
router.register(r'v1/supply/cases', SupplyCaseViewSet, basename='supply-case')
router.register(r'v1/supply/invoice_refs', InvoiceRefViewSet, basename='supply-invoice-ref')
router.register(r'v1/supply/deliveries', DeliveryBatchViewSet, basename='supply-delivery-batch')

urlpatterns = router.urls

