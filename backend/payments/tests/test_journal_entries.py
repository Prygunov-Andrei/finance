"""
Tests for JournalEntry model, JournalService, and related API endpoints.
"""
import pytest
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User

from payments.models import (
    ExpenseCategory, JournalEntry, Invoice, IncomeRecord,
)
from payments.journal_service import JournalService
from accounting.models import LegalEntity, Account, Counterparty, TaxSystem
from objects.models import Object
from contracts.models import Contract


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def tax_system(db):
    return TaxSystem.objects.create(code='osn_j', name='ОСН', is_active=True)


@pytest.fixture
def legal_entity(tax_system):
    return LegalEntity.objects.create(
        name='Тест Юрлицо',
        short_name='ТЮ',
        inn='9999999990',
        tax_system=tax_system,
        is_active=True,
    )


@pytest.fixture
def bank_account(legal_entity):
    return Account.objects.create(
        legal_entity=legal_entity,
        name='Расчётный',
        number='40702810000099',
        is_active=True,
    )


@pytest.fixture
def user(db):
    return User.objects.create_user(username='testjournal', password='pass123')


@pytest.fixture
def system_accounts(db):
    profit, _ = ExpenseCategory.objects.get_or_create(
        code='profit',
        defaults={
            'name': 'Прибыль',
            'account_type': ExpenseCategory.AccountType.SYSTEM,
        },
    )
    wc, _ = ExpenseCategory.objects.get_or_create(
        code='working_capital',
        defaults={
            'name': 'Оборотные средства',
            'account_type': ExpenseCategory.AccountType.SYSTEM,
        },
    )
    vat, _ = ExpenseCategory.objects.get_or_create(
        code='vat',
        defaults={
            'name': 'НДС',
            'account_type': ExpenseCategory.AccountType.SYSTEM,
        },
    )
    return {'profit': profit, 'working_capital': wc, 'vat': vat}


@pytest.fixture
def expense_category(db):
    return ExpenseCategory.objects.create(
        name='Аренда',
        code='rent_test_j',
        account_type=ExpenseCategory.AccountType.EXPENSE,
    )


@pytest.fixture
def obj(db):
    return Object.objects.create(name='Объект Тест Журнал', status='in_progress')


@pytest.fixture
def contract(obj, legal_entity):
    counterparty = Counterparty.objects.create(
        name='Подрядчик Тест',
        inn='1112223331',
        type='vendor',
        legal_form='ooo',
    )
    return Contract.objects.create(
        object=obj,
        legal_entity=legal_entity,
        counterparty=counterparty,
        number='ДОГ-J-001',
        name='Тестовый договор',
        contract_type='expense',
        contract_date=date.today(),
        total_amount=Decimal('1000000'),
        status='planned',
    )


# =============================================================================
# Model tests
# =============================================================================

class TestExpenseCategoryAccountType:
    def test_system_account_created(self, system_accounts):
        profit = system_accounts['profit']
        assert profit.account_type == ExpenseCategory.AccountType.SYSTEM
        assert profit.code == 'profit'

    def test_object_account_auto_created(self, obj):
        acc = ExpenseCategory.objects.filter(
            account_type=ExpenseCategory.AccountType.OBJECT,
            object=obj,
        ).first()
        assert acc is not None
        assert acc.code == f'obj_{obj.pk}'

    def test_contract_account_auto_created(self, contract):
        acc = ExpenseCategory.objects.filter(
            account_type=ExpenseCategory.AccountType.CONTRACT,
            contract=contract,
        ).first()
        assert acc is not None
        assert acc.code == f'contract_{contract.pk}'
        if contract.object:
            obj_acc = ExpenseCategory.objects.filter(
                account_type=ExpenseCategory.AccountType.OBJECT,
                object=contract.object,
            ).first()
            assert acc.parent == obj_acc

    def test_balance_calculation(self, system_accounts, user):
        profit = system_accounts['profit']
        wc = system_accounts['working_capital']

        JournalEntry.objects.create(
            date=date.today(),
            from_account=profit,
            to_account=wc,
            amount=Decimal('100000'),
            description='test',
            created_by=user,
        )
        assert wc.get_balance() == Decimal('100000')
        assert profit.get_balance() == Decimal('-100000')

    def test_balance_multiple_entries(self, system_accounts, user):
        profit = system_accounts['profit']
        wc = system_accounts['working_capital']

        JournalEntry.objects.create(
            date=date.today(), from_account=profit, to_account=wc,
            amount=Decimal('50000'), description='t1', created_by=user,
        )
        JournalEntry.objects.create(
            date=date.today(), from_account=wc, to_account=profit,
            amount=Decimal('20000'), description='t2', created_by=user,
        )
        assert wc.get_balance() == Decimal('30000')
        assert profit.get_balance() == Decimal('-30000')


class TestJournalEntryModel:
    def test_create_journal_entry(self, system_accounts, user):
        entry = JournalEntry.objects.create(
            date=date.today(),
            from_account=system_accounts['profit'],
            to_account=system_accounts['working_capital'],
            amount=Decimal('50000'),
            description='Пополнение оборотных средств',
            created_by=user,
        )
        assert entry.pk is not None
        assert str(entry) is not None

    def test_validation_same_account(self, system_accounts, user):
        from django.core.exceptions import ValidationError
        entry = JournalEntry(
            date=date.today(),
            from_account=system_accounts['profit'],
            to_account=system_accounts['profit'],
            amount=Decimal('100'),
            description='invalid',
            created_by=user,
        )
        with pytest.raises(ValidationError):
            entry.full_clean()


# =============================================================================
# Service tests
# =============================================================================

class TestJournalServiceManualPosting:
    def test_create_manual_posting(self, system_accounts, user):
        entry = JournalService.create_manual_posting(
            from_account=system_accounts['profit'],
            to_account=system_accounts['working_capital'],
            amount=Decimal('75000'),
            description='Пополнение оборотных',
            user=user,
        )
        assert entry.is_auto is False
        assert entry.amount == Decimal('75000')

    def test_manual_posting_same_account_raises(self, system_accounts, user):
        with pytest.raises(ValueError):
            JournalService.create_manual_posting(
                from_account=system_accounts['profit'],
                to_account=system_accounts['profit'],
                amount=Decimal('100'),
                description='bad',
                user=user,
            )


class TestJournalServiceCheckBalance:
    def test_check_balance_insufficient(self, obj, system_accounts, user):
        result = JournalService.check_object_balance(obj, Decimal('100000'))
        assert result['sufficient'] is False
        assert result['deficit'] == Decimal('100000')

    def test_check_balance_after_funding(self, obj, system_accounts, user):
        obj_acc = ExpenseCategory.objects.get(
            account_type=ExpenseCategory.AccountType.OBJECT,
            object=obj,
        )
        wc = system_accounts['working_capital']

        JournalService.create_manual_posting(
            from_account=wc,
            to_account=obj_acc,
            amount=Decimal('200000'),
            description='Funding',
            user=user,
        )
        result = JournalService.check_object_balance(obj, Decimal('150000'))
        assert result['sufficient'] is True
        assert result['balance'] == Decimal('200000')


class TestJournalServiceExpensePostings:
    def test_household_posting(self, system_accounts, expense_category,
                               bank_account, legal_entity, user):
        invoice = Invoice.objects.create(
            invoice_type=Invoice.InvoiceType.HOUSEHOLD,
            source=Invoice.Source.MANUAL,
            status=Invoice.Status.PAID,
            category=expense_category,
            account=bank_account,
            legal_entity=legal_entity,
            amount_gross=Decimal('50000'),
            invoice_date=date.today(),
        )
        entries = JournalService.create_expense_postings(invoice, user=user)
        assert len(entries) >= 1
        household_entry = entries[0]
        assert household_entry.from_account == system_accounts['profit']
        assert household_entry.to_account == expense_category
        assert household_entry.is_auto is True

    def test_supplier_posting_with_object(
        self, obj, expense_category, bank_account, legal_entity, user,
    ):
        invoice = Invoice.objects.create(
            invoice_type=Invoice.InvoiceType.SUPPLIER,
            source=Invoice.Source.MANUAL,
            status=Invoice.Status.PAID,
            object=obj,
            category=expense_category,
            account=bank_account,
            legal_entity=legal_entity,
            amount_gross=Decimal('100000'),
            invoice_date=date.today(),
        )
        entries = JournalService.create_expense_postings(invoice, user=user)
        assert len(entries) >= 1
        obj_acc = ExpenseCategory.objects.get(
            account_type=ExpenseCategory.AccountType.OBJECT, object=obj,
        )
        main_entry = entries[0]
        assert main_entry.from_account == obj_acc
        assert main_entry.to_account == expense_category


class TestJournalServiceIncomePostings:
    def test_customer_income_posting(
        self, obj, expense_category, bank_account, legal_entity, user,
    ):
        income = IncomeRecord.objects.create(
            income_type=IncomeRecord.IncomeType.CUSTOMER_ACT,
            account=bank_account,
            object=obj,
            category=expense_category,
            legal_entity=legal_entity,
            amount=Decimal('300000'),
            payment_date=date.today(),
        )
        entries = JournalService.create_income_postings(income, user=user)
        assert len(entries) >= 1
        obj_acc = ExpenseCategory.objects.get(
            account_type=ExpenseCategory.AccountType.OBJECT, object=obj,
        )
        assert entries[0].to_account == obj_acc


# =============================================================================
# API tests
# =============================================================================

class TestJournalEntryAPI:
    @pytest.fixture
    def auth_client(self, user):
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        client = APIClient()
        token = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        return client

    def test_list_journal_entries(self, auth_client, system_accounts, user):
        JournalEntry.objects.create(
            date=date.today(),
            from_account=system_accounts['profit'],
            to_account=system_accounts['working_capital'],
            amount=Decimal('1000'),
            description='test',
            created_by=user,
        )
        resp = auth_client.get('/api/v1/journal-entries/')
        assert resp.status_code == 200
        assert len(resp.data['results']) >= 1

    def test_manual_posting_endpoint(self, auth_client, system_accounts):
        resp = auth_client.post('/api/v1/journal-entries/manual/', {
            'from_account': system_accounts['profit'].pk,
            'to_account': system_accounts['working_capital'].pk,
            'amount': '50000',
            'description': 'Пополнение оборотных из прибыли',
        })
        assert resp.status_code == 201
        assert resp.data['amount'] == '50000.00'

    def test_check_balance_endpoint(self, auth_client, obj):
        resp = auth_client.get(
            f'/api/v1/invoices/check_balance/?object_id={obj.pk}&amount=100000'
        )
        assert resp.status_code == 200
        assert resp.data['sufficient'] is False

    def test_expense_category_balance_endpoint(self, auth_client, system_accounts):
        resp = auth_client.get(
            f'/api/v1/expense-categories/{system_accounts["profit"].pk}/balance/'
        )
        assert resp.status_code == 200
        assert 'balance' in resp.data
