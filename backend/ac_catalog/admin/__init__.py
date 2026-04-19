"""
Регистрация админки каталога рейтинга.

Подмодули импортируются для побочного эффекта @admin.register.
"""

from . import ac_model_admin  # noqa: F401
from . import equipment_admin  # noqa: F401

__all__ = ["ac_model_admin", "equipment_admin"]
