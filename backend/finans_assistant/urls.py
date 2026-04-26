"""
URL configuration for finans_assistant project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from objects.views import ObjectViewSet
from contracts.views import (
    ContractViewSet, ContractAmendmentViewSet, 
    WorkScheduleItemViewSet, ActViewSet, ActPaymentAllocationViewSet,
    FrameworkContractViewSet,
    ContractEstimateViewSet, ContractEstimateSectionViewSet,
    ContractEstimateItemViewSet, ContractTextViewSet,
    EstimatePurchaseLinkViewSet,
)
from payments.views import (
    PaymentViewSet, PaymentRegistryViewSet, ExpenseCategoryViewSet,
    InvoiceViewSet, RecurringPaymentViewSet, IncomeRecordViewSet,
    JournalEntryViewSet, InvoiceItemViewSet,
)
from core.views import UserViewSet, NotificationViewSet, cbr_rates
from core.views import SystemNotificationCreateView
from core.auth_views import ERPTokenObtainPairView
from core.version_views import version_info
from finans_assistant.admin_site import ac_admin_site

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
router.register(r'contract-estimates', ContractEstimateViewSet, basename='contract-estimate')
router.register(r'contract-estimate-sections', ContractEstimateSectionViewSet, basename='contract-estimate-section')
router.register(r'contract-estimate-items', ContractEstimateItemViewSet, basename='contract-estimate-item')
router.register(r'contract-texts', ContractTextViewSet, basename='contract-text')
router.register(r'estimate-purchase-links', EstimatePurchaseLinkViewSet, basename='estimate-purchase-link')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'payment-registry', PaymentRegistryViewSet, basename='payment-registry')
router.register(r'expense-categories', ExpenseCategoryViewSet, basename='expense-category')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'invoice-items', InvoiceItemViewSet, basename='invoice-item')
router.register(r'recurring-payments', RecurringPaymentViewSet, basename='recurring-payment')
router.register(r'income-records', IncomeRecordViewSet, basename='income-record')
router.register(r'journal-entries', JournalEntryViewSet, basename='journal-entry')

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

def health_check(request):
    from django.http import JsonResponse
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('api/v1/health/', health_check, name='health-check'),
    path('api/v1/version/', version_info, name='version-info'),
    # Урезанный admin (whitelist методики + auth + LogEntry).
    # ac_admin_site.name='ac_admin' → namespace='ac_admin'.
    path('admin/', ac_admin_site.urls),
    # Полный admin как backup. admin.site.urls напрямую → namespace='admin'
    # (default). Internal reverse'ы Django admin резолвят через
    # current_app=self.name='admin' и попадают сюда.
    path('hvac-admin/', admin.site.urls),
    # OpenAPI/Swagger документация
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    # JWT аутентификация
    path('api/v1/auth/login/', ERPTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/v1/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/v1/auth/verify/', TokenVerifyView.as_view(), name='token_verify'),
    # API endpoints
    path('api/v1/cbr-rates/', cbr_rates, name='cbr-rates'),
    # Важно: должен матчиться раньше router (иначе попадет в /notifications/{pk}/).
    path('api/v1/notifications/system_create/', SystemNotificationCreateView.as_view(), name='system-notification-create'),
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
    path('api/v1/', include('supplier_integrations.urls')),
    path('api/v1/', include('section_feedback.urls')),
    path('api/v1/', include('marketing.urls')),
    path('api/v1/hvac/', include('hvac_bridge.urls')),
    path('api/hvac/', include('hvac_bridge.public_urls')),
    # Kanban (объединён с основным бэкендом)
    path('api/v1/', include('kanban_files.urls')),
    path('api/v1/', include('kanban_core.urls')),
    path('api/v1/', include('kanban_rules.urls')),
    path('api/v1/', include('kanban_supply.urls')),
    path('api/v1/', include('kanban_warehouse.urls')),
    path('api/v1/', include('kanban_object_tasks.urls')),
    path('api/v1/', include('kanban_commercial.urls')),
    # ISMeta integration (E12: snapshots, E14: JWT)
    path('api/v1/', include('ismeta_integration.urls')),
    path('api/erp-auth/v1/', include(('ismeta_integration.jwt_urls', 'ismeta_jwt'))),
    # Рейтинг кондиционеров: публичный (клиенты) и админский (ERP-операторы) API.
    # Фаза 1 — пустые urlpatterns, роуты приедут в фазе 4 (см. ac-rating/plan.md).
    path('api/public/v1/rating/', include('ac_catalog.public_urls')),
    path('api/hvac/rating/', include('ac_catalog.admin_urls')),
    # Публичный API портала смет (отдельный namespace)
    path('api/public/v1/', include('api_public.urls')),
    # Admin API портала (для ERP-операторов, JWT-аутентификация)
    path('api/v1/portal/', include('api_public.admin_urls')),
    path('api/v1/', api_root, name='api-root'),
]

# Раздача медиа файлов
from django.views.static import serve as static_serve

urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', static_serve, {'document_root': settings.MEDIA_ROOT}),
    re_path(r'^hvac-media/(?P<path>.*)$', static_serve, {'document_root': settings.MEDIA_ROOT}),
    re_path(r'^hvac-static/(?P<path>.*)$', static_serve, {'document_root': settings.STATIC_ROOT}),
]
