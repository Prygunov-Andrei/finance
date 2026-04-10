from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from marketing.models import AvitoListing, AvitoSearchKeyword, MarketingSyncLog
from marketing.tasks import (
    cleanup_old_listings,
    execute_campaign_task,
    publish_mp_to_avito,
    refresh_avito_token,
    sync_avito_stats,
)


class TestCleanupOldListings:
    def test_deletes_old_rejected(self, db):
        kw = AvitoSearchKeyword.objects.create(keyword='cleanup-test')
        old = AvitoListing.objects.create(
            avito_item_id='old_rejected',
            url='https://avito.ru/old',
            title='Старое отклонённое',
            status=AvitoListing.Status.REJECTED,
            keyword=kw,
        )
        # Подделать дату
        AvitoListing.objects.filter(pk=old.pk).update(
            discovered_at=timezone.now() - timedelta(days=100),
        )

        result = cleanup_old_listings()
        assert result['deleted'] == 1
        assert not AvitoListing.objects.filter(pk=old.pk).exists()

    def test_keeps_recent_rejected(self, db):
        AvitoListing.objects.create(
            avito_item_id='recent_rejected',
            url='https://avito.ru/recent',
            title='Свежее отклонённое',
            status=AvitoListing.Status.REJECTED,
        )
        result = cleanup_old_listings()
        assert result['deleted'] == 0

    def test_keeps_old_non_rejected(self, db):
        old_new = AvitoListing.objects.create(
            avito_item_id='old_new',
            url='https://avito.ru/old_new',
            title='Старое новое',
            status=AvitoListing.Status.NEW,
        )
        AvitoListing.objects.filter(pk=old_new.pk).update(
            discovered_at=timezone.now() - timedelta(days=100),
        )
        result = cleanup_old_listings()
        assert result['deleted'] == 0


class TestPublishMpTask:
    @patch('marketing.services.avito_publisher.AvitoPublisherService.publish_mounting_proposal')
    def test_delegates_to_service(self, mock_publish):
        mock_publish.return_value = {'status': 'stub'}
        result = publish_mp_to_avito(42)
        mock_publish.assert_called_once_with(42)
        assert result['status'] == 'stub'


class TestSyncAvitoStats:
    def test_runs_without_error(self, db):
        result = sync_avito_stats()
        assert result['status'] == 'stub'


class TestRefreshAvitoToken:
    def test_runs_without_error(self, db):
        result = refresh_avito_token()
        assert result['status'] == 'skipped'


class TestExecuteCampaignTask:
    @patch('marketing.services.campaign_service.CampaignService.execute_campaign')
    def test_delegates_to_service(self, mock_execute):
        execute_campaign_task(99)
        mock_execute.assert_called_once_with(99)


class TestBeatSchedule:
    def test_marketing_tasks_in_schedule(self):
        from finans_assistant.celery import app
        schedule = app.conf.beat_schedule
        assert 'marketing-sync-avito-stats' in schedule
        assert 'marketing-refresh-avito-token' in schedule
        assert 'marketing-cleanup-old-listings' in schedule
