from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class ERPTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    JWT для внешних сервисов (kanban-service) должен содержать роли/права,
    т.к. kanban не имеет доступа к БД пользователей ERP.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        employee = getattr(user, 'employee', None)
        erp_permissions = (employee.erp_permissions if employee else None) or {}

        roles = []
        if user.is_superuser or user.is_staff:
            roles.append('admin')

        if erp_permissions.get('supply') == 'edit':
            roles.append('supply_operator')

        if erp_permissions.get('warehouse') == 'edit':
            roles.append('warehouse')

        if erp_permissions.get('object_tasks') in ('read', 'edit'):
            roles.append('object_tasks')

        if erp_permissions.get('kanban_admin') == 'edit':
            roles.append('kanban_admin')

        if erp_permissions.get('supply_approve') == 'edit':
            roles.append('director')

        token['roles'] = roles
        token['erp_permissions'] = erp_permissions

        # Опционально: удобные поля для аудита/отладки
        token['username'] = user.username
        token['is_staff'] = bool(user.is_staff)

        return token


class ERPTokenObtainPairView(TokenObtainPairView):
    serializer_class = ERPTokenObtainPairSerializer

