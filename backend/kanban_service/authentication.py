from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Tuple

from django.conf import settings
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
import jwt


@dataclass(frozen=True)
class KanbanPrincipal:
    user_id: int | None
    username: str | None
    roles: list[str]
    erp_permissions: dict[str, Any]
    is_service: bool = False

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_staff(self) -> bool:
        return 'admin' in self.roles or 'kanban_admin' in self.roles

    @property
    def is_superuser(self) -> bool:
        return 'admin' in self.roles


class ServiceTokenAuthentication(BaseAuthentication):
    """
    Внутренние вызовы (webhooks/интеграции) без пользовательского JWT.

    Заголовок:
      X-Service-Token: <KANBAN_SERVICE_TOKEN>
    """

    header_name = 'HTTP_X_SERVICE_TOKEN'

    def authenticate(self, request) -> Optional[Tuple[KanbanPrincipal, None]]:
        expected = getattr(settings, 'KANBAN_SERVICE_TOKEN', '')
        if not expected:
            return None

        provided = request.META.get(self.header_name, '')
        if not provided:
            return None

        if provided != expected:
            raise AuthenticationFailed('Invalid service token')

        principal = KanbanPrincipal(
            user_id=None,
            username='service',
            roles=['admin', 'kanban_admin', 'warehouse', 'supply_operator'],
            erp_permissions={},
            is_service=True,
        )
        return principal, None


class ERPJWTAuthentication(BaseAuthentication):
    """
    Верифицирует JWT от ERP (RS256) и создает principal без обращения к БД.
    """

    def authenticate(self, request) -> Optional[Tuple[KanbanPrincipal, None]]:
        auth = get_authorization_header(request).split()
        if not auth:
            return None

        if auth[0].lower() != b'bearer':
            return None

        if len(auth) != 2:
            raise AuthenticationFailed('Invalid Authorization header')

        raw_token = auth[1].decode('utf-8')

        try:
            payload = jwt.decode(
                raw_token,
                key=settings.KANBAN_JWT_VERIFYING_KEY,
                algorithms=[settings.KANBAN_JWT_ALGORITHM],
                audience=settings.KANBAN_JWT_AUDIENCE,
                issuer=settings.KANBAN_JWT_ISSUER,
                options={
                    'require': ['exp', 'nbf', 'iat', 'iss', 'aud'],
                },
            )
        except Exception as exc:
            if getattr(settings, 'DEBUG', False):
                raise AuthenticationFailed(f'Invalid token: {exc}') from exc
            raise AuthenticationFailed('Invalid token') from exc

        roles = payload.get('roles') or []
        if not isinstance(roles, list):
            roles = []

        principal = KanbanPrincipal(
            user_id=payload.get('user_id'),
            username=payload.get('username'),
            roles=[str(r) for r in roles],
            erp_permissions=payload.get('erp_permissions') or {},
            is_service=False,
        )
        return principal, None


class KanbanAuthentication(BaseAuthentication):
    """
    Композитная схема: сначала service token, затем JWT от ERP.
    """

    def __init__(self):
        self._auth_chain = [
            ServiceTokenAuthentication(),
            ERPJWTAuthentication(),
        ]

    def authenticate(self, request):
        for auth in self._auth_chain:
            res = auth.authenticate(request)
            if res is not None:
                return res
        return None

