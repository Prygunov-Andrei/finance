import pytest
from django.contrib.auth.models import User

from marketing.models import (
    Campaign, CampaignRecipient, ContactHistory, ExecutorProfile, MarketingSyncLog,
)
from marketing.services.campaign_service import CampaignService
from accounting.models import Counterparty


@pytest.fixture
def service():
    return CampaignService()


@pytest.fixture
def camp_user(db):
    return User.objects.create_user(username='camp_test', password='test123')


def _make_executor(db, name, city, specs, phone='', email='', is_potential=True, is_available=True):
    cp = Counterparty.objects.create(
        name=name, type='vendor', vendor_subtype='executor',
        legal_form='fiz', inn=f'C{abs(hash(name)) % 10**11}',
    )
    return ExecutorProfile.objects.create(
        counterparty=cp, city=city, specializations=specs,
        phone=phone, email=email, is_potential=is_potential, is_available=is_available,
    )


@pytest.fixture
def executors(db):
    return [
        _make_executor(db, 'Монтажник А', 'Москва', ['ventilation'], phone='+79001111111', email='a@test.com'),
        _make_executor(db, 'Монтажник Б', 'Москва', ['electrical'], phone='+79002222222', email='b@test.com'),
        _make_executor(db, 'Монтажник В', 'СПб', ['ventilation', 'conditioning'], phone='', email='c@test.com'),
        _make_executor(db, 'Монтажник Г', 'Казань', ['heating'], phone='+79004444444', email='', is_available=False),
    ]


class TestResolveRecipients:
    def test_all_recipients(self, service, executors, camp_user):
        campaign = Campaign.objects.create(
            name='Все', campaign_type='email', body='Текст', created_by=camp_user,
        )
        qs = service.resolve_recipients(campaign)
        # Все 4 имеют email, но Г недоступен — не фильтруется без filter_is_available
        assert qs.count() == 4

    def test_filter_by_specializations(self, service, executors, camp_user):
        campaign = Campaign.objects.create(
            name='Вент', campaign_type='email', body='Текст', created_by=camp_user,
            filter_specializations=['ventilation'],
        )
        qs = service.resolve_recipients(campaign)
        names = list(qs.values_list('counterparty__name', flat=True))
        assert 'Монтажник А' in names
        assert 'Монтажник В' in names
        assert 'Монтажник Б' not in names

    def test_filter_by_city(self, service, executors, camp_user):
        campaign = Campaign.objects.create(
            name='Москва', campaign_type='email', body='Текст', created_by=camp_user,
            filter_cities=['Москва'],
        )
        qs = service.resolve_recipients(campaign)
        assert qs.count() == 2

    def test_filter_available(self, service, executors, camp_user):
        campaign = Campaign.objects.create(
            name='Доступные', campaign_type='email', body='Текст', created_by=camp_user,
            filter_is_available=True,
        )
        qs = service.resolve_recipients(campaign)
        assert all(p.is_available for p in qs)
        assert qs.count() == 3

    def test_sms_excludes_without_phone(self, service, executors, camp_user):
        campaign = Campaign.objects.create(
            name='SMS', campaign_type='sms', body='Текст', created_by=camp_user,
        )
        qs = service.resolve_recipients(campaign)
        assert all(p.phone for p in qs)
        # Монтажник В не имеет телефона
        assert qs.count() == 3

    def test_email_excludes_without_email(self, service, executors, camp_user):
        campaign = Campaign.objects.create(
            name='Email', campaign_type='email', body='Текст', created_by=camp_user,
        )
        qs = service.resolve_recipients(campaign)
        assert all(p.email for p in qs)
        # Монтажник Г не имеет email
        assert qs.count() == 3


class TestPreviewCampaign:
    def test_returns_count(self, service, executors, camp_user):
        campaign = Campaign.objects.create(
            name='Preview', campaign_type='email', body='Текст', created_by=camp_user,
        )
        result = service.preview_campaign(campaign.pk)
        assert result['total_recipients'] >= 1
        assert 'recipients_preview' in result

    def test_sms_cost(self, service, executors, camp_user):
        campaign = Campaign.objects.create(
            name='SMS cost', campaign_type='sms', body='Текст', created_by=camp_user,
        )
        result = service.preview_campaign(campaign.pk)
        assert result['estimated_sms_cost'] is not None


class TestExecuteCampaign:
    def test_creates_recipients_and_contacts(self, service, executors, camp_user):
        campaign = Campaign.objects.create(
            name='Execute', campaign_type='email', subject='Тема', body='Текст', created_by=camp_user,
        )
        service.execute_campaign(campaign.pk)

        campaign.refresh_from_db()
        assert campaign.status == Campaign.Status.COMPLETED
        assert campaign.sent_count >= 1
        assert campaign.total_recipients >= 1
        assert campaign.sent_at is not None

        # ContactHistory created
        assert ContactHistory.objects.filter(campaign=campaign).count() == campaign.sent_count

        # SyncLog created
        assert MarketingSyncLog.objects.filter(sync_type='email_campaign').exists()

    def test_cannot_execute_completed_campaign(self, service, executors, camp_user):
        campaign = Campaign.objects.create(
            name='Done', campaign_type='email', body='Текст', created_by=camp_user,
            status=Campaign.Status.COMPLETED,
        )
        with pytest.raises(ValueError):
            service.execute_campaign(campaign.pk)

    def test_recipients_have_status_sent(self, service, executors, camp_user):
        campaign = Campaign.objects.create(
            name='Check statuses', campaign_type='email', body='Текст', created_by=camp_user,
        )
        service.execute_campaign(campaign.pk)

        recipients = CampaignRecipient.objects.filter(campaign=campaign)
        assert recipients.count() >= 1
        assert all(r.status == CampaignRecipient.Status.SENT for r in recipients)
