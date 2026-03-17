"""
API-key аутентификация для внешних пользователей публичного API.
Заготовка — будет реализована при запуске внешнего сервиса.
"""
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed


class APIKeyAuthentication(BaseAuthentication):
    """
    Аутентификация по API-ключу в заголовке X-API-Key.

    Использование:
        authentication_classes = [APIKeyAuthentication]

    Пока заглушка — всегда возвращает AuthenticationFailed.
    """

    def authenticate(self, request):
        api_key = request.META.get('HTTP_X_API_KEY')
        if not api_key:
            return None

        # TODO: реализовать при создании модели ExternalUser
        # from .models import ExternalUser
        # try:
        #     user = ExternalUser.objects.get(api_key=api_key, is_active=True)
        #     return (user, None)
        # except ExternalUser.DoesNotExist:
        #     raise AuthenticationFailed('Недействительный API-ключ')

        raise AuthenticationFailed('Публичное API ещё не активировано')
