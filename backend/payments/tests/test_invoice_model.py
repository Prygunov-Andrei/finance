"""
Тесты для моделей Invoice, InvoiceItem, InvoiceEvent.
"""
import pytest
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone

from payments.models import (
    Invoice, InvoiceItem, InvoiceEvent, ExpenseCategory,
)
from accounting.models import LegalEntity, Account, Counterparty, TaxSystem
from objects.models import Object


# =============================================================================
# Вспомогательные фикстуры
# =============================================================================

@pytest.fixture
def tax_system(db):
    return TaxSystem.objects.create(code='osn_test', name='ОСН', is_active=True)


@pytest.fixture
def legal_entity(tax_system):
    return LegalEntity.objects.create(
        name='Тест ООО',
        short_name='ТОО',
        inn='1234567890',
        tax_system=tax_system,
        is_active=True,
    )


@pytest.fixture
def account(legal_entity):
    return Account.objects.create(
        legal_entity=legal_entity,
        name='Основной расчётный',
        number='40702810000001',
        is_active=True,
    )


@pytest.fixture
def counterparty(db):
    return Counterparty.objects.create(
        name='Поставщик Тест',
        inn='9876543210',
        type=Counterparty.Type.VENDOR,
        legal_form=Counterparty.LegalForm.OOO,
        is_active=True,
    )


@pytest.fixture
def category(db):
    return ExpenseCategory.objects.create(
        name='Стройматериалы',
        code='materials_test',
        is_active=True,
    )


@pytest.fixture
def obj(db):
    return Object.objects.create(name='Объект для тестов Invoice')


@pytest.fixture
def invoice(counterparty, obj, account, legal_entity, category):
    return Invoice.objects.create(
        invoice_number='INV-001',
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=14),
        counterparty=counterparty,
        object=obj,
        account=account,
        legal_entity=legal_entity,
        category=category,
        amount_gross=Decimal('50000.00'),
        amount_net=Decimal('41666.67'),
        vat_amount=Decimal('8333.33'),
        description='Тестовый счёт на оплату',
    )


# =============================================================================
# Invoice — создание и значения по умолчанию
# =============================================================================

class TestInvoiceCreation:
    """Тесты создания Invoice и значений по умолчанию."""

    def test_default_status_is_recognition(self, invoice):
        """Статус по умолчанию — recognition."""
        assert invoice.status == Invoice.Status.RECOGNITION

    def test_default_source_is_manual(self, invoice):
        """Источник по умолчанию — manual."""
        assert invoice.source == Invoice.Source.MANUAL

    def test_create_with_minimal_fields(self, db):
        """Создание Invoice с минимальным набором полей."""
        inv = Invoice.objects.create()
        assert inv.pk is not None
        assert inv.status == Invoice.Status.RECOGNITION
        assert inv.source == Invoice.Source.MANUAL
        assert inv.amount_gross is None
        assert inv.invoice_number == ''

    def test_all_amounts_stored(self, invoice):
        assert invoice.amount_gross == Decimal('50000.00')
        assert invoice.amount_net == Decimal('41666.67')
        assert invoice.vat_amount == Decimal('8333.33')

    def test_timestamps_populated(self, invoice):
        """created_at / updated_at заполняются автоматически."""
        assert invoice.created_at is not None
        assert invoice.updated_at is not None


# =============================================================================
# Invoice — статусы
# =============================================================================

class TestInvoiceStatusChoices:
    """Тесты статусов Invoice."""

    def test_all_status_choices_exist(self):
        expected = {
            'recognition', 'review', 'in_registry',
            'approved', 'sending', 'paid', 'cancelled',
        }
        actual = {choice[0] for choice in Invoice.Status.choices}
        assert expected == actual

    def test_status_transitions_via_field(self, invoice):
        """Можно программно менять статус."""
        invoice.status = Invoice.Status.REVIEW
        invoice.save()
        invoice.refresh_from_db()
        assert invoice.status == Invoice.Status.REVIEW

        invoice.status = Invoice.Status.IN_REGISTRY
        invoice.save()
        invoice.refresh_from_db()
        assert invoice.status == Invoice.Status.IN_REGISTRY


# =============================================================================
# Invoice — строковое представление
# =============================================================================

class TestInvoiceStr:
    """Тесты __str__."""

    def test_str_with_number(self, invoice):
        s = str(invoice)
        assert 'INV-001' in s
        assert '50000' in s

    def test_str_without_number(self, db):
        inv = Invoice.objects.create(amount_gross=Decimal('1000'))
        s = str(inv)
        # Без invoice_number используется #pk
        assert f'#{inv.pk}' in s


# =============================================================================
# Invoice — связи (FK)
# =============================================================================

class TestInvoiceRelationships:
    """Тесты связей Invoice с другими моделями."""

    def test_counterparty_fk(self, invoice, counterparty):
        assert invoice.counterparty == counterparty
        assert invoice in counterparty.invoices.all()

    def test_object_fk(self, invoice, obj):
        assert invoice.object == obj
        assert invoice in obj.invoices.all()

    def test_account_fk(self, invoice, account):
        assert invoice.account == account
        assert invoice in account.invoices.all()

    def test_legal_entity_fk(self, invoice, legal_entity):
        assert invoice.legal_entity == legal_entity
        assert invoice in legal_entity.invoices.all()

    def test_category_fk(self, invoice, category):
        assert invoice.category == category

    def test_nullable_contract(self, invoice):
        """contract может быть NULL."""
        assert invoice.contract is None


# =============================================================================
# Invoice — is_overdue
# =============================================================================

class TestInvoiceIsOverdue:
    """Тесты свойства is_overdue."""

    def test_overdue_when_due_date_past_and_in_registry(self, invoice):
        invoice.status = Invoice.Status.IN_REGISTRY
        invoice.due_date = date.today() - timedelta(days=1)
        invoice.save()
        assert invoice.is_overdue is True

    def test_overdue_when_due_date_past_and_approved(self, invoice):
        invoice.status = Invoice.Status.APPROVED
        invoice.due_date = date.today() - timedelta(days=1)
        invoice.save()
        assert invoice.is_overdue is True

    def test_not_overdue_when_paid(self, invoice):
        invoice.status = Invoice.Status.PAID
        invoice.due_date = date.today() - timedelta(days=1)
        invoice.save()
        assert invoice.is_overdue is False

    def test_not_overdue_when_cancelled(self, invoice):
        invoice.status = Invoice.Status.CANCELLED
        invoice.due_date = date.today() - timedelta(days=1)
        invoice.save()
        assert invoice.is_overdue is False

    def test_not_overdue_when_due_date_today(self, invoice):
        invoice.status = Invoice.Status.IN_REGISTRY
        invoice.due_date = date.today()
        invoice.save()
        assert invoice.is_overdue is False

    def test_not_overdue_when_due_date_future(self, invoice):
        invoice.status = Invoice.Status.IN_REGISTRY
        invoice.due_date = date.today() + timedelta(days=5)
        invoice.save()
        assert invoice.is_overdue is False

    def test_not_overdue_when_no_due_date(self, invoice):
        invoice.due_date = None
        invoice.save()
        assert invoice.is_overdue is False


# =============================================================================
# InvoiceItem — создание
# =============================================================================

class TestInvoiceItemCreation:
    """Тесты InvoiceItem."""

    def test_create_with_all_fields(self, invoice):
        item = InvoiceItem.objects.create(
            invoice=invoice,
            raw_name='Цемент М500',
            quantity=Decimal('10.000'),
            unit='мешок',
            price_per_unit=Decimal('450.00'),
            amount=Decimal('4500.00'),
            vat_amount=Decimal('750.00'),
        )
        assert item.pk is not None
        assert item.raw_name == 'Цемент М500'
        assert item.quantity == Decimal('10.000')
        assert item.unit == 'мешок'
        assert item.price_per_unit == Decimal('450.00')
        assert item.amount == Decimal('4500.00')
        assert item.vat_amount == Decimal('750.00')

    def test_auto_calculate_amount(self, invoice):
        """amount рассчитывается автоматически, если не задан."""
        item = InvoiceItem(
            invoice=invoice,
            raw_name='Гвозди',
            quantity=Decimal('100.000'),
            unit='шт',
            price_per_unit=Decimal('5.50'),
        )
        item.save()
        assert item.amount == Decimal('100.000') * Decimal('5.50')

    def test_product_nullable(self, invoice):
        item = InvoiceItem.objects.create(
            invoice=invoice,
            raw_name='Услуга доставки',
            quantity=Decimal('1.000'),
            unit='усл',
            price_per_unit=Decimal('3000.00'),
            amount=Decimal('3000.00'),
        )
        assert item.product is None

    def test_str_representation(self, invoice):
        item = InvoiceItem.objects.create(
            invoice=invoice,
            raw_name='Песок строительный',
            quantity=Decimal('5.000'),
            unit='т',
            price_per_unit=Decimal('1200.00'),
            amount=Decimal('6000.00'),
        )
        s = str(item)
        assert 'Песок строительный' in s
        assert '5' in s

    def test_invoice_items_reverse_relation(self, invoice):
        InvoiceItem.objects.create(
            invoice=invoice,
            raw_name='Позиция 1',
            quantity=Decimal('1.000'),
            unit='шт',
            price_per_unit=Decimal('100.00'),
            amount=Decimal('100.00'),
        )
        InvoiceItem.objects.create(
            invoice=invoice,
            raw_name='Позиция 2',
            quantity=Decimal('2.000'),
            unit='шт',
            price_per_unit=Decimal('200.00'),
            amount=Decimal('400.00'),
        )
        assert invoice.items.count() == 2


# =============================================================================
# InvoiceEvent — создание
# =============================================================================

class TestInvoiceEventCreation:
    """Тесты InvoiceEvent."""

    def test_create_event(self, invoice, admin_user):
        event = InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.CREATED,
            user=admin_user,
            comment='Счёт создан вручную',
        )
        assert event.pk is not None
        assert event.event_type == 'created'
        assert event.user == admin_user
        assert event.comment == 'Счёт создан вручную'

    def test_all_event_types(self, invoice):
        """Все типы событий корректно создаются."""
        expected_types = {
            'created', 'recognized', 'reviewed', 'sent_to_registry',
            'approved', 'rejected', 'rescheduled', 'sent_to_bank',
            'paid', 'cancelled', 'comment',
        }
        actual_types = {c[0] for c in InvoiceEvent.EventType.choices}
        assert expected_types == actual_types

        # Создаём по одному событию каждого типа
        for et_value, _ in InvoiceEvent.EventType.choices:
            event = InvoiceEvent.objects.create(
                invoice=invoice,
                event_type=et_value,
                comment=f'test {et_value}',
            )
            assert event.event_type == et_value

    def test_event_with_old_new_values(self, invoice, admin_user):
        event = InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.RESCHEDULED,
            user=admin_user,
            old_value={'due_date': '2025-03-01'},
            new_value={'due_date': '2025-04-01'},
            comment='Перенос даты оплаты',
        )
        assert event.old_value == {'due_date': '2025-03-01'}
        assert event.new_value == {'due_date': '2025-04-01'}

    def test_event_str(self, invoice):
        event = InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.APPROVED,
            comment='ok',
        )
        s = str(event)
        assert str(invoice.pk) in s

    def test_events_reverse_relation(self, invoice):
        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.CREATED,
        )
        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.APPROVED,
        )
        assert invoice.events.count() == 2
