"""Tests for BankTransaction.invoice FK and BankPaymentOrder ↔ Invoice relationship."""

import os
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from django.utils import timezone

# Установить ключ шифрования для тестов (до импорта banking.models)
os.environ.setdefault(
    'BANK_ENCRYPTION_KEY',
    'Cba2op88Xj8PxFfPduejikxKMdYcY1VS76j45BdfrYw=',
)

from accounting.models import TaxSystem, LegalEntity, Account, Counterparty
from banking.models import (
    BankAccount,
    BankConnection,
    BankPaymentOrder,
    BankPaymentOrderEvent,
    BankTransaction,
)
from payments.models import (
    ExpenseCategory,
    IncomeRecord,
    Invoice,
)


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tax_system(db):
    return TaxSystem.objects.create(
        code='osn_vat_20_test',
        name='ОСН (НДС 20%)',
        vat_rate=Decimal('20.00'),
        has_vat=True,
    )


@pytest.fixture
def legal_entity(tax_system):
    return LegalEntity.objects.create(
        name='ООО Тест',
        short_name='Тест',
        inn='111111111111',
        tax_system=tax_system,
    )


@pytest.fixture
def internal_account(legal_entity):
    return Account.objects.create(
        legal_entity=legal_entity,
        name='Основной р/с',
        number='40702810000000000001',
        initial_balance=Decimal('100000.00'),
    )


@pytest.fixture
def bank_connection(legal_entity):
    return BankConnection.objects.create(
        legal_entity=legal_entity,
        name='Точка — тестовое',
        client_id='test-client-id',
        client_secret='test-client-secret',
        customer_code='CUST001',
    )


@pytest.fixture
def bank_account(internal_account, bank_connection):
    return BankAccount.objects.create(
        account=internal_account,
        bank_connection=bank_connection,
        external_account_id='ext-acc-001',
    )


@pytest.fixture
def expense_category(db):
    return ExpenseCategory.objects.create(
        name='Закупка материалов',
        code='test_materials',
    )


@pytest.fixture
def counterparty(db):
    return Counterparty.objects.create(
        name='ООО Поставщик',
        short_name='Поставщик',
        type=Counterparty.Type.VENDOR,
        legal_form=Counterparty.LegalForm.OOO,
        inn='999999999999',
        bank_name='Сбербанк',
        bank_bik='044525225',
        bank_account='40702810000000000099',
    )


@pytest.fixture
def invoice(internal_account, legal_entity, expense_category, counterparty):
    return Invoice.objects.create(
        source=Invoice.Source.MANUAL,
        invoice_number='INV-001',
        invoice_date=date(2026, 2, 1),
        due_date=date(2026, 2, 28),
        counterparty=counterparty,
        category=expense_category,
        account=internal_account,
        legal_entity=legal_entity,
        amount_gross=Decimal('50000.00'),
        amount_net=Decimal('41666.67'),
        vat_amount=Decimal('8333.33'),
        status=Invoice.Status.APPROVED,
    )


def _make_payment_order(bank_account, user, **overrides):
    defaults = {
        'bank_account': bank_account,
        'recipient_name': 'ООО Поставщик',
        'recipient_inn': '999999999999',
        'recipient_kpp': '',
        'recipient_account': '40702810000000000099',
        'recipient_bank_name': 'Сбербанк',
        'recipient_bik': '044525225',
        'recipient_corr_account': '30101810400000000225',
        'amount': Decimal('50000.00'),
        'purpose': 'Оплата по счёту INV-001',
        'payment_date': date(2026, 2, 15),
        'original_payment_date': date(2026, 2, 15),
        'created_by': user,
    }
    defaults.update(overrides)
    return BankPaymentOrder.objects.create(**defaults)


# ===================================================================
# BankTransaction.invoice FK
# ===================================================================

@pytest.mark.django_db
class TestBankTransactionInvoiceFK:
    """Test the new `invoice` ForeignKey on BankTransaction."""

    def test_transaction_invoice_null_by_default(self, bank_account):
        tx = BankTransaction.objects.create(
            bank_account=bank_account,
            external_id='TX-001',
            transaction_type=BankTransaction.TransactionType.OUTGOING,
            amount=Decimal('10000.00'),
            date=date(2026, 2, 10),
            purpose='Test payment',
        )
        assert tx.invoice is None

    def test_assign_invoice_to_transaction(self, bank_account, invoice):
        tx = BankTransaction.objects.create(
            bank_account=bank_account,
            external_id='TX-002',
            transaction_type=BankTransaction.TransactionType.OUTGOING,
            amount=Decimal('50000.00'),
            date=date(2026, 2, 15),
            purpose='Оплата по счёту INV-001',
            invoice=invoice,
            reconciled=True,
        )
        assert tx.invoice == invoice
        assert tx.reconciled is True

    def test_invoice_matched_bank_transactions_reverse(self, bank_account, invoice):
        tx = BankTransaction.objects.create(
            bank_account=bank_account,
            external_id='TX-003',
            transaction_type=BankTransaction.TransactionType.OUTGOING,
            amount=Decimal('50000.00'),
            date=date(2026, 2, 15),
            invoice=invoice,
        )
        assert invoice.matched_bank_transactions.count() == 1
        assert invoice.matched_bank_transactions.first() == tx

    def test_invoice_delete_sets_null(self, bank_account, invoice):
        tx = BankTransaction.objects.create(
            bank_account=bank_account,
            external_id='TX-004',
            transaction_type=BankTransaction.TransactionType.OUTGOING,
            amount=Decimal('50000.00'),
            date=date(2026, 2, 15),
            invoice=invoice,
        )
        invoice_pk = invoice.pk
        invoice.delete()
        tx.refresh_from_db()
        assert tx.invoice is None


# ===================================================================
# BankPaymentOrder ↔ Invoice (via Invoice.bank_payment_order)
# ===================================================================

@pytest.mark.django_db
class TestBankPaymentOrderInvoiceRelationship:
    """Test OneToOne link from Invoice to BankPaymentOrder."""

    def test_create_order_then_link_invoice(self, bank_account, admin_user, invoice):
        order = _make_payment_order(bank_account, admin_user)
        invoice.bank_payment_order = order
        invoice.save(update_fields=['bank_payment_order'])

        # Forward access: invoice → order
        invoice.refresh_from_db()
        assert invoice.bank_payment_order == order

        # Reverse access: order → invoice
        order.refresh_from_db()
        assert order.invoice == invoice

    def test_order_invoice_is_none_by_default(self, bank_account, admin_user):
        order = _make_payment_order(bank_account, admin_user)
        assert not hasattr(order, 'invoice') or getattr(order, 'invoice', None) is None

    def test_delete_order_sets_null_on_invoice(self, bank_account, admin_user, invoice):
        order = _make_payment_order(bank_account, admin_user)
        invoice.bank_payment_order = order
        invoice.save(update_fields=['bank_payment_order'])

        order.delete()
        invoice.refresh_from_db()
        assert invoice.bank_payment_order is None


# ===================================================================
# reconcile_transaction service
# ===================================================================

@pytest.mark.django_db
class TestReconcileTransaction:
    """Test banking.services.reconcile_transaction links transaction to invoice."""

    def test_reconcile_links_to_invoice(self, bank_account, invoice):
        from banking.services import reconcile_transaction

        tx = BankTransaction.objects.create(
            bank_account=bank_account,
            external_id='TX-RECON-001',
            transaction_type=BankTransaction.TransactionType.OUTGOING,
            amount=Decimal('50000.00'),
            date=date(2026, 2, 15),
        )

        result = reconcile_transaction(tx, invoice.pk)
        assert result is True

        tx.refresh_from_db()
        assert tx.invoice == invoice
        assert tx.reconciled is True

    def test_reconcile_nonexistent_id_returns_false(self, bank_account):
        from banking.services import reconcile_transaction

        tx = BankTransaction.objects.create(
            bank_account=bank_account,
            external_id='TX-RECON-002',
            transaction_type=BankTransaction.TransactionType.OUTGOING,
            amount=Decimal('10000.00'),
            date=date(2026, 2, 15),
        )

        result = reconcile_transaction(tx, 999999)
        assert result is False


# ===================================================================
# create_payment_order service with invoice_id
# ===================================================================

@pytest.mark.django_db
class TestCreatePaymentOrderWithInvoice:
    """Test banking.services.create_payment_order accepting invoice_id."""

    def test_create_order_with_invoice_id(self, bank_account, admin_user, invoice):
        from banking.services import create_payment_order

        order = create_payment_order(
            bank_account=bank_account,
            user=admin_user,
            recipient_name='ООО Поставщик',
            recipient_inn='999999999999',
            recipient_kpp='',
            recipient_account='40702810000000000099',
            recipient_bank_name='Сбербанк',
            recipient_bik='044525225',
            recipient_corr_account='30101810400000000225',
            amount=Decimal('50000.00'),
            purpose='Оплата по счёту INV-001',
            invoice_id=invoice.pk,
        )

        assert order.pk is not None
        assert order.status == BankPaymentOrder.Status.DRAFT

        # Invoice should now point to the created order
        invoice.refresh_from_db()
        assert invoice.bank_payment_order == order

        # Reverse access
        assert order.invoice == invoice

    def test_create_order_without_invoice_id(self, bank_account, admin_user):
        from banking.services import create_payment_order

        order = create_payment_order(
            bank_account=bank_account,
            user=admin_user,
            recipient_name='ООО Подрядчик',
            recipient_inn='888888888888',
            recipient_kpp='',
            recipient_account='40702810000000000088',
            recipient_bank_name='Альфа',
            recipient_bik='044525593',
            recipient_corr_account='30101810200000000593',
            amount=Decimal('25000.00'),
            purpose='Оплата по договору',
        )

        assert order.pk is not None
        # No invoice linked — accessing order.invoice should raise or be None
        with pytest.raises(Invoice.DoesNotExist):
            _ = order.invoice

    def test_create_order_event_logged(self, bank_account, admin_user, invoice):
        from banking.services import create_payment_order

        order = create_payment_order(
            bank_account=bank_account,
            user=admin_user,
            recipient_name='ООО Поставщик',
            recipient_inn='999999999999',
            recipient_kpp='',
            recipient_account='40702810000000000099',
            recipient_bank_name='Сбербанк',
            recipient_bik='044525225',
            recipient_corr_account='30101810400000000225',
            amount=Decimal('50000.00'),
            purpose='Оплата',
            invoice_id=invoice.pk,
        )

        events = BankPaymentOrderEvent.objects.filter(order=order)
        assert events.count() == 1
        assert events.first().event_type == BankPaymentOrderEvent.EventType.CREATED


# ===================================================================
# Account.get_current_balance with Invoice + IncomeRecord
# ===================================================================

@pytest.mark.django_db
class TestAccountGetCurrentBalance:
    """Test Account.get_current_balance() with new Invoice & IncomeRecord models."""

    def test_balance_initial_only(self, internal_account):
        assert internal_account.get_current_balance() == Decimal('100000.00')

    def test_balance_with_paid_invoice(self, internal_account, invoice, legal_entity, expense_category):
        # Mark invoice as paid
        invoice.status = Invoice.Status.PAID
        invoice.paid_at = timezone.now()
        invoice.save(update_fields=['status', 'paid_at'])

        # initial_balance - invoice.amount_gross
        expected = Decimal('100000.00') - Decimal('50000.00')
        assert internal_account.get_current_balance() == expected

    def test_balance_with_income_record(self, internal_account, legal_entity, expense_category, counterparty):
        IncomeRecord.objects.create(
            account=internal_account,
            category=expense_category,
            legal_entity=legal_entity,
            counterparty=counterparty,
            amount=Decimal('30000.00'),
            payment_date=date(2026, 2, 10),
            description='Оплата от заказчика',
        )

        expected = Decimal('100000.00') + Decimal('30000.00')
        assert internal_account.get_current_balance() == expected

    def test_balance_combined(self, internal_account, invoice, legal_entity, expense_category, counterparty):
        # Paid invoice (expense)
        invoice.status = Invoice.Status.PAID
        invoice.paid_at = timezone.now()
        invoice.save(update_fields=['status', 'paid_at'])

        # Income
        IncomeRecord.objects.create(
            account=internal_account,
            category=expense_category,
            legal_entity=legal_entity,
            counterparty=counterparty,
            amount=Decimal('75000.00'),
            payment_date=date(2026, 2, 12),
        )

        # 100000 + 75000 - 50000 = 125000
        expected = Decimal('125000.00')
        assert internal_account.get_current_balance() == expected

    def test_unpaid_invoice_not_counted(self, internal_account, invoice):
        # Invoice in APPROVED status (not paid) — should not affect balance
        assert invoice.status == Invoice.Status.APPROVED
        assert internal_account.get_current_balance() == Decimal('100000.00')
