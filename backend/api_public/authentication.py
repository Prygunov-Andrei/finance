"""
Аутентификация внешних пользователей публичного портала.

Два способа:
1. ExternalUserTokenAuth — по session_token в заголовке Authorization: Token <token>
2. APIKeyAuthentication — по X-API-Key (legacy заглушка)
"""
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed


class ExternalUserTokenAuth(BaseAuthentication):
    """
    Аутентификация внешнего пользователя по session_token.

    Заголовок: Authorization: Token <session_token>

    Использование:
        authentication_classes = [ExternalUserTokenAuth]
    """

    keyword = 'Token'

    def authenticate(self, request):
        auth = request.META.get('HTTP_AUTHORIZATION', '').split()
        if not auth or auth[0] != self.keyword:
            return None

        if len(auth) != 2:
            raise AuthenticationFailed('Неверный формат токена')

        token = auth[1]
        from .models import ExternalUser

        try:
            user = ExternalUser.objects.get(session_token=token)
        except ExternalUser.DoesNotExist:
            raise AuthenticationFailed('Недействительный токен')

        if not user.is_session_valid:
            raise AuthenticationFailed('Токен истёк. Войдите заново.')

        return (user, token)

    def authenticate_header(self, request):
        return self.keyword


class APIKeyAuthentication(BaseAuthentication):
    """Аутентификация по API-ключу в заголовке X-API-Key (legacy)."""

    def authenticate(self, request):
        api_key = request.META.get('HTTP_X_API_KEY')
        if not api_key:
            return None

        from .models import ExternalUser
        try:
            user = ExternalUser.objects.get(session_token=api_key)
            if user.is_session_valid:
                return (user, None)
        except ExternalUser.DoesNotExist:
            pass

        raise AuthenticationFailed('Недействительный API-ключ')
