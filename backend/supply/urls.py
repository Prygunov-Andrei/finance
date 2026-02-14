from django.urls import path, include
from rest_framework.routers import DefaultRouter
from supply.views import (
    BitrixWebhookView,
    SupplyRequestViewSet,
    BitrixIntegrationViewSet,
)

router = DefaultRouter()
router.register(r'supply-requests', SupplyRequestViewSet, basename='supply-request')
router.register(r'bitrix-integrations', BitrixIntegrationViewSet, basename='bitrix-integration')

urlpatterns = [
    path('supply/webhook/bitrix/', BitrixWebhookView.as_view(), name='bitrix-webhook'),
    path('', include(router.urls)),
]
