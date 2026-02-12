from django.urls import path, include
from rest_framework.routers import DefaultRouter
from banking.views import (
    BankConnectionViewSet,
    BankAccountViewSet,
    BankTransactionViewSet,
    BankPaymentOrderViewSet,
    tochka_webhook,
)

router = DefaultRouter()
router.register(r'bank-connections', BankConnectionViewSet, basename='bank-connection')
router.register(r'bank-accounts', BankAccountViewSet, basename='bank-account')
router.register(r'bank-transactions', BankTransactionViewSet, basename='bank-transaction')
router.register(r'bank-payment-orders', BankPaymentOrderViewSet, basename='bank-payment-order')

urlpatterns = [
    path('', include(router.urls)),
    path('banking/webhook/tochka/', tochka_webhook, name='tochka-webhook'),
]
