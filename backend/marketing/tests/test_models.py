from decimal import Decimal

import pytest
from django.db import IntegrityError
from django.utils import timezone

from accounting.models import Counterparty
from marketing.models import (
    AvitoConfig,
    AvitoListing,
    AvitoPublishedListing,
    AvitoSearchKeyword,
    Campaign,
    CampaignRecipient,
    ContactHistory,
    ExecutorProfile,
    MarketingSyncLog,
    UnisenderConfig,
)


# ---------------------------------------------------------------------------
# ExecutorProfile
# ---------------------------------------------------------------------------

class TestExecutorProfile:
    def test_create_with_counterparty(self, counterparty_executor):
        profile = ExecutorProfile.objects.create(
            counterparty=counterparty_executor,
            city='Москва',
            specializations=['ventilation'],
        )
        assert profile.pk is not None
        assert profile.counterparty == counterparty_executor
        assert profile.is_potential is True
        assert profile.is_available is True

    def test_str(self, executor_profile):
        assert str(executor_profile) == str(executor_profile.counterparty)

    def test_specializations_overlap_filter(self, executor_profile, executor_profile_2):
        """ArrayField supports __overlap for filtering."""
        qs = ExecutorProfile.objects.filter(specializations__overlap=['ventilation'])
        assert executor_profile in qs
        assert executor_profile_2 not in qs

        qs2 = ExecutorProfile.objects.filter(specializations__overlap=['electrical', 'ventilation'])
        assert executor_profile in qs2
        assert executor_profile_2 in qs2

    def test_one_to_one_uniqueness(self, executor_profile):
        """Cannot create two profiles for the same counterparty."""
        with pytest.raises(IntegrityError):
            ExecutorProfile.objects.create(
                counterparty=executor_profile.counterparty,
                city='Другой',
            )


# ---------------------------------------------------------------------------
# AvitoConfig (singleton)
# ---------------------------------------------------------------------------

class TestAvitoConfig:
    def test_get_creates_singleton(self, db):
        config = AvitoConfig.get()
        assert config.pk == 1
        assert config.is_active is False

    def test_get_returns_same(self, db):
        config1 = AvitoConfig.get()
        config1.client_id = 'test_id'
        config1.save()

        config2 = AvitoConfig.get()
        assert config2.pk == 1
        assert config2.client_id == 'test_id'
        assert AvitoConfig.objects.count() == 1

    def test_save_forces_pk_1(self, db):
        config = AvitoConfig(pk=999, client_id='x')
        config.save()
        assert config.pk == 1
        assert AvitoConfig.objects.count() == 1

    def test_is_token_valid_expired(self, avito_config):
        avito_config.access_token = 'token'
        avito_config.token_expires_at = timezone.now() - timezone.timedelta(hours=1)
        assert avito_config.is_token_valid() is False

    def test_is_token_valid_ok(self, avito_config):
        avito_config.access_token = 'token'
        avito_config.token_expires_at = timezone.now() + timezone.timedelta(hours=1)
        assert avito_config.is_token_valid() is True

    def test_is_token_valid_empty(self, avito_config):
        assert avito_config.is_token_valid() is False


# ---------------------------------------------------------------------------
# UnisenderConfig (singleton)
# ---------------------------------------------------------------------------

class TestUnisenderConfig:
    def test_get_creates_singleton(self, db):
        config = UnisenderConfig.get()
        assert config.pk == 1
        assert config.is_active is False

    def test_save_forces_pk_1(self, db):
        config = UnisenderConfig(pk=42, api_key='key')
        config.save()
        assert config.pk == 1


# ---------------------------------------------------------------------------
# AvitoSearchKeyword
# ---------------------------------------------------------------------------

class TestAvitoSearchKeyword:
    def test_create(self, db):
        kw = AvitoSearchKeyword.objects.create(keyword='тест слово')
        assert kw.is_active is True
        assert kw.results_count == 0

    def test_unique_keyword(self, db):
        AvitoSearchKeyword.objects.create(keyword='уникальное')
        with pytest.raises(IntegrityError):
            AvitoSearchKeyword.objects.create(keyword='уникальное')


# ---------------------------------------------------------------------------
# AvitoListing
# ---------------------------------------------------------------------------

class TestAvitoListing:
    def test_create(self, avito_listing):
        assert avito_listing.status == AvitoListing.Status.NEW
        assert avito_listing.avito_item_id == 'test_item_001'

    def test_unique_avito_item_id(self, avito_listing):
        with pytest.raises(IntegrityError):
            AvitoListing.objects.create(
                avito_item_id='test_item_001',
                url='https://avito.ru/dup',
                title='Дубликат',
            )

    def test_str(self, avito_listing):
        assert 'Москва' in str(avito_listing)


# ---------------------------------------------------------------------------
# Campaign + CampaignRecipient
# ---------------------------------------------------------------------------

class TestCampaign:
    def test_create(self, campaign):
        assert campaign.status == Campaign.Status.DRAFT
        assert campaign.campaign_type == Campaign.CampaignType.EMAIL

    def test_campaign_recipient_unique(self, campaign, executor_profile):
        CampaignRecipient.objects.create(
            campaign=campaign, executor_profile=executor_profile,
        )
        with pytest.raises(IntegrityError):
            CampaignRecipient.objects.create(
                campaign=campaign, executor_profile=executor_profile,
            )


# ---------------------------------------------------------------------------
# ContactHistory
# ---------------------------------------------------------------------------

class TestContactHistory:
    def test_create(self, executor_profile, marketing_user):
        ch = ContactHistory.objects.create(
            executor_profile=executor_profile,
            channel=ContactHistory.Channel.PHONE,
            direction=ContactHistory.Direction.OUT,
            subject='Звонок',
            body='Обсудили условия',
            created_by=marketing_user,
        )
        assert ch.pk is not None


# ---------------------------------------------------------------------------
# MarketingSyncLog
# ---------------------------------------------------------------------------

class TestMarketingSyncLog:
    def test_create(self, db):
        log = MarketingSyncLog.objects.create(
            sync_type=MarketingSyncLog.SyncType.AVITO_SCAN,
            status=MarketingSyncLog.Status.SUCCESS,
            items_processed=10,
            items_created=5,
        )
        assert log.pk is not None
        assert 'Сканирование Avito' in str(log)
