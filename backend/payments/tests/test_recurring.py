"""
Тесты для моделей RecurringPayment и IncomeRecord, а также их ViewSets.
"""
import pytest
from datetime import date, timedelta
from decimal import Decimal

from payments.models import (
    RecurringPayment, IncomeRecord, ExpenseCategory,
)
from accounting.models import LegalEntity, Account, Counterparty, TaxSystem
from objects.models import Object


# =============================================================================
# Вспомогательные фикстуры
# =============================================================================

@pytest.fixture
def tax_system(db):
    return TaxSystem.objects.create(code='osn_rec', name='ОСН', is_active=True)


@pytest.fixture
def legal_entity(tax_system):
    return LegalEntity.objects.create(
        name='ЮЛ Recurring',
        short_name='ЮЛР',
        inn='3333333333',
        tax_system=tax_system,
        is_active=True,
    )


@pytest.fixture
def account(legal_entity):
    return Account.objects.create(
        legal_entity=legal_entity,
        name='Счёт Recurring',
        number='40702810088888',
        is_active=True,
    )


@pytest.fixture
def counterparty(db):
    return Counterparty.objects.create(
        name='Арендодатель',
        inn='4444444444',
        type=Counterparty.Type.VENDOR,
        legal_form=Counterparty.LegalForm.OOO,
        is_active=True,
    )


@pytest.fixture
def category(db):
    return ExpenseCategory.objects.create(
        name='Аренда',
        code='rent_test',
        is_active=True,
    )


@pytest.fixture
def obj(db):
    return Object.objects.create(name='Объект Recurring')


@pytest.fixture
def recurring(counterparty, category, account, legal_entity, obj):
    return RecurringPayment.objects.create(
        name='Аренда офиса',
        counterparty=counterparty,
        category=category,
        account=account,
        legal_entity=legal_entity,
        object=obj,
        amount=Decimal('50000.00'),
        amount_is_fixed=True,
        frequency=RecurringPayment.Frequency.MONTHLY,
        day_of_month=10,
        start_date=date(2025, 1, 10),
        next_generation_date=date(2025, 2, 10),
        description='Ежемесячная аренда офиса',
        is_active=True,
    )


@pytest.fixture
def income_record(account, category, legal_entity, counterparty):
    return IncomeRecord.objects.create(
        account=account,
        category=category,
        legal_entity=legal_entity,
        counterparty=counterparty,
        amount=Decimal('200000.00'),
        payment_date=date.today(),
        description='Оплата по договору подряда',
    )


# =============================================================================
# RecurringPayment — модель
# =============================================================================

class TestRecurringPaymentModel:

    def test_create_with_all_fields(self, recurring):
        assert recurring.pk is not None
        assert recurring.name == 'Аренда офиса'
        assert recurring.amount == Decimal('50000.00')
        assert recurring.amount_is_fixed is True
        assert recurring.frequency == RecurringPayment.Frequency.MONTHLY
        assert recurring.day_of_month == 10
        assert recurring.start_date == date(2025, 1, 10)
        assert recurring.next_generation_date == date(2025, 2, 10)
        assert recurring.is_active is True

    def test_frequency_choices(self):
        expected = {'monthly', 'quarterly', 'yearly'}
        actual = {c[0] for c in RecurringPayment.Frequency.choices}
        assert expected == actual

    def test_str_representation(self, recurring):
        s = str(recurring)
        assert 'Аренда офиса' in s
        assert '50000' in s

    def test_relationships(self, recurring, counterparty, category, account, legal_entity, obj):
        assert recurring.counterparty == counterparty
        assert recurring.category == category
        assert recurring.account == account
        assert recurring.legal_entity == legal_entity
        assert recurring.object == obj

    def test_nullable_contract(self, recurring):
        assert recurring.contract is None

    def test_nullable_end_date(self, recurring):
        assert recurring.end_date is None

    def test_day_of_month_defaults(self, counterparty, category, account, legal_entity):
        rp = RecurringPayment.objects.create(
            name='Тест default',
            counterparty=counterparty,
            category=category,
            account=account,
            legal_entity=legal_entity,
            amount=Decimal('1000.00'),
            frequency=RecurringPayment.Frequency.QUARTERLY,
            start_date=date.today(),
            next_generation_date=date.today() + timedelta(days=90),
        )
        assert rp.day_of_month == 1
        assert rp.amount_is_fixed is True

    def test_validation_day_of_month(self, counterparty, category, account, legal_entity):
        """day_of_month > 28 вызывает ValidationError."""
        from django.core.exceptions import ValidationError

        rp = RecurringPayment(
            name='Bad day',
            counterparty=counterparty,
            category=category,
            account=account,
            legal_entity=legal_entity,
            amount=Decimal('1000.00'),
            frequency=RecurringPayment.Frequency.MONTHLY,
            day_of_month=31,
            start_date=date.today(),
            next_generation_date=date.today(),
        )
        with pytest.raises(ValidationError):
            rp.clean()


# =============================================================================
# IncomeRecord — модель
# =============================================================================

class TestIncomeRecordModel:

    def test_create_income_record(self, income_record):
        assert income_record.pk is not None
        assert income_record.amount == Decimal('200000.00')
        assert income_record.payment_date == date.today()
        assert income_record.description == 'Оплата по договору подряда'

    def test_str_representation(self, income_record):
        s = str(income_record)
        assert '200000' in s

    def test_relationships(self, income_record, account, category, legal_entity, counterparty):
        assert income_record.account == account
        assert income_record.category == category
        assert income_record.legal_entity == legal_entity
        assert income_record.counterparty == counterparty

    def test_nullable_contract(self, income_record):
        assert income_record.contract is None

    def test_nullable_scan_file(self, income_record):
        assert not income_record.scan_file


# =============================================================================
# RecurringPaymentViewSet — API
# =============================================================================

RECURRING_URL = '/api/v1/recurring-payments/'


@pytest.mark.django_db
class TestRecurringPaymentViewSet:

    def test_list(self, authenticated_client, recurring):
        response = authenticated_client.get(RECURRING_URL)
        assert response.status_code == 200
        ids = [item['id'] for item in response.data['results']]
        assert recurring.pk in ids

    def test_create(self, authenticated_client, counterparty, category, account, legal_entity):
        data = {
            'name': 'Интернет',
            'counterparty': counterparty.pk,
            'category': category.pk,
            'account': account.pk,
            'legal_entity': legal_entity.pk,
            'amount': '3000.00',
            'amount_is_fixed': True,
            'frequency': 'monthly',
            'day_of_month': 5,
            'start_date': str(date.today()),
            'next_generation_date': str(date.today() + timedelta(days=30)),
            'description': 'Ежемесячный интернет',
            'is_active': True,
        }
        response = authenticated_client.post(RECURRING_URL, data, format='json')
        assert response.status_code == 201
        assert RecurringPayment.objects.filter(name='Интернет').exists()

    def test_retrieve(self, authenticated_client, recurring):
        url = f'{RECURRING_URL}{recurring.pk}/'
        response = authenticated_client.get(url)
        assert response.status_code == 200
        assert response.data['name'] == 'Аренда офиса'

    def test_update(self, authenticated_client, recurring, counterparty, category, account, legal_entity):
        url = f'{RECURRING_URL}{recurring.pk}/'
        data = {
            'name': 'Аренда офиса (обновлено)',
            'counterparty': counterparty.pk,
            'category': category.pk,
            'account': account.pk,
            'legal_entity': legal_entity.pk,
            'amount': '55000.00',
            'amount_is_fixed': True,
            'frequency': 'monthly',
            'day_of_month': 10,
            'start_date': str(date(2025, 1, 10)),
            'next_generation_date': str(date(2025, 2, 10)),
            'is_active': True,
        }
        response = authenticated_client.put(url, data, format='json')
        assert response.status_code == 200
        recurring.refresh_from_db()
        assert recurring.name == 'Аренда офиса (обновлено)'
        assert recurring.amount == Decimal('55000.00')

    def test_partial_update(self, authenticated_client, recurring):
        url = f'{RECURRING_URL}{recurring.pk}/'
        response = authenticated_client.patch(url, {'is_active': False}, format='json')
        assert response.status_code == 200
        recurring.refresh_from_db()
        assert recurring.is_active is False

    def test_delete(self, authenticated_client, recurring):
        url = f'{RECURRING_URL}{recurring.pk}/'
        response = authenticated_client.delete(url)
        assert response.status_code == 204
        assert not RecurringPayment.objects.filter(pk=recurring.pk).exists()

    def test_unauthenticated_returns_401(self, api_client):
        response = api_client.get(RECURRING_URL)
        assert response.status_code == 401


# =============================================================================
# IncomeRecordViewSet — API
# =============================================================================

INCOME_URL = '/api/v1/income-records/'


@pytest.mark.django_db
class TestIncomeRecordViewSet:

    def test_list(self, authenticated_client, income_record):
        response = authenticated_client.get(INCOME_URL)
        assert response.status_code == 200
        ids = [item['id'] for item in response.data['results']]
        assert income_record.pk in ids

    def test_create(self, authenticated_client, account, category, legal_entity, counterparty):
        data = {
            'account': account.pk,
            'category': category.pk,
            'legal_entity': legal_entity.pk,
            'counterparty': counterparty.pk,
            'amount': '150000.00',
            'payment_date': str(date.today()),
            'description': 'Аванс по договору',
        }
        response = authenticated_client.post(INCOME_URL, data, format='json')
        assert response.status_code == 201
        assert IncomeRecord.objects.filter(description='Аванс по договору').exists()

    def test_retrieve(self, authenticated_client, income_record):
        url = f'{INCOME_URL}{income_record.pk}/'
        response = authenticated_client.get(url)
        assert response.status_code == 200
        assert response.data['amount'] == '200000.00'

    def test_update(self, authenticated_client, income_record, account, category, legal_entity):
        url = f'{INCOME_URL}{income_record.pk}/'
        data = {
            'account': account.pk,
            'category': category.pk,
            'legal_entity': legal_entity.pk,
            'amount': '250000.00',
            'payment_date': str(date.today()),
            'description': 'Обновлённое описание',
        }
        response = authenticated_client.put(url, data, format='json')
        assert response.status_code == 200
        income_record.refresh_from_db()
        assert income_record.amount == Decimal('250000.00')

    def test_partial_update(self, authenticated_client, income_record):
        url = f'{INCOME_URL}{income_record.pk}/'
        response = authenticated_client.patch(url, {'description': 'Новое'}, format='json')
        assert response.status_code == 200
        income_record.refresh_from_db()
        assert income_record.description == 'Новое'

    def test_delete(self, authenticated_client, income_record):
        url = f'{INCOME_URL}{income_record.pk}/'
        response = authenticated_client.delete(url)
        assert response.status_code == 204
        assert not IncomeRecord.objects.filter(pk=income_record.pk).exists()

    def test_unauthenticated_returns_401(self, api_client):
        response = api_client.get(INCOME_URL)
        assert response.status_code == 401
