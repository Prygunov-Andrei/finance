import pytest

from accounting.models import Counterparty
from marketing.models import AvitoListing, AvitoSearchKeyword, ExecutorProfile
from marketing.services.executor_service import ExecutorService


@pytest.fixture
def keyword(db):
    return AvitoSearchKeyword.objects.create(keyword='тест-конвертация')


@pytest.fixture
def listing(keyword):
    return AvitoListing.objects.create(
        avito_item_id='convert_test_001',
        url='https://www.avito.ru/test/convert/001',
        title='Монтажник ищет работу',
        city='Москва',
        seller_name='Тестов Тест',
        seller_avito_id='seller_conv_001',
        keyword=keyword,
    )


@pytest.fixture
def listing_no_seller(keyword):
    return AvitoListing.objects.create(
        avito_item_id='convert_test_002',
        url='https://www.avito.ru/test/convert/002',
        title='Бригада вентиляционщиков',
        city='СПб',
        seller_name='',
        seller_avito_id='',
        keyword=keyword,
    )


class TestConvertListingToExecutor:
    def test_creates_counterparty_and_profile(self, listing):
        service = ExecutorService()
        profile = service.convert_listing_to_executor(listing.pk)

        assert profile.pk is not None
        assert profile.counterparty.name == 'Тестов Тест'
        assert profile.counterparty.type == Counterparty.Type.VENDOR
        assert profile.counterparty.vendor_subtype == Counterparty.VendorSubtype.EXECUTOR
        assert profile.source == ExecutorProfile.Source.AVITO
        assert profile.avito_user_id == 'seller_conv_001'
        assert profile.city == 'Москва'
        assert profile.is_potential is True

        listing.refresh_from_db()
        assert listing.status == AvitoListing.Status.CONVERTED
        assert listing.executor_profile == profile

    def test_duplicate_converts_to_existing_profile(self, listing):
        service = ExecutorService()
        profile1 = service.convert_listing_to_executor(listing.pk)

        # Новое объявление от того же продавца
        listing2 = AvitoListing.objects.create(
            avito_item_id='convert_test_003',
            url='https://www.avito.ru/test/convert/003',
            title='Ещё одно объявление',
            seller_avito_id='seller_conv_001',
        )

        profile2 = service.convert_listing_to_executor(listing2.pk)

        assert profile2.pk == profile1.pk
        listing2.refresh_from_db()
        assert listing2.status == AvitoListing.Status.CONVERTED

    def test_already_converted_returns_existing(self, listing):
        service = ExecutorService()
        profile1 = service.convert_listing_to_executor(listing.pk)
        profile2 = service.convert_listing_to_executor(listing.pk)
        assert profile2.pk == profile1.pk

    def test_listing_without_seller_id(self, listing_no_seller):
        service = ExecutorService()
        profile = service.convert_listing_to_executor(listing_no_seller.pk)

        assert profile.pk is not None
        assert 'Avito #' in profile.counterparty.name
        assert profile.avito_user_id == ''

    def test_inn_placeholder_generated(self, listing):
        service = ExecutorService()
        profile = service.convert_listing_to_executor(listing.pk)

        assert profile.counterparty.inn.startswith('AV')
        assert len(profile.counterparty.inn) <= 12
