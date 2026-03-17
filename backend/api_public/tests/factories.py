import factory
from decimal import Decimal

from api_public.models import (
    EstimateRequest, EstimateRequestFile, EstimateRequestVersion,
    PublicPortalConfig, PublicPricingConfig, CallbackRequest,
)


class EstimateRequestFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = EstimateRequest

    email = factory.Sequence(lambda n: f'client{n}@example.com')
    contact_name = factory.Faker('name', locale='ru_RU')
    company_name = factory.Sequence(lambda n: f'ООО Стройка-{n}')
    project_name = factory.Sequence(lambda n: f'Проект {n}')
    status = EstimateRequest.Status.UPLOADED


class EstimateRequestFileFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = EstimateRequestFile

    request = factory.SubFactory(EstimateRequestFactory)
    original_filename = factory.Sequence(lambda n: f'spec_{n}.pdf')
    file_type = EstimateRequestFile.FileType.SPECIFICATION
    file_size = 1024 * 100  # 100 KB


class EstimateRequestVersionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = EstimateRequestVersion

    request = factory.SubFactory(EstimateRequestFactory)
    version_number = factory.Sequence(lambda n: n + 1)
    generated_by = 'auto'


class PublicPortalConfigFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = PublicPortalConfig
        django_get_or_create = ('pk',)

    pk = 1
    auto_approve = False
    operator_emails = 'operator@company.ru'
    max_pages_per_request = 100
    max_files_per_request = 20
    link_expiry_days = 30


class PublicPricingConfigFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = PublicPricingConfig

    markup_percent = Decimal('30.00')
    is_default = False


class CallbackRequestFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = CallbackRequest

    request = factory.SubFactory(EstimateRequestFactory)
    phone = factory.Sequence(lambda n: f'+7900000{n:04d}')
    status = CallbackRequest.Status.NEW
