import pytest
from django.contrib.auth.models import User


@pytest.mark.django_db
def test_system_notification_requires_service_token(api_client, settings):
    settings.ERP_SERVICE_TOKEN = 'secret'
    u = User.objects.create_user(username='u', password='x')

    resp = api_client.post(
        '/api/v1/notifications/system_create/',
        {'user_id': u.id, 'notification_type': 'general', 'title': 't', 'message': 'm', 'data': {}},
        format='json',
    )
    assert resp.status_code == 403

    resp = api_client.post(
        '/api/v1/notifications/system_create/',
        {'user_id': u.id, 'notification_type': 'general', 'title': 't', 'message': 'm', 'data': {}},
        format='json',
        HTTP_X_SERVICE_TOKEN='wrong',
    )
    assert resp.status_code == 403

    resp = api_client.post(
        '/api/v1/notifications/system_create/',
        {'user_id': u.id, 'notification_type': 'general', 'title': 't', 'message': 'm', 'data': {}},
        format='json',
        HTTP_X_SERVICE_TOKEN='secret',
    )
    assert resp.status_code == 201

