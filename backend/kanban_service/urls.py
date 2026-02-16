from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from kanban_service.permissions import RolePermission

from django.urls import include


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    return Response({'status': 'ok'})


@api_view(['GET'])
@permission_classes([IsAuthenticated, RolePermission.required('warehouse')])
def rbac_warehouse_only(request):
    return Response({'ok': True})


@api_view(['GET'])
@permission_classes([IsAuthenticated, RolePermission.required('supply_operator')])
def rbac_supply_operator_only(request):
    return Response({'ok': True})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def rbac_whoami(request):
    user = request.user
    return Response({
        'user_id': getattr(user, 'user_id', None),
        'username': getattr(user, 'username', None),
        'roles': getattr(user, 'roles', None),
        'is_service': bool(getattr(user, 'is_service', False)),
    })

@api_view(['GET'])
@permission_classes([AllowAny])
def rbac_echo_auth(request):
    return Response({
        'http_authorization': request.META.get('HTTP_AUTHORIZATION'),
    })


urlpatterns = [
    path('kanban-api/health/', health, name='kanban-health'),

    path('kanban-api/schema/', SpectacularAPIView.as_view(), name='kanban-schema'),
    path('kanban-api/docs/', SpectacularSwaggerView.as_view(url_name='kanban-schema'), name='kanban-swagger-ui'),

    path('kanban-api/', include('kanban_files.urls')),
    path('kanban-api/', include('kanban_core.urls')),
    path('kanban-api/', include('kanban_rules.urls')),
    path('kanban-api/', include('kanban_supply.urls')),
    path('kanban-api/', include('kanban_warehouse.urls')),
    path('kanban-api/', include('kanban_object_tasks.urls')),
    path('kanban-api/', include('kanban_commercial.urls')),

    # RBAC smoke endpoints (Этап 3)
    path('kanban-api/v1/rbac/warehouse_only/', rbac_warehouse_only),
    path('kanban-api/v1/rbac/supply_operator_only/', rbac_supply_operator_only),
    path('kanban-api/v1/rbac/whoami/', rbac_whoami),
    path('kanban-api/v1/rbac/echo_auth/', rbac_echo_auth),
]

