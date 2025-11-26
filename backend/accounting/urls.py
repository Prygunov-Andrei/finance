from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TaxSystemViewSet, LegalEntityViewSet, AccountViewSet, 
    AccountBalanceViewSet, CounterpartyViewSet, AnalyticsViewSet
)

router = DefaultRouter()
router.register(r'tax-systems', TaxSystemViewSet)
router.register(r'legal-entities', LegalEntityViewSet)
router.register(r'accounts', AccountViewSet)
router.register(r'account-balances', AccountBalanceViewSet)
router.register(r'counterparties', CounterpartyViewSet)
router.register(r'analytics', AnalyticsViewSet, basename='analytics')

urlpatterns = [
    path('', include(router.urls)),
]
