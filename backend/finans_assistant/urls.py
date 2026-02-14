"""
URL configuration for finans_assistant project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenVerifyView
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from objects.views import ObjectViewSet
from contracts.views import (
    ContractViewSet, ContractAmendmentViewSet, 
    WorkScheduleItemViewSet, ActViewSet, ActPaymentAllocationViewSet,
    FrameworkContractViewSet
)
from payments.views import (
    PaymentViewSet, PaymentRegistryViewSet, ExpenseCategoryViewSet,
    InvoiceViewSet, RecurringPaymentViewSet, IncomeRecordViewSet,
)
from core.views import UserViewSet, NotificationViewSet

# Создаём роутер для ViewSets
router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'objects', ObjectViewSet, basename='object')
router.register(r'contracts', ContractViewSet, basename='contract')
router.register(r'framework-contracts', FrameworkContractViewSet, basename='framework-contract')
router.register(r'contract-amendments', ContractAmendmentViewSet, basename='contract-amendment')
router.register(r'work-schedule', WorkScheduleItemViewSet, basename='work-schedule')
router.register(r'acts', ActViewSet, basename='act')
router.register(r'act-allocations', ActPaymentAllocationViewSet, basename='act-allocation')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'payment-registry', PaymentRegistryViewSet, basename='payment-registry')
router.register(r'expense-categories', ExpenseCategoryViewSet, basename='expense-category')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'recurring-payments', RecurringPaymentViewSet, basename='recurring-payment')
router.register(r'income-records', IncomeRecordViewSet, basename='income-record')

@api_view(['GET'])
def api_root(request):
    """Корневой endpoint API"""
    return Response({
        'message': 'Финансовый ассистент API',
        'version': 'v1',
        'documentation': {
            'swagger': '/api/docs/',
            'redoc': '/api/redoc/',
            'schema': '/api/schema/',
        },
        'endpoints': {
            'auth': {
                'login': '/api/v1/auth/login/',
                'refresh': '/api/v1/auth/refresh/',
                'verify': '/api/v1/auth/verify/',
            },
            'users': '/api/v1/users/',
            'objects': '/api/v1/objects/',
            'commercial-proposals': '/api/v1/commercial-proposals/',
            'contracts': '/api/v1/contracts/',
            'acts': '/api/v1/acts/',
            'payments': '/api/v1/payments/',
            'payment-registry': '/api/v1/payment-registry/',
            'expense-categories': '/api/v1/expense-categories/',
            'accounting': {
                'tax-systems': '/api/v1/tax-systems/',
                'legal-entities': '/api/v1/legal-entities/',
                'accounts': '/api/v1/accounts/',
                'counterparties': '/api/v1/counterparties/',
            },
            'pricelists': {
                'worker-grades': '/api/v1/worker-grades/',
                'work-sections': '/api/v1/work-sections/',
                'worker-grade-skills': '/api/v1/worker-grade-skills/',
                'work-items': '/api/v1/work-items/',
                'price-lists': '/api/v1/price-lists/',
                'price-list-items': '/api/v1/price-list-items/',
                'price-list-agreements': '/api/v1/price-list-agreements/',
            }
        }
    })

urlpatterns = [
    path('admin/', admin.site.urls),
    # OpenAPI/Swagger документация
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    # JWT аутентификация
    path('api/v1/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/v1/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/v1/auth/verify/', TokenVerifyView.as_view(), name='token_verify'),
    # API endpoints
    path('api/v1/', include(router.urls)),
    path('api/v1/', include('accounting.urls')),
    path('api/v1/', include('communications.urls')),
    path('api/v1/', include('pricelists.urls')),
    path('api/v1/', include('estimates.urls')),
    path('api/v1/', include('proposals.urls')),
    path('api/v1/', include('catalog.urls')),
    path('api/v1/', include('llm_services.urls')),
    path('api/v1/', include('worklog.urls')),
    path('api/v1/', include('fns.urls')),
    path('api/v1/', include('personnel.urls')),
    path('api/v1/', include('banking.urls')),
    path('api/v1/', include('supply.urls')),
    path('api/v1/', api_root, name='api-root'),
]

# Раздача медиа файлов в режиме разработки
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
