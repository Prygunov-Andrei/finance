"""Tests for supply.views — webhook, SupplyRequest CRUD, BitrixIntegration CRUD."""

from unittest.mock import patch

import pytest
from django.urls import reverse

from supply.models import BitrixIntegration, SupplyRequest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_integration(**overrides):
    defaults = {
        'name': 'Test Integration',
        'portal_url': 'https://test.bitrix24.ru',
        'webhook_url': 'https://test.bitrix24.ru/rest/1/abc/',
        'outgoing_webhook_token': 'test-token-123',
        'target_stage_id': 'C1:NEW',
    }
    defaults.update(overrides)
    return BitrixIntegration.objects.create(**defaults)


def _make_supply_request(integration, **overrides):
    defaults = {
        'bitrix_integration': integration,
        'bitrix_deal_id': 1001,
        'bitrix_deal_title': 'Закупка материалов',
    }
    defaults.update(overrides)
    return SupplyRequest.objects.create(**defaults)


WEBHOOK_URL = reverse('bitrix-webhook')


# ===================================================================
# BitrixWebhookView
# ===================================================================

@pytest.mark.django_db
class TestBitrixWebhookView:
    """POST /api/v1/supply/webhook/bitrix/"""

    @patch('supply.tasks.process_bitrix_deal')
    def test_valid_webhook(self, mock_task, api_client):
        integration = _make_integration()
        payload = {
            'application_token': integration.outgoing_webhook_token,
            'data': {'FIELDS': {'ID': '555'}},
        }
        resp = api_client.post(WEBHOOK_URL, payload, format='json')
        assert resp.status_code == 200
        assert resp.data == {'status': 'ok'}
        mock_task.delay.assert_called_once_with(555, integration.id)

    @patch('supply.tasks.process_bitrix_deal')
    def test_cutover_disabled_webhook_returns_200_and_does_not_queue(self, mock_task, api_client, settings):
        settings.BITRIX_WEBHOOK_ENABLED = False
        integration = _make_integration()
        payload = {
            'application_token': integration.outgoing_webhook_token,
            'data': {'FIELDS': {'ID': '555'}},
        }
        resp = api_client.post(WEBHOOK_URL, payload, format='json')
        assert resp.status_code == 200
        assert resp.data == {'status': 'disabled'}
        mock_task.delay.assert_not_called()

    def test_invalid_token_returns_403(self, api_client):
        _make_integration()
        payload = {
            'application_token': 'wrong-token',
            'data': {'FIELDS': {'ID': '555'}},
        }
        resp = api_client.post(WEBHOOK_URL, payload, format='json')
        assert resp.status_code == 403

    @patch('supply.tasks.process_bitrix_deal')
    def test_missing_deal_id_returns_400(self, mock_task, api_client):
        integration = _make_integration()
        payload = {
            'application_token': integration.outgoing_webhook_token,
            'data': {'FIELDS': {}},
        }
        resp = api_client.post(WEBHOOK_URL, payload, format='json')
        assert resp.status_code == 400
        mock_task.delay.assert_not_called()

    def test_missing_token_returns_400(self, api_client):
        payload = {
            'data': {'FIELDS': {'ID': '555'}},
        }
        resp = api_client.post(WEBHOOK_URL, payload, format='json')
        assert resp.status_code == 400


# ===================================================================
# SupplyRequestViewSet
# ===================================================================

@pytest.mark.django_db
class TestSupplyRequestViewSet:
    """CRUD /api/v1/supply-requests/"""

    URL_LIST = reverse('supply-request-list')

    def _detail_url(self, pk):
        return reverse('supply-request-detail', args=[pk])

    def test_list(self, authenticated_client):
        integration = _make_integration()
        _make_supply_request(integration, bitrix_deal_id=1)
        _make_supply_request(integration, bitrix_deal_id=2)

        resp = authenticated_client.get(self.URL_LIST)
        assert resp.status_code == 200
        assert resp.data['count'] == 2
        assert len(resp.data['results']) == 2

    def test_retrieve(self, authenticated_client):
        integration = _make_integration()
        sr = _make_supply_request(integration)
        resp = authenticated_client.get(self._detail_url(sr.pk))
        assert resp.status_code == 200
        assert resp.data['bitrix_deal_id'] == sr.bitrix_deal_id
        # detail serializer includes raw data
        assert 'raw_deal_data' in resp.data

    def test_update_status(self, authenticated_client):
        integration = _make_integration()
        sr = _make_supply_request(integration)
        resp = authenticated_client.patch(
            self._detail_url(sr.pk),
            {'status': 'completed'},
            format='json',
        )
        assert resp.status_code == 200
        sr.refresh_from_db()
        assert sr.status == 'completed'

    def test_list_requires_auth(self, api_client):
        resp = api_client.get(self.URL_LIST)
        assert resp.status_code == 401


# ===================================================================
# BitrixIntegrationViewSet
# ===================================================================

@pytest.mark.django_db
class TestBitrixIntegrationViewSet:
    """CRUD /api/v1/bitrix-integrations/"""

    URL_LIST = reverse('bitrix-integration-list')

    def _detail_url(self, pk):
        return reverse('bitrix-integration-detail', args=[pk])

    def test_list(self, authenticated_client):
        _make_integration(name='A', outgoing_webhook_token='tok-a')
        _make_integration(name='B', outgoing_webhook_token='tok-b')
        resp = authenticated_client.get(self.URL_LIST)
        assert resp.status_code == 200
        assert resp.data['count'] == 2
        assert len(resp.data['results']) == 2
        # list serializer hides token
        assert 'outgoing_webhook_token' not in resp.data['results'][0]

    def test_create(self, authenticated_client):
        payload = {
            'name': 'New Integration',
            'portal_url': 'https://new.bitrix24.ru',
            'webhook_url': 'https://new.bitrix24.ru/rest/1/xyz/',
            'outgoing_webhook_token': 'secret-tok',
            'target_stage_id': 'C1:WON',
        }
        resp = authenticated_client.post(self.URL_LIST, payload, format='json')
        assert resp.status_code == 201
        assert BitrixIntegration.objects.filter(name='New Integration').exists()

    def test_update(self, authenticated_client):
        obj = _make_integration()
        resp = authenticated_client.patch(
            self._detail_url(obj.pk),
            {'name': 'Updated Name'},
            format='json',
        )
        assert resp.status_code == 200
        obj.refresh_from_db()
        assert obj.name == 'Updated Name'

    def test_delete(self, authenticated_client):
        obj = _make_integration()
        resp = authenticated_client.delete(self._detail_url(obj.pk))
        assert resp.status_code == 204
        assert not BitrixIntegration.objects.filter(pk=obj.pk).exists()

    def test_list_requires_auth(self, api_client):
        resp = api_client.get(self.URL_LIST)
        assert resp.status_code == 401
