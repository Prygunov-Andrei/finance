import pytest
from django.urls import reverse

from marketing.models import (
    AvitoConfig,
    AvitoListing,
    AvitoSearchKeyword,
    Campaign,
    ContactHistory,
    ExecutorProfile,
    MarketingSyncLog,
    UnisenderConfig,
)


# ---------------------------------------------------------------------------
# ExecutorProfile API
# ---------------------------------------------------------------------------

class TestExecutorProfileAPI:
    @staticmethod
    def _results(resp):
        """Извлечь results из пагинированного или плоского ответа."""
        if isinstance(resp.data, dict) and 'results' in resp.data:
            return resp.data['results']
        return resp.data

    def test_list(self, marketing_client, executor_profile, executor_profile_2):
        resp = marketing_client.get('/api/v1/marketing/executor-profiles/')
        assert resp.status_code == 200
        assert len(self._results(resp)) == 2

    def test_list_filter_city(self, marketing_client, executor_profile, executor_profile_2):
        resp = marketing_client.get('/api/v1/marketing/executor-profiles/', {'city': 'Москва'})
        assert resp.status_code == 200
        results = self._results(resp)
        assert len(results) == 1
        assert results[0]['city'] == 'Москва'

    def test_list_filter_specializations(self, marketing_client, executor_profile, executor_profile_2):
        resp = marketing_client.get(
            '/api/v1/marketing/executor-profiles/',
            {'specializations': 'ventilation'},
        )
        assert resp.status_code == 200
        assert len(self._results(resp)) == 1

    def test_list_filter_is_potential(self, marketing_client, executor_profile, executor_profile_2):
        resp = marketing_client.get(
            '/api/v1/marketing/executor-profiles/',
            {'is_potential': 'true'},
        )
        assert resp.status_code == 200
        assert all(item['is_potential'] for item in self._results(resp))

    def test_retrieve(self, marketing_client, executor_profile):
        resp = marketing_client.get(f'/api/v1/marketing/executor-profiles/{executor_profile.pk}/')
        assert resp.status_code == 200
        assert resp.data['phone'] == '+79001234567'
        assert resp.data['counterparty']['name'] == 'ИП Тестовый Монтажник'

    def test_create(self, marketing_client):
        data = {
            'name': 'ИП Новый Монтажник',
            'inn': '111222333444',
            'legal_form': 'ip',
            'phone': '+79001111111',
            'email': 'new@test.com',
            'city': 'Казань',
            'specializations': ['ventilation', 'heating'],
        }
        resp = marketing_client.post('/api/v1/marketing/executor-profiles/', data, format='json')
        assert resp.status_code == 201
        assert ExecutorProfile.objects.filter(city='Казань').exists()

    def test_update(self, marketing_client, executor_profile):
        resp = marketing_client.patch(
            f'/api/v1/marketing/executor-profiles/{executor_profile.pk}/',
            {'city': 'Новосибирск', 'is_potential': False},
            format='json',
        )
        assert resp.status_code == 200
        executor_profile.refresh_from_db()
        assert executor_profile.city == 'Новосибирск'
        assert executor_profile.is_potential is False

    def test_delete(self, marketing_client, executor_profile):
        resp = marketing_client.delete(f'/api/v1/marketing/executor-profiles/{executor_profile.pk}/')
        assert resp.status_code == 204
        assert not ExecutorProfile.objects.filter(pk=executor_profile.pk).exists()

    def test_contact_history_action(self, marketing_client, executor_profile, marketing_user):
        ContactHistory.objects.create(
            executor_profile=executor_profile,
            channel=ContactHistory.Channel.PHONE,
            direction=ContactHistory.Direction.OUT,
            subject='Звонок',
            created_by=marketing_user,
        )
        resp = marketing_client.get(
            f'/api/v1/marketing/executor-profiles/{executor_profile.pk}/contact-history/',
        )
        assert resp.status_code == 200
        assert len(resp.data) == 1

    def test_add_contact_action(self, marketing_client, executor_profile):
        resp = marketing_client.post(
            f'/api/v1/marketing/executor-profiles/{executor_profile.pk}/add-contact/',
            {
                'channel': 'phone',
                'direction': 'out',
                'subject': 'Звонок по вакансии',
                'body': 'Обсудили условия',
            },
            format='json',
        )
        assert resp.status_code == 201
        assert ContactHistory.objects.filter(executor_profile=executor_profile).count() == 1

    def test_unauthenticated(self):
        from rest_framework.test import APIClient
        client = APIClient()
        resp = client.get('/api/v1/marketing/executor-profiles/')
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# AvitoConfig API
# ---------------------------------------------------------------------------

class TestAvitoConfigAPI:
    def test_get(self, marketing_client, avito_config):
        resp = marketing_client.get('/api/v1/marketing/avito/config/')
        assert resp.status_code == 200
        assert 'is_active' in resp.data
        assert 'access_token' not in resp.data  # секрет скрыт

    def test_patch(self, marketing_client, avito_config):
        resp = marketing_client.patch(
            '/api/v1/marketing/avito/config/',
            {'client_id': 'new_id', 'auto_publish_mp': True},
            format='json',
        )
        assert resp.status_code == 200
        avito_config.refresh_from_db()
        assert avito_config.client_id == 'new_id'
        assert avito_config.auto_publish_mp is True


# ---------------------------------------------------------------------------
# AvitoSearchKeyword API
# ---------------------------------------------------------------------------

class TestAvitoSearchKeywordAPI:
    def test_list(self, marketing_client, search_keyword):
        resp = marketing_client.get('/api/v1/marketing/avito/keywords/')
        assert resp.status_code == 200
        # Может содержать seed-ключевые слова + тестовое
        assert len(resp.data) >= 1

    def test_create(self, marketing_client):
        resp = marketing_client.post(
            '/api/v1/marketing/avito/keywords/',
            {'keyword': 'новое ключевое слово'},
            format='json',
        )
        assert resp.status_code == 201

    def test_delete(self, marketing_client, search_keyword):
        resp = marketing_client.delete(f'/api/v1/marketing/avito/keywords/{search_keyword.pk}/')
        assert resp.status_code == 204


# ---------------------------------------------------------------------------
# AvitoListing API
# ---------------------------------------------------------------------------

class TestAvitoListingAPI:
    def test_list(self, marketing_client, avito_listing):
        resp = marketing_client.get('/api/v1/marketing/avito/listings/')
        assert resp.status_code == 200
        assert len(resp.data) >= 1

    def test_list_filter_status(self, marketing_client, avito_listing):
        resp = marketing_client.get('/api/v1/marketing/avito/listings/', {'status': 'new'})
        assert resp.status_code == 200
        results = resp.data['results'] if isinstance(resp.data, dict) and 'results' in resp.data else resp.data
        assert all(item['status'] == 'new' for item in results)

    def test_create_manually(self, marketing_client):
        resp = marketing_client.post(
            '/api/v1/marketing/avito/listings/',
            {
                'avito_item_id': 'manual_001',
                'url': 'https://www.avito.ru/manual/001',
                'title': 'Ручное объявление',
                'city': 'Москва',
            },
            format='json',
        )
        assert resp.status_code == 201

    def test_update_status(self, marketing_client, avito_listing):
        resp = marketing_client.patch(
            f'/api/v1/marketing/avito/listings/{avito_listing.pk}/update-status/',
            {'status': 'reviewed'},
            format='json',
        )
        assert resp.status_code == 200
        avito_listing.refresh_from_db()
        assert avito_listing.status == 'reviewed'

    def test_update_status_invalid(self, marketing_client, avito_listing):
        resp = marketing_client.patch(
            f'/api/v1/marketing/avito/listings/{avito_listing.pk}/update-status/',
            {'status': 'invalid_status'},
            format='json',
        )
        assert resp.status_code == 400

    def test_convert_to_executor(self, marketing_client, avito_listing):
        resp = marketing_client.post(
            f'/api/v1/marketing/avito/listings/{avito_listing.pk}/convert/',
        )
        assert resp.status_code == 201
        avito_listing.refresh_from_db()
        assert avito_listing.status == 'converted'
        assert avito_listing.executor_profile is not None


# ---------------------------------------------------------------------------
# Campaign API
# ---------------------------------------------------------------------------

class TestCampaignAPI:
    def test_list(self, marketing_client, campaign):
        resp = marketing_client.get('/api/v1/marketing/campaigns/')
        assert resp.status_code == 200
        assert len(resp.data) >= 1

    def test_create(self, marketing_client):
        resp = marketing_client.post(
            '/api/v1/marketing/campaigns/',
            {
                'name': 'Новая рассылка',
                'campaign_type': 'sms',
                'body': 'Текст SMS',
            },
            format='json',
        )
        assert resp.status_code == 201
        assert Campaign.objects.filter(name='Новая рассылка').exists()

    def test_preview(self, marketing_client, campaign, executor_profile, executor_profile_2):
        resp = marketing_client.get(f'/api/v1/marketing/campaigns/{campaign.pk}/preview/')
        assert resp.status_code == 200
        assert 'total_recipients' in resp.data
        assert resp.data['total_recipients'] >= 1

    def test_send(self, marketing_client, campaign, executor_profile, executor_profile_2):
        resp = marketing_client.post(f'/api/v1/marketing/campaigns/{campaign.pk}/send/')
        assert resp.status_code == 200
        campaign.refresh_from_db()
        assert campaign.status == Campaign.Status.SENDING


# ---------------------------------------------------------------------------
# UnisenderConfig API
# ---------------------------------------------------------------------------

class TestUnisenderConfigAPI:
    def test_get(self, marketing_client, unisender_config):
        resp = marketing_client.get('/api/v1/marketing/unisender/config/')
        assert resp.status_code == 200
        assert 'is_active' in resp.data

    def test_patch(self, marketing_client, unisender_config):
        resp = marketing_client.patch(
            '/api/v1/marketing/unisender/config/',
            {'api_key': 'test_key', 'is_active': True},
            format='json',
        )
        assert resp.status_code == 200
        unisender_config.refresh_from_db()
        assert unisender_config.api_key == 'test_key'


# ---------------------------------------------------------------------------
# MarketingSyncLog API
# ---------------------------------------------------------------------------

class TestMarketingSyncLogAPI:
    def test_list(self, marketing_client, db):
        MarketingSyncLog.objects.create(
            sync_type=MarketingSyncLog.SyncType.AVITO_SCAN,
            status=MarketingSyncLog.Status.SUCCESS,
        )
        resp = marketing_client.get('/api/v1/marketing/sync-logs/')
        assert resp.status_code == 200
        assert len(resp.data) >= 1

    def test_list_filter_sync_type(self, marketing_client, db):
        MarketingSyncLog.objects.create(
            sync_type=MarketingSyncLog.SyncType.AVITO_SCAN,
            status=MarketingSyncLog.Status.SUCCESS,
        )
        MarketingSyncLog.objects.create(
            sync_type=MarketingSyncLog.SyncType.EMAIL_CAMPAIGN,
            status=MarketingSyncLog.Status.SUCCESS,
        )
        resp = marketing_client.get('/api/v1/marketing/sync-logs/', {'sync_type': 'avito_scan'})
        assert resp.status_code == 200
        results = resp.data['results'] if isinstance(resp.data, dict) and 'results' in resp.data else resp.data
        assert all(item['sync_type'] == 'avito_scan' for item in results)


# ---------------------------------------------------------------------------
# Dashboard API
# ---------------------------------------------------------------------------

class TestDashboardAPI:
    def test_dashboard(self, marketing_client, executor_profile):
        resp = marketing_client.get('/api/v1/marketing/dashboard/')
        assert resp.status_code == 200
        assert 'executors' in resp.data
        assert 'avito' in resp.data
        assert 'campaigns' in resp.data
        assert resp.data['executors']['total'] >= 1

    def test_dashboard_empty(self, marketing_client, db):
        resp = marketing_client.get('/api/v1/marketing/dashboard/')
        assert resp.status_code == 200
        assert resp.data['executors']['total'] == 0


# ---------------------------------------------------------------------------
# Standalone views
# ---------------------------------------------------------------------------

class TestStandaloneViews:
    def test_trigger_scan(self, marketing_client):
        resp = marketing_client.post('/api/v1/marketing/avito/scan/')
        assert resp.status_code == 200
        assert resp.data['status'] == 'stub'
