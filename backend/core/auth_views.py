from django.conf import settings as django_settings
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from personnel.models import resolve_permission_level
from core.throttling import LoginRateThrottle


class ERPTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    JWT для внешних сервисов (kanban-service) должен содержать роли/права,
    т.к. kanban не имеет доступа к БД пользователей ERP.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Claims, обязательные для kanban-service (ERPJWTAuthentication)
        token['iss'] = django_settings.JWT_ISSUER
        token['aud'] = django_settings.JWT_AUDIENCE

        employee = getattr(user, 'employee', None)
        erp_permissions = (employee.erp_permissions if employee else None) or {}

        def _level(key):
            return resolve_permission_level(erp_permissions, key)

        roles = []
        if user.is_superuser or user.is_staff:
            roles.append('admin')

        if _level('supply') == 'edit':
            roles.append('supply_operator')

        if _level('supply.warehouse') == 'edit':
            roles.append('warehouse')

        if _level('objects') in ('read', 'edit'):
            roles.append('object_tasks')

        if _level('kanban_admin') == 'edit':
            roles.append('kanban_admin')

        if _level('supply_approve') == 'edit':
            roles.append('director')

        token['roles'] = roles
        token['erp_permissions'] = erp_permissions

        token['username'] = user.username
        token['is_staff'] = bool(user.is_staff)

        return token


class ERPTokenObtainPairView(TokenObtainPairView):
    serializer_class = ERPTokenObtainPairSerializer
    throttle_classes = [LoginRateThrottle]

