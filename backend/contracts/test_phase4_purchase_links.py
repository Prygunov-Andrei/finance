from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from datetime import date

from objects.models import Object
from accounting.models import Counterparty, LegalEntity, TaxSystem
from catalog.models import Product
from payments.models import Invoice, InvoiceItem
from contracts.models import (
    Contract, ContractEstimate, ContractEstimateSection,
    ContractEstimateItem, EstimatePurchaseLink,
)
from contracts.services.estimate_compliance_checker import EstimateComplianceChecker


class Phase4TestMixin:
    """Общий setUp для тестов Фазы 4: EstimatePurchaseLink + ComplianceChecker"""

    def _create_base(self):
        self.user = User.objects.create_user(username='testuser4', password='pass')
        self.tax_system = TaxSystem.objects.create(code='osn4', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='Фирма Phase4', short_name='ФП4',
            inn='4444444444', tax_system=self.tax_system,
        )
        self.counterparty = Counterparty.objects.create(
            name='Заказчик P4', short_name='ЗП4',
            inn='5555555555',
            type=Counterparty.Type.CUSTOMER,
            legal_form=Counterparty.LegalForm.OOO,
        )
        self.obj = Object.objects.create(name='Объект P4', address='СПб')
        self.contract = Contract.objects.create(
            object=self.obj,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.INCOME,
            number='ДГ-P4',
            name='Договор Phase4',
            contract_date=date.today(),
            total_amount=Decimal('500000'),
            vat_rate=Decimal('20.00'),
        )
        self.product1 = Product.objects.create(
            name='Кабель ВВГнг 3х2.5',
        )
        self.product2 = Product.objects.create(
            name='Розетка ABB',
        )

    def _create_contract_estimate(self):
        self.ce = ContractEstimate.objects.create(
            contract=self.contract,
            number='СМД-P4',
            name='Смета Phase4',
            status=ContractEstimate.Status.SIGNED,
            signed_date=date.today(),
        )
        self.ce_section = ContractEstimateSection.objects.create(
            contract_estimate=self.ce, name='Электрика', sort_order=0,
        )
        self.cei1 = ContractEstimateItem.objects.create(
            contract_estimate=self.ce,
            section=self.ce_section,
            item_number=1,
            name='Кабель ВВГнг 3х2.5',
            unit='м',
            quantity=Decimal('100'),
            material_unit_price=Decimal('50.00'),
            work_unit_price=Decimal('30.00'),
            product=self.product1,
            sort_order=0,
        )
        self.cei2 = ContractEstimateItem.objects.create(
            contract_estimate=self.ce,
            section=self.ce_section,
            item_number=2,
            name='Розетка ABB Zena',
            unit='шт',
            quantity=Decimal('20'),
            material_unit_price=Decimal('200.00'),
            work_unit_price=Decimal('150.00'),
            product=self.product2,
            sort_order=1,
        )

    def _create_invoice(self, contract=None):
        invoice = Invoice.objects.create(
            invoice_type=Invoice.InvoiceType.SUPPLIER,
            source=Invoice.Source.MANUAL,
            status=Invoice.Status.REVIEW,
            contract=contract or self.contract,
            amount_gross=Decimal('5000'),
        )
        return invoice


class EstimatePurchaseLinkModelTests(Phase4TestMixin, TestCase):
    """Тесты модели EstimatePurchaseLink"""

    def setUp(self):
        self._create_base()
        self._create_contract_estimate()

    def test_create_link(self):
        invoice = self._create_invoice()
        inv_item = InvoiceItem.objects.create(
            invoice=invoice,
            product=self.product1,
            raw_name='Кабель ВВГнг 3х2.5',
            quantity=Decimal('10'),
            unit='м',
            price_per_unit=Decimal('45.00'),
            amount=Decimal('450.00'),
        )
        link = EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1,
            invoice_item=inv_item,
            quantity_matched=Decimal('10'),
            match_type=EstimatePurchaseLink.MatchType.EXACT,
        )
        self.assertIsNotNone(link.id)
        self.assertEqual(link.match_type, 'exact')
        self.assertFalse(link.price_exceeds)
        self.assertFalse(link.quantity_exceeds)

    def test_price_exceeds_auto_detection(self):
        invoice = self._create_invoice()
        inv_item = InvoiceItem.objects.create(
            invoice=invoice,
            product=self.product1,
            raw_name='Кабель ВВГнг 3х2.5',
            quantity=Decimal('10'),
            unit='м',
            price_per_unit=Decimal('75.00'),
            amount=Decimal('750.00'),
        )
        link = EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1,
            invoice_item=inv_item,
            quantity_matched=Decimal('10'),
        )
        self.assertTrue(link.price_exceeds)

    def test_quantity_exceeds_auto_detection(self):
        invoice = self._create_invoice()
        inv_item = InvoiceItem.objects.create(
            invoice=invoice,
            product=self.product1,
            raw_name='Кабель ВВГнг 3х2.5',
            quantity=Decimal('150'),
            unit='м',
            price_per_unit=Decimal('45.00'),
            amount=Decimal('6750.00'),
        )
        link = EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1,
            invoice_item=inv_item,
            quantity_matched=Decimal('150'),
        )
        self.assertTrue(link.quantity_exceeds)

    def test_quantity_exceeds_cumulative(self):
        """Превышение при суммировании нескольких закупок"""
        invoice = self._create_invoice()
        inv_item1 = InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель', quantity=Decimal('60'),
            unit='м', price_per_unit=Decimal('45.00'), amount=Decimal('2700'),
        )
        EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1,
            invoice_item=inv_item1,
            quantity_matched=Decimal('60'),
        )
        inv_item2 = InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель партия 2', quantity=Decimal('50'),
            unit='м', price_per_unit=Decimal('45.00'), amount=Decimal('2250'),
        )
        link2 = EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1,
            invoice_item=inv_item2,
            quantity_matched=Decimal('50'),
        )
        self.assertTrue(link2.quantity_exceeds)

    def test_no_exceed_within_limits(self):
        """Закупка в пределах сметы — флаги не выставляются"""
        invoice = self._create_invoice()
        inv_item = InvoiceItem.objects.create(
            invoice=invoice, product=self.product2,
            raw_name='Розетка ABB', quantity=Decimal('5'),
            unit='шт', price_per_unit=Decimal('180.00'), amount=Decimal('900'),
        )
        link = EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei2,
            invoice_item=inv_item,
            quantity_matched=Decimal('5'),
        )
        self.assertFalse(link.price_exceeds)
        self.assertFalse(link.quantity_exceeds)

    def test_analog_match_type(self):
        invoice = self._create_invoice()
        inv_item = InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель NYM 3х2.5 (аналог)',
            quantity=Decimal('10'), unit='м',
            price_per_unit=Decimal('55.00'), amount=Decimal('550'),
        )
        link = EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1,
            invoice_item=inv_item,
            quantity_matched=Decimal('10'),
            match_type=EstimatePurchaseLink.MatchType.ANALOG,
            match_reason='NYM аналог ВВГнг, допустимая замена по ТУ',
        )
        self.assertEqual(link.match_type, 'analog')
        self.assertEqual(link.match_reason, 'NYM аналог ВВГнг, допустимая замена по ТУ')

    def test_cascade_delete_with_estimate_item(self):
        invoice = self._create_invoice()
        inv_item = InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель', quantity=Decimal('10'), unit='м',
            price_per_unit=Decimal('45'), amount=Decimal('450'),
        )
        EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1,
            invoice_item=inv_item,
            quantity_matched=Decimal('10'),
        )
        self.assertEqual(EstimatePurchaseLink.objects.count(), 1)
        self.cei1.delete()
        self.assertEqual(EstimatePurchaseLink.objects.count(), 0)

    def test_str_representation(self):
        invoice = self._create_invoice()
        inv_item = InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель ВВГ', quantity=Decimal('10'), unit='м',
            price_per_unit=Decimal('45'), amount=Decimal('450'),
        )
        link = EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1,
            invoice_item=inv_item,
            quantity_matched=Decimal('10'),
        )
        self.assertIn('Кабель ВВГнг', str(link))
        self.assertIn('Кабель ВВГ', str(link))


class ComplianceCheckerTests(Phase4TestMixin, TestCase):
    """Тесты EstimateComplianceChecker"""

    def setUp(self):
        self._create_base()
        self._create_contract_estimate()
        self.checker = EstimateComplianceChecker()

    def test_no_contract_is_compliant(self):
        invoice = Invoice.objects.create(
            invoice_type=Invoice.InvoiceType.SUPPLIER,
            source=Invoice.Source.MANUAL,
            status=Invoice.Status.REVIEW,
            contract=None,
            amount_gross=Decimal('1000'),
        )
        result = self.checker.check_invoice(invoice)
        self.assertTrue(result['compliant'])

    def test_no_signed_estimate_is_compliant(self):
        self.ce.status = ContractEstimate.Status.DRAFT
        self.ce.save()
        invoice = self._create_invoice()
        result = self.checker.check_invoice(invoice)
        self.assertTrue(result['compliant'])

    def test_matched_item(self):
        invoice = self._create_invoice()
        inv_item = InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель ВВГнг 3х2.5', quantity=Decimal('10'), unit='м',
            price_per_unit=Decimal('45.00'), amount=Decimal('450'),
        )
        result = self.checker.check_invoice(invoice)
        self.assertTrue(result['compliant'])
        self.assertEqual(result['items'][0]['status'], 'matched')
        self.assertEqual(result['items'][0]['contract_estimate_item_id'], self.cei1.id)

    def test_unmatched_item_no_product(self):
        invoice = self._create_invoice()
        InvoiceItem.objects.create(
            invoice=invoice, product=None,
            raw_name='Неизвестный товар', quantity=Decimal('5'), unit='шт',
            price_per_unit=Decimal('100'), amount=Decimal('500'),
        )
        result = self.checker.check_invoice(invoice)
        self.assertFalse(result['compliant'])
        self.assertEqual(result['items'][0]['status'], 'unmatched')

    def test_price_exceeds(self):
        invoice = self._create_invoice()
        InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель ВВГнг 3х2.5', quantity=Decimal('10'), unit='м',
            price_per_unit=Decimal('80.00'), amount=Decimal('800'),
        )
        result = self.checker.check_invoice(invoice)
        self.assertFalse(result['compliant'])
        self.assertEqual(result['items'][0]['status'], 'exceeds')
        self.assertIn('Цена закупки', result['items'][0]['details'])

    def test_quantity_exceeds(self):
        invoice = self._create_invoice()
        InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель ВВГнг 3х2.5', quantity=Decimal('200'), unit='м',
            price_per_unit=Decimal('45.00'), amount=Decimal('9000'),
        )
        result = self.checker.check_invoice(invoice)
        self.assertFalse(result['compliant'])
        self.assertEqual(result['items'][0]['status'], 'exceeds')
        self.assertIn('Количество', result['items'][0]['details'])

    def test_quantity_exceeds_with_existing_links(self):
        """Учёт ранее сопоставленных закупок при проверке"""
        invoice1 = self._create_invoice()
        inv_item1 = InvoiceItem.objects.create(
            invoice=invoice1, product=self.product1,
            raw_name='Кабель', quantity=Decimal('80'), unit='м',
            price_per_unit=Decimal('45'), amount=Decimal('3600'),
        )
        EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1,
            invoice_item=inv_item1,
            quantity_matched=Decimal('80'),
        )
        invoice2 = self._create_invoice()
        InvoiceItem.objects.create(
            invoice=invoice2, product=self.product1,
            raw_name='Кабель партия 2', quantity=Decimal('30'), unit='м',
            price_per_unit=Decimal('45'), amount=Decimal('1350'),
        )
        result = self.checker.check_invoice(invoice2)
        self.assertFalse(result['compliant'])
        self.assertEqual(result['items'][0]['status'], 'exceeds')

    def test_auto_link_invoice(self):
        invoice = self._create_invoice()
        InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель ВВГнг', quantity=Decimal('10'), unit='м',
            price_per_unit=Decimal('45'), amount=Decimal('450'),
        )
        InvoiceItem.objects.create(
            invoice=invoice, product=self.product2,
            raw_name='Розетка ABB', quantity=Decimal('5'), unit='шт',
            price_per_unit=Decimal('180'), amount=Decimal('900'),
        )
        result = self.checker.auto_link_invoice(invoice)
        self.assertEqual(result['linked'], 2)
        self.assertEqual(result['unmatched'], 0)
        self.assertEqual(EstimatePurchaseLink.objects.count(), 2)

    def test_auto_link_unmatched_items(self):
        other_product = Product.objects.create(name='Труба ПНД')
        invoice = self._create_invoice()
        InvoiceItem.objects.create(
            invoice=invoice, product=other_product,
            raw_name='Труба ПНД 25', quantity=Decimal('30'), unit='м',
            price_per_unit=Decimal('15'), amount=Decimal('450'),
        )
        result = self.checker.auto_link_invoice(invoice)
        self.assertEqual(result['linked'], 0)
        self.assertEqual(result['unmatched'], 1)

    def test_auto_link_no_contract(self):
        invoice = Invoice.objects.create(
            invoice_type=Invoice.InvoiceType.SUPPLIER,
            source=Invoice.Source.MANUAL,
            status=Invoice.Status.REVIEW,
            amount_gross=Decimal('1000'),
        )
        result = self.checker.auto_link_invoice(invoice)
        self.assertEqual(result['linked'], 0)
        self.assertEqual(result['unmatched'], 0)

    def test_auto_link_creates_exact_match_type(self):
        invoice = self._create_invoice()
        InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель ВВГнг', quantity=Decimal('10'), unit='м',
            price_per_unit=Decimal('45'), amount=Decimal('450'),
        )
        self.checker.auto_link_invoice(invoice)
        link = EstimatePurchaseLink.objects.first()
        self.assertEqual(link.match_type, EstimatePurchaseLink.MatchType.EXACT)
        self.assertEqual(link.quantity_matched, Decimal('10'))
