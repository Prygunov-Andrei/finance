import pytest

from api_public.tests.factories import (
    EstimateRequestFactory,
    EstimateRequestFileFactory,
    PublicPortalConfigFactory,
    PublicPricingConfigFactory,
    CallbackRequestFactory,
)


@pytest.fixture
def estimate_request(db):
    return EstimateRequestFactory()


@pytest.fixture
def estimate_request_with_files(db):
    request = EstimateRequestFactory(total_files=3)
    for i in range(3):
        EstimateRequestFileFactory(request=request, original_filename=f'spec_{i}.pdf')
    return request


@pytest.fixture
def portal_config(db):
    return PublicPortalConfigFactory(
        operator_emails='op1@company.ru, op2@company.ru',
    )


@pytest.fixture
def default_pricing(db):
    return PublicPricingConfigFactory(is_default=True, markup_percent='25.00')
