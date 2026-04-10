import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounting.models import Counterparty
from marketing.models import (
    AvitoConfig,
    AvitoListing,
    AvitoPublishedListing,
    AvitoSearchKeyword,
    Campaign,
    ContactHistory,
    ExecutorProfile,
    UnisenderConfig,
)


@pytest.fixture
def marketing_user(db):
    return User.objects.create_user(
        username='marketing_test',
        password='testpass123',
        email='marketing@test.com',
        first_name='Тест',
        last_name='Маркетолог',
    )


@pytest.fixture
def marketing_client(marketing_user):
    client = APIClient()
    refresh = RefreshToken.for_user(marketing_user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


@pytest.fixture
def counterparty_executor(db):
    return Counterparty.objects.create(
        name='ИП Тестовый Монтажник',
        short_name='ТестМонтажник',
        type=Counterparty.Type.VENDOR,
        vendor_subtype=Counterparty.VendorSubtype.EXECUTOR,
        legal_form=Counterparty.LegalForm.IP,
        inn='123456789012',
    )


@pytest.fixture
def counterparty_executor_2(db):
    return Counterparty.objects.create(
        name='ООО Монтажстрой',
        short_name='Монтажстрой',
        type=Counterparty.Type.VENDOR,
        vendor_subtype=Counterparty.VendorSubtype.EXECUTOR,
        legal_form=Counterparty.LegalForm.OOO,
        inn='987654321098',
    )


@pytest.fixture
def executor_profile(counterparty_executor):
    return ExecutorProfile.objects.create(
        counterparty=counterparty_executor,
        phone='+79001234567',
        email='montazhnik@test.com',
        city='Москва',
        specializations=['ventilation', 'conditioning'],
        is_potential=True,
        is_available=True,
    )


@pytest.fixture
def executor_profile_2(counterparty_executor_2):
    return ExecutorProfile.objects.create(
        counterparty=counterparty_executor_2,
        phone='+79009876543',
        email='montazhstroy@test.com',
        city='Санкт-Петербург',
        specializations=['electrical', 'low_voltage'],
        is_potential=False,
        is_available=True,
        team_size=5,
    )


@pytest.fixture
def avito_config(db):
    return AvitoConfig.get()


@pytest.fixture
def unisender_config(db):
    return UnisenderConfig.get()


@pytest.fixture
def search_keyword(db):
    kw, _ = AvitoSearchKeyword.objects.get_or_create(keyword='вентиляция тест')
    return kw


@pytest.fixture
def avito_listing(search_keyword):
    return AvitoListing.objects.create(
        avito_item_id='test_item_001',
        url='https://www.avito.ru/test/item/001',
        title='Монтаж вентиляции — ищу работу',
        description='Опытная бригада, стаж 10 лет',
        city='Москва',
        seller_name='Иванов Иван',
        seller_avito_id='seller_001',
        keyword=search_keyword,
        status=AvitoListing.Status.NEW,
    )


@pytest.fixture
def campaign(marketing_user, executor_profile, executor_profile_2):
    return Campaign.objects.create(
        name='Тестовая рассылка',
        campaign_type=Campaign.CampaignType.EMAIL,
        subject='Предложение работы',
        body='Здравствуйте! Ищем монтажников для объекта.',
        created_by=marketing_user,
    )
