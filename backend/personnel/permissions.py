import logging
from rest_framework.permissions import BasePermission

logger = logging.getLogger(__name__)


class ERPSectionPermission(BasePermission):
    """
    Проверяет права доступа сотрудника к разделам ERP.

    Определяет раздел по URL-prefix запроса и проверяет
    erp_permissions у связанного Employee.

    Суперпользователи и staff — всегда имеют полный доступ.
    Пользователи без привязанного Employee — полный доступ (обратная совместимость).
    """

    # Маппинг URL-prefix → код раздела ERP
    SECTION_MAP = {
        '/api/v1/objects/': 'objects',
        '/api/v1/payments/': 'payments',
        '/api/v1/payment-registry/': 'payments',
        '/api/v1/expense-categories/': 'payments',
        '/api/v1/estimates/': 'projects',
        '/api/v1/proposals/': 'proposals',
        '/api/v1/contracts/': 'contracts',
        '/api/v1/framework-contracts/': 'contracts',
        '/api/v1/acts/': 'contracts',
        '/api/v1/catalog/': 'catalog',
        '/api/v1/communications/': 'communications',
        '/api/v1/tax-systems/': 'settings',
        '/api/v1/legal-entities/': 'settings',
        '/api/v1/accounts/': 'settings',
        '/api/v1/personnel/': 'settings',
    }

    # Методы, требующие только чтение
    SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')

    def has_permission(self, request, view):
        user = request.user

        # Анонимные пользователи — нет доступа
        if not user or not user.is_authenticated:
            return False

        # Суперпользователь / staff — всегда OK
        if user.is_superuser or user.is_staff:
            return True

        # Определяем раздел по URL
        path = request.path
        section = None
        for prefix, section_code in self.SECTION_MAP.items():
            if path.startswith(prefix):
                section = section_code
                break

        # URL не в маппинге — разрешаем (auth, users, fns и т.д.)
        if section is None:
            return True

        # Ищем Employee по user
        employee = getattr(user, 'employee', None)
        if employee is None:
            # Пользователь без Employee — полный доступ
            return True

        # Проверяем права
        perms = employee.erp_permissions or {}
        level = perms.get(section, 'none')

        if request.method in self.SAFE_METHODS:
            return level in ('read', 'edit')
        else:
            return level == 'edit'
