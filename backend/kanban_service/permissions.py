from rest_framework.permissions import BasePermission


class RolePermission(BasePermission):
    """
    Требует одну из ролей в request.user.roles.

    Использование:
      permission_classes = [RolePermission.required('warehouse')]
    """

    def __init__(self, *required_roles: str):
        self.required_roles = set(required_roles)

    def has_permission(self, request, view):
        user = request.user
        if not user or not getattr(user, 'is_authenticated', False):
            return False

        roles = set(getattr(user, 'roles', []) or [])
        return bool(roles & self.required_roles)

    @classmethod
    def required(cls, *roles: str):
        class _RequiredRolePermission(cls):
            def __init__(self):
                super().__init__(*roles)

        return _RequiredRolePermission

