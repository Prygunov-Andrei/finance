"""
Custom throttle classes for ERP API.
"""
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """Strict throttle for login endpoint — 5 attempts per minute."""
    scope = 'login'
    rate = '5/min'


class FinanceWriteThrottle(UserRateThrottle):
    """Throttle for write operations on financial data — 30/min per user."""
    scope = 'finance_write'
    rate = '30/min'


class ReadOnlyThrottle(UserRateThrottle):
    """Relaxed throttle for read-only endpoints — 120/min per user."""
    scope = 'read_only'
    rate = '120/min'
