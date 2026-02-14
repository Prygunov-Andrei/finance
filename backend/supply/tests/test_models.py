"""Tests for supply.models — BitrixIntegration & SupplyRequest."""

from decimal import Decimal

import pytest
from django.db import IntegrityError

from supply.models import BitrixIntegration, SupplyRequest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_integration(**overrides):
    defaults = {
        'name': 'Test Integration',
        'portal_url': 'https://test.bitrix24.ru',
        'webhook_url': 'https://test.bitrix24.ru/rest/1/abc/',
        'outgoing_webhook_token': 'test-token-123',
        'target_stage_id': 'C1:NEW',
    }
    defaults.update(overrides)
    return BitrixIntegration.objects.create(**defaults)


def _make_supply_request(integration, **overrides):
    defaults = {
        'bitrix_integration': integration,
        'bitrix_deal_id': 1001,
        'bitrix_deal_title': 'Закупка материалов',
    }
    defaults.update(overrides)
    return SupplyRequest.objects.create(**defaults)


# ===================================================================
# BitrixIntegration
# ===================================================================

@pytest.mark.django_db
class TestBitrixIntegrationModel:
    """BitrixIntegration creation, defaults, and __str__."""

    def test_create_with_defaults(self):
        obj = _make_integration()
        assert obj.pk is not None
        assert obj.is_active is True
        assert obj.target_category_id == 0
        assert obj.contract_field_mapping == ''
        assert obj.object_field_mapping == ''

    def test_str(self):
        obj = _make_integration(name='SRM', portal_url='https://srm.bitrix24.ru')
        assert str(obj) == 'SRM (https://srm.bitrix24.ru)'

    def test_ordering(self):
        _make_integration(name='Beta', outgoing_webhook_token='tok-b')
        _make_integration(name='Alpha', outgoing_webhook_token='tok-a')
        names = list(
            BitrixIntegration.objects.values_list('name', flat=True)
        )
        assert names == ['Alpha', 'Beta']


# ===================================================================
# SupplyRequest
# ===================================================================

@pytest.mark.django_db
class TestSupplyRequestModel:
    """SupplyRequest creation, defaults, statuses, constraints, FKs."""

    # --- Creation & defaults ---

    def test_create_with_defaults(self):
        integration = _make_integration()
        sr = _make_supply_request(integration)
        assert sr.pk is not None
        assert sr.status == SupplyRequest.Status.RECEIVED
        assert sr.mapping_errors == {}
        assert sr.raw_deal_data == {}
        assert sr.raw_comments_data == []
        assert sr.amount is None
        assert sr.synced_at is None

    def test_str(self):
        integration = _make_integration()
        sr = _make_supply_request(
            integration,
            bitrix_deal_id=42,
            bitrix_deal_title='Кабель КГ 3x2.5',
        )
        assert str(sr) == 'Запрос #42 — Кабель КГ 3x2.5'

    def test_str_long_title_truncated(self):
        integration = _make_integration()
        long_title = 'A' * 100
        sr = _make_supply_request(
            integration,
            bitrix_deal_id=99,
            bitrix_deal_title=long_title,
        )
        # __str__ truncates to 60 chars
        assert str(sr) == f'Запрос #99 — {"A" * 60}'

    # --- Status choices ---

    def test_status_choices(self):
        values = {c[0] for c in SupplyRequest.Status.choices}
        assert values == {'received', 'processing', 'completed', 'error'}

    def test_set_status(self):
        integration = _make_integration()
        sr = _make_supply_request(integration)
        sr.status = SupplyRequest.Status.COMPLETED
        sr.save()
        sr.refresh_from_db()
        assert sr.status == 'completed'

    # --- Unique constraint on bitrix_deal_id ---

    def test_unique_bitrix_deal_id(self):
        integration = _make_integration()
        _make_supply_request(integration, bitrix_deal_id=500)
        with pytest.raises(IntegrityError):
            _make_supply_request(integration, bitrix_deal_id=500)

    # --- FK relationships ---

    def test_fk_integration_cascade(self):
        integration = _make_integration()
        sr = _make_supply_request(integration)
        sr_pk = sr.pk
        integration.delete()
        assert not SupplyRequest.objects.filter(pk=sr_pk).exists()

    def test_fk_nullable_fields_default_none(self):
        integration = _make_integration()
        sr = _make_supply_request(integration)
        assert sr.object is None
        assert sr.contract is None
        assert sr.operator is None

    def test_related_name_supply_requests(self):
        integration = _make_integration()
        _make_supply_request(integration, bitrix_deal_id=1)
        _make_supply_request(integration, bitrix_deal_id=2)
        assert integration.supply_requests.count() == 2

    # --- Decimal amount ---

    def test_amount_decimal(self):
        integration = _make_integration()
        sr = _make_supply_request(
            integration,
            amount=Decimal('123456.78'),
        )
        sr.refresh_from_db()
        assert sr.amount == Decimal('123456.78')
