"""Регистрация админки методики (импорт модулей срабатывает @admin.register)."""

from __future__ import annotations

from . import criterion_admin  # noqa: F401
from . import methodology_version  # noqa: F401

__all__ = ["criterion_admin", "methodology_version"]
