"""Tests for Notification model and NotificationViewSet."""

import pytest
from django.contrib.auth.models import User

from core.models import Notification


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_notification(user, **overrides):
    defaults = {
        'user': user,
        'notification_type': Notification.NotificationType.GENERAL,
        'title': 'Тестовое уведомление',
        'message': 'Текст уведомления',
        'data': {'key': 'value'},
    }
    defaults.update(overrides)
    return Notification.objects.create(**defaults)


# ===================================================================
# Notification Model
# ===================================================================

@pytest.mark.django_db
class TestNotificationModel:
    """Notification creation, defaults, and field behaviour."""

    def test_create_notification(self, admin_user):
        notification = _make_notification(admin_user)
        assert notification.pk is not None
        assert notification.user == admin_user
        assert notification.notification_type == 'general'
        assert notification.title == 'Тестовое уведомление'
        assert notification.message == 'Текст уведомления'
        assert notification.data == {'key': 'value'}

    def test_is_read_default_false(self, admin_user):
        notification = _make_notification(admin_user)
        assert notification.is_read is False

    def test_notification_type_choices(self, admin_user):
        notification = _make_notification(
            admin_user,
            notification_type=Notification.NotificationType.INVOICE_PAID,
            title='Счёт оплачен',
        )
        assert notification.notification_type == 'invoice_paid'

    def test_data_json_field_nullable(self, admin_user):
        notification = _make_notification(admin_user, data=None)
        assert notification.data is None

    def test_str_unread(self, admin_user):
        notification = _make_notification(admin_user, title='Hello')
        result = str(notification)
        assert '●' in result
        assert 'Hello' in result
        assert admin_user.username in result

    def test_str_read(self, admin_user):
        notification = _make_notification(admin_user, title='Hello', is_read=True)
        result = str(notification)
        assert '✓' in result

    def test_ordering_newest_first(self, admin_user):
        n1 = _make_notification(admin_user, title='First')
        n2 = _make_notification(admin_user, title='Second')
        notifications = list(Notification.objects.filter(user=admin_user))
        assert notifications[0].pk == n2.pk
        assert notifications[1].pk == n1.pk

    def test_user_cascade_delete(self, db):
        user = User.objects.create_user(username='temp', password='temp123')
        _make_notification(user, title='will be deleted')
        assert Notification.objects.filter(user=user).count() == 1
        user.delete()
        assert Notification.objects.filter(title='will be deleted').count() == 0


# ===================================================================
# NotificationViewSet
# ===================================================================

@pytest.mark.django_db
class TestNotificationViewSet:
    """API tests for NotificationViewSet."""

    NOTIFICATIONS_URL = '/api/v1/notifications/'

    def test_list_requires_auth(self, api_client):
        response = api_client.get(self.NOTIFICATIONS_URL)
        assert response.status_code == 401

    def test_list_returns_own_notifications(self, admin_user, authenticated_client):
        _make_notification(admin_user, title='Mine')
        other = User.objects.create_user(username='other', password='other123')
        _make_notification(other, title='Not mine')

        response = authenticated_client.get(self.NOTIFICATIONS_URL)
        assert response.status_code == 200
        data = response.json()
        results = data.get('results', data)  # handle pagination
        assert len(results) == 1
        assert results[0]['title'] == 'Mine'

    def test_list_excludes_other_users(self, admin_user, authenticated_client):
        other = User.objects.create_user(username='other2', password='other123')
        _make_notification(other, title='Hidden')

        response = authenticated_client.get(self.NOTIFICATIONS_URL)
        data = response.json()
        results = data.get('results', data)
        assert len(results) == 0

    def test_mark_read(self, admin_user, authenticated_client):
        notification = _make_notification(admin_user)
        assert notification.is_read is False

        url = f'{self.NOTIFICATIONS_URL}{notification.pk}/mark_read/'
        response = authenticated_client.post(url)
        assert response.status_code == 200
        assert response.json()['is_read'] is True

        notification.refresh_from_db()
        assert notification.is_read is True

    def test_mark_read_other_user_404(self, admin_user, authenticated_client):
        other = User.objects.create_user(username='other3', password='other123')
        notification = _make_notification(other, title='Secret')

        url = f'{self.NOTIFICATIONS_URL}{notification.pk}/mark_read/'
        response = authenticated_client.post(url)
        assert response.status_code == 404

    def test_mark_all_read(self, admin_user, authenticated_client):
        _make_notification(admin_user, title='N1')
        _make_notification(admin_user, title='N2')
        _make_notification(admin_user, title='N3')

        assert Notification.objects.filter(user=admin_user, is_read=False).count() == 3

        url = f'{self.NOTIFICATIONS_URL}mark_all_read/'
        response = authenticated_client.post(url)
        assert response.status_code == 200
        assert response.json()['status'] == 'ok'

        assert Notification.objects.filter(user=admin_user, is_read=False).count() == 0

    def test_mark_all_read_does_not_affect_other_user(self, admin_user, authenticated_client):
        other = User.objects.create_user(username='other4', password='other123')
        _make_notification(admin_user, title='Mine')
        _make_notification(other, title='Theirs')

        url = f'{self.NOTIFICATIONS_URL}mark_all_read/'
        authenticated_client.post(url)

        assert Notification.objects.filter(user=other, is_read=False).count() == 1

    def test_unread_count(self, admin_user, authenticated_client):
        _make_notification(admin_user, title='U1')
        _make_notification(admin_user, title='U2')
        _make_notification(admin_user, title='R1', is_read=True)

        url = f'{self.NOTIFICATIONS_URL}unread_count/'
        response = authenticated_client.get(url)
        assert response.status_code == 200
        assert response.json()['count'] == 2

    def test_unread_count_excludes_other_users(self, admin_user, authenticated_client):
        other = User.objects.create_user(username='other5', password='other123')
        _make_notification(admin_user, title='Mine')
        _make_notification(other, title='Theirs')

        url = f'{self.NOTIFICATIONS_URL}unread_count/'
        response = authenticated_client.get(url)
        assert response.json()['count'] == 1

    def test_notification_response_fields(self, admin_user, authenticated_client):
        _make_notification(
            admin_user,
            notification_type=Notification.NotificationType.INVOICE_APPROVED,
            title='Счёт одобрен',
            message='Детали',
            data={'invoice_id': 42},
        )

        response = authenticated_client.get(self.NOTIFICATIONS_URL)
        data = response.json()
        results = data.get('results', data)
        item = results[0]
        assert 'id' in item
        assert item['notification_type'] == 'invoice_approved'
        assert item['title'] == 'Счёт одобрен'
        assert item['message'] == 'Детали'
        assert item['data'] == {'invoice_id': 42}
        assert item['is_read'] is False
        assert 'created_at' in item

    def test_notifications_readonly(self, admin_user, authenticated_client):
        """Notifications are read-only — POST/PUT/PATCH/DELETE should be rejected."""
        response = authenticated_client.post(
            self.NOTIFICATIONS_URL,
            {'title': 'hacked'},
            format='json',
        )
        assert response.status_code in (405, 403)
