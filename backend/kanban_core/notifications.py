"""
Прямой вызов ERP-уведомлений.

Канбан теперь часть основного бэкенда — HTTP-клиент не нужен,
создаём Notification напрямую через Django ORM.
"""
from typing import Any, Dict, Optional


def notify_erp(user_id: int, notification_type: str, title: str, message: str = '', data: Optional[Dict[str, Any]] = None) -> None:
    """Создать уведомление для пользователя ERP."""
    try:
        from django.contrib.auth import get_user_model
        from core.models import Notification

        User = get_user_model()
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            return

        Notification.objects.create(
            user=user,
            notification_type=notification_type or Notification.NotificationType.GENERAL,
            title=title,
            message=message,
            data=data or {},
        )
    except Exception:
        # Не ломаем канбан-логику из-за ошибки уведомления
        import logging
        logging.getLogger('kanban').exception('notify_erp: ошибка создания уведомления user_id=%s', user_id)
