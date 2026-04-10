"""Интеграционные тесты: полные workflow от начала до конца."""

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounting.models import Counterparty
from marketing.models import (
    AvitoConfig, AvitoListing, AvitoSearchKeyword,
    Campaign, CampaignRecipient, ContactHistory, ExecutorProfile,
)
from marketing.services.campaign_service import CampaignService
from marketing.services.executor_service import ExecutorService


@pytest.fixture
def user(db):
    return User.objects.create_user(username='integ_test', password='test123', email='i@t.com')


@pytest.fixture
def client(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    return c


@pytest.mark.integration
class TestListingToExecutorToCampaign:
    """Полный flow: объявление → исполнитель → рассылка → контакт."""

    def test_full_flow(self, client, user):
        # 1. Создать объявление через API
        resp = client.post('/api/v1/marketing/avito/listings/', {
            'avito_item_id': 'flow_001',
            'url': 'https://avito.ru/flow/001',
            'title': 'Монтажник ищет работу',
            'city': 'Москва',
            'seller_name': 'Петров Пётр',
            'seller_avito_id': 'flow_seller_001',
        }, format='json')
        assert resp.status_code == 201
        listing_id = resp.data['id']

        # 2. Конвертировать в исполнителя
        resp = client.post(f'/api/v1/marketing/avito/listings/{listing_id}/convert/')
        assert resp.status_code == 201
        profile_id = resp.data['id']

        # Проверить что профиль создан
        profile = ExecutorProfile.objects.get(pk=profile_id)
        assert profile.city == 'Москва'
        assert profile.source == 'avito'

        # 3. Обновить профиль — добавить email
        resp = client.patch(f'/api/v1/marketing/executor-profiles/{profile_id}/', {
            'email': 'petrov@test.com',
            'specializations': ['ventilation'],
        }, format='json')
        assert resp.status_code == 200

        # 4. Создать рассылку
        resp = client.post('/api/v1/marketing/campaigns/', {
            'name': 'Тест Flow',
            'campaign_type': 'email',
            'subject': 'Работа для вас',
            'body': 'Предложение работы на объекте.',
            'filter_specializations': ['ventilation'],
        }, format='json')
        assert resp.status_code == 201
        campaign_id = resp.data['id']

        # 5. Preview
        resp = client.get(f'/api/v1/marketing/campaigns/{campaign_id}/preview/')
        assert resp.status_code == 200
        assert resp.data['total_recipients'] >= 1

        # 6. Отправить рассылку
        resp = client.post(f'/api/v1/marketing/campaigns/{campaign_id}/send/')
        assert resp.status_code == 200

        # 7. Выполнить задачу рассылки (синхронно)
        CampaignService().execute_campaign(campaign_id)

        campaign = Campaign.objects.get(pk=campaign_id)
        assert campaign.status == Campaign.Status.COMPLETED
        assert campaign.sent_count >= 1

        # 8. Проверить ContactHistory
        contacts = ContactHistory.objects.filter(
            executor_profile_id=profile_id, campaign_id=campaign_id,
        )
        assert contacts.count() == 1
        assert contacts.first().channel == 'email'


@pytest.mark.integration
class TestSingletonConcurrency:
    def test_avito_config_no_duplicates(self, db):
        """Параллельный AvitoConfig.get() не создаёт дубли."""
        config1 = AvitoConfig.get()
        config2 = AvitoConfig.get()
        assert config1.pk == config2.pk == 1
        assert AvitoConfig.objects.count() == 1


@pytest.mark.integration
class TestCounterpartyCascade:
    def test_deleting_counterparty_deletes_profile(self, db):
        cp = Counterparty.objects.create(
            name='Каскадный Тест', type='vendor', vendor_subtype='executor',
            legal_form='fiz', inn='CASCADE12345',
        )
        profile = ExecutorProfile.objects.create(counterparty=cp, city='Тест')
        profile_id = profile.pk

        cp.delete()
        assert not ExecutorProfile.objects.filter(pk=profile_id).exists()


@pytest.mark.integration
class TestDashboardWithData:
    def test_dashboard_counts(self, client, user):
        # Создать данные
        cp = Counterparty.objects.create(
            name='Дашборд Тест', type='vendor', vendor_subtype='executor',
            legal_form='fiz', inn='DASHBOARD1234',
        )
        ExecutorProfile.objects.create(
            counterparty=cp, city='Москва', is_potential=True, is_available=True,
        )

        resp = client.get('/api/v1/marketing/dashboard/')
        assert resp.status_code == 200
        assert resp.data['executors']['total'] >= 1
        assert resp.data['executors']['potential'] >= 1
