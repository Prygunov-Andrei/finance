"""Тесты admin API для операторов ERP — Заход 6."""
import pytest
from unittest.mock import patch

from django.contrib.auth.models import User
from rest_framework.test import APIClient

from api_public.models import (
    EstimateRequest, PublicPortalConfig, PublicPricingConfig, CallbackRequest,
)
from api_public.tests.factories import (
    EstimateRequestFactory, CallbackRequestFactory, PublicPricingConfigFactory,
)


@pytest.fixture
def auth_client(db):
    """Аутентифицированный APIClient (JWT)."""
    user = User.objects.create_user(username='operator', password='pass123')
    client = APIClient()
    from rest_framework_simplejwt.tokens import RefreshToken
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
    client._user = user
    return client


@pytest.fixture
def anon_client():
    return APIClient()


@pytest.fixture
def portal_config(db):
    return PublicPortalConfig.objects.create(
        auto_approve=False, operator_emails='op@test.com',
    )


class TestRequestList:

    def test_returns_requests(self, auth_client):
        """GET /api/v1/portal/requests/ — список запросов."""
        EstimateRequestFactory(project_name='Проект 1')
        EstimateRequestFactory(project_name='Проект 2')
        resp = auth_client.get('/api/v1/portal/requests/')
        assert resp.status_code == 200
        assert len(resp.data) == 2

    def test_filter_by_status(self, auth_client):
        """Фильтрация по статусу."""
        EstimateRequestFactory(status='review')
        EstimateRequestFactory(status='delivered')
        resp = auth_client.get('/api/v1/portal/requests/?status=review')
        assert resp.status_code == 200
        assert len(resp.data) == 1
        assert resp.data[0]['status'] == 'review'

    def test_search(self, auth_client):
        """Поиск по email/проекту/компании."""
        EstimateRequestFactory(email='target@test.com', project_name='Нужный')
        EstimateRequestFactory(email='other@test.com', project_name='Другой')
        resp = auth_client.get('/api/v1/portal/requests/?search=target')
        assert len(resp.data) == 1

    def test_requires_auth(self, anon_client):
        """Без JWT → 401."""
        resp = anon_client.get('/api/v1/portal/requests/')
        assert resp.status_code == 401


class TestRequestDetail:

    def test_returns_detail(self, auth_client):
        """GET /api/v1/portal/requests/{id}/ — детали запроса."""
        req = EstimateRequestFactory()
        resp = auth_client.get(f'/api/v1/portal/requests/{req.pk}/')
        assert resp.status_code == 200
        assert resp.data['id'] == req.pk
        assert 'access_token' in resp.data
        assert 'files' in resp.data

    def test_not_found(self, auth_client):
        resp = auth_client.get('/api/v1/portal/requests/99999/')
        assert resp.status_code == 404


class TestRequestApprove:

    @patch('api_public.admin_views.generate_and_deliver')
    def test_approve_review(self, mock_deliver, auth_client):
        """Approve запроса в статусе review → вызов generate_and_deliver."""
        from objects.models import Object
        from accounting.models import LegalEntity, TaxSystem
        from estimates.models import Estimate

        ts, _ = TaxSystem.objects.get_or_create(code='osno', defaults={'name': 'ОСНО'})
        le = LegalEntity.objects.create(name='T', short_name='T', tax_system=ts)
        obj = Object.objects.create(name='T')
        user = User.objects.create_user('est_user')
        estimate = Estimate.objects.create(
            name='Test', object=obj, legal_entity=le, created_by=user,
        )

        req = EstimateRequestFactory(status='review', estimate=estimate)
        resp = auth_client.post(f'/api/v1/portal/requests/{req.pk}/approve/')
        assert resp.status_code == 200
        mock_deliver.assert_called_once()
        req.refresh_from_db()
        assert req.reviewed_by is not None
        assert req.reviewed_at is not None

    def test_approve_wrong_status(self, auth_client):
        """Approve запроса НЕ в статусе review → 400."""
        req = EstimateRequestFactory(status='parsing')
        resp = auth_client.post(f'/api/v1/portal/requests/{req.pk}/approve/')
        assert resp.status_code == 400


class TestRequestReject:

    @patch('api_public.admin_views.send_estimate_error')
    def test_reject(self, mock_email, auth_client):
        """Reject → status=error, email клиенту."""
        req = EstimateRequestFactory(status='review')
        resp = auth_client.post(
            f'/api/v1/portal/requests/{req.pk}/reject/',
            {'reason': 'Неполная документация'},
        )
        assert resp.status_code == 200
        req.refresh_from_db()
        assert req.status == 'error'
        assert 'Неполная документация' in req.error_message
        mock_email.assert_called_once()


class TestPortalConfig:

    def test_get_config(self, auth_client, portal_config):
        """GET /api/v1/portal/config/ — настройки."""
        resp = auth_client.get('/api/v1/portal/config/')
        assert resp.status_code == 200
        assert resp.data['auto_approve'] is False
        assert resp.data['operator_emails'] == 'op@test.com'

    def test_update_config(self, auth_client, portal_config):
        """PUT /api/v1/portal/config/ — обновление."""
        resp = auth_client.put('/api/v1/portal/config/', {
            'auto_approve': True,
            'operator_emails': 'new@test.com',
        }, format='json')
        assert resp.status_code == 200
        portal_config.refresh_from_db()
        assert portal_config.auto_approve is True


class TestPricingConfig:

    def test_list(self, auth_client):
        """GET /api/v1/portal/pricing/ — список наценок."""
        PublicPricingConfigFactory(is_default=True, markup_percent='30.00')
        resp = auth_client.get('/api/v1/portal/pricing/')
        assert resp.status_code == 200
        assert len(resp.data) == 1

    def test_create(self, auth_client):
        """POST /api/v1/portal/pricing/ — создание наценки."""
        resp = auth_client.post('/api/v1/portal/pricing/', {
            'markup_percent': '25.00',
            'is_default': True,
        }, format='json')
        assert resp.status_code == 201

    def test_delete(self, auth_client):
        """DELETE /api/v1/portal/pricing/{id}/ — удаление."""
        config = PublicPricingConfigFactory(is_default=True)
        resp = auth_client.delete(f'/api/v1/portal/pricing/{config.pk}/')
        assert resp.status_code == 204
        assert PublicPricingConfig.objects.count() == 0


class TestCallbacks:

    def test_list(self, auth_client):
        """GET /api/v1/portal/callbacks/ — заявки на звонок."""
        CallbackRequestFactory()
        CallbackRequestFactory()
        resp = auth_client.get('/api/v1/portal/callbacks/')
        assert resp.status_code == 200
        assert len(resp.data) == 2

    def test_update_status(self, auth_client):
        """PATCH /api/v1/portal/callbacks/{id}/ — смена статуса."""
        cb = CallbackRequestFactory(status='new')
        resp = auth_client.patch(
            f'/api/v1/portal/callbacks/{cb.pk}/',
            {'status': 'in_progress'},
            format='json',
        )
        assert resp.status_code == 200
        cb.refresh_from_db()
        assert cb.status == 'in_progress'
        assert cb.processed_by is not None


class TestPortalStats:

    def test_returns_stats(self, auth_client):
        """GET /api/v1/portal/stats/ — статистика."""
        EstimateRequestFactory()
        EstimateRequestFactory(status='delivered')
        resp = auth_client.get('/api/v1/portal/stats/')
        assert resp.status_code == 200
        assert resp.data['total_requests'] == 2
