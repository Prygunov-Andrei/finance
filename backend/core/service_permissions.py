from rest_framework.permissions import BasePermission
from django.conf import settings


class IsServiceToken(BasePermission):
    """
    Простая сервисная аутентификация по shared secret:
      X-Service-Token: <ERP_SERVICE_TOKEN>
    """

    def has_permission(self, request, view):
        expected = getattr(settings, 'ERP_SERVICE_TOKEN', '')
        if not expected:
            return False
        provided = request.headers.get('X-Service-Token', '')
        return bool(provided) and provided == expected

