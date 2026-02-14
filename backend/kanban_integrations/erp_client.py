from typing import Any, Dict, Optional

import httpx
from django.conf import settings


def _service_headers() -> Dict[str, str]:
    token = getattr(settings, 'ERP_SERVICE_TOKEN', '')
    if not token:
        return {}
    return {'X-Service-Token': token}


def notify_erp(user_id: int, notification_type: str, title: str, message: str = '', data: Optional[Dict[str, Any]] = None) -> None:
    base = getattr(settings, 'ERP_API_BASE_URL', '').rstrip('/')
    if not base:
        return

    url = f'{base}/notifications/system_create/'
    headers = _service_headers()
    if not headers:
        return

    payload: Dict[str, Any] = {
        'user_id': user_id,
        'notification_type': notification_type,
        'title': title,
        'message': message,
        'data': data or {},
    }

    with httpx.Client(timeout=10) as client:
        resp = client.post(url, json=payload, headers=headers)
        resp.raise_for_status()

