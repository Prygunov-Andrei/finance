"""
Service Token Authentication для доступа из ERP-фронтенда.

ERP и HVAC имеют разные JWT-ключи. Вместо синхронизации JWT
используем статический сервисный токен из env var ERP_SERVICE_TOKEN.

Фронтенд отправляет: Authorization: ServiceToken <token>
Бэкенд проверяет токен и возвращает виртуального staff-пользователя.
"""
from rest_framework.authentication import BaseAuthentication
from django.conf import settings


class ServiceUser:
    """Виртуальный пользователь для сервисных запросов из ERP."""
    is_authenticated = True
    is_staff = True
    is_active = True
    pk = 0
    id = 0
    username = 'erp-service'
    email = 'erp@service.local'
    first_name = 'ERP'
    last_name = 'Service'

    def __str__(self):
        return self.username

    def save(self, *args, **kwargs):
        pass


class ServiceTokenAuthentication(BaseAuthentication):
    """
    Аутентификация по сервисному токену.
    Header: Authorization: ServiceToken <token>
    """
    keyword = 'ServiceToken'

    def authenticate(self, request):
        token = getattr(settings, 'ERP_SERVICE_TOKEN', '')
        if not token:
            return None

        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith(f'{self.keyword} '):
            return None

        provided_token = auth_header[len(f'{self.keyword} '):]
        if provided_token == token:
            return (ServiceUser(), None)

        return None

    def authenticate_header(self, request):
        return self.keyword
