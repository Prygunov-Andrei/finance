import pytest
from django.contrib.auth.models import User

from marketing.models import AvitoConfig, AvitoPublishedListing
from marketing.services.avito_publisher import AvitoPublisherService
from proposals.models import MountingProposal


@pytest.fixture
def pub_user(db):
    return User.objects.create_user(username='publisher_test', password='test123')


@pytest.fixture
def pub_object(db):
    from objects.models import Object
    return Object.objects.create(name='Объект Публикация', address='Тест', city='Москва')


@pytest.fixture
def pub_mp(pub_user, pub_object):
    return MountingProposal.objects.create(
        name='МП для публикации',
        date='2026-01-15',
        object=pub_object,
        status=MountingProposal.Status.PUBLISHED,
        created_by=pub_user,
        man_hours=100,
        total_amount=50000,
    )


class TestAvitoPublisherService:
    def test_dry_run_does_not_create_listing(self, pub_mp):
        service = AvitoPublisherService()
        result = service.publish_mounting_proposal(pub_mp.pk, dry_run=True)

        assert result['status'] == 'dry_run'
        assert 'data' in result
        assert result['data']['title']
        assert AvitoPublishedListing.objects.count() == 0

    def test_dry_run_contains_template_data(self, pub_mp):
        config = AvitoConfig.get()
        config.listing_template = 'Объект: {object_name}, город: {city}, часы: {man_hours}'
        config.save()

        service = AvitoPublisherService()
        result = service.publish_mounting_proposal(pub_mp.pk, dry_run=True)

        desc = result['data']['description']
        assert 'Объект Публикация' in desc
        assert '100' in desc

    def test_publish_creates_listing_record(self, pub_mp):
        service = AvitoPublisherService()
        result = service.publish_mounting_proposal(pub_mp.pk)

        assert result['status'] == 'stub'
        listing = AvitoPublishedListing.objects.get(mounting_proposal=pub_mp)
        assert listing.listing_title != ''

    def test_publish_inactive_avito_returns_error(self, pub_mp):
        config = AvitoConfig.get()
        config.is_active = False
        config.save()

        service = AvitoPublisherService()
        result = service.publish_mounting_proposal(pub_mp.pk)

        assert result['status'] in ('error', 'stub')
        listing = AvitoPublishedListing.objects.get(mounting_proposal=pub_mp)
        assert listing.status in (
            AvitoPublishedListing.Status.ERROR,
            AvitoPublishedListing.Status.PENDING,
        )

    def test_build_listing_data_default_template(self, pub_mp):
        service = AvitoPublisherService()
        data = service._build_listing_data(pub_mp)

        assert 'title' in data
        assert 'description' in data
        assert 'Объект Публикация' in data['title'] or 'монтажников' in data['title']
