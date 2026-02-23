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
from contracts.services.accumulative_estimate import AccumulativeEstimateService


class Phase5TestMixin:
    """Общий setUp для тестов Фазы 5: AccumulativeEstimateService"""

    def _create_base(self):
        self.user = User.objects.create_user(username='testuser5', password='pass')
        self.tax_system = TaxSystem.objects.create(code='osn5', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='Фирма Phase5', short_name='ФП5',
            inn='6666666666', tax_system=self.tax_system,
        )
        self.counterparty = Counterparty.objects.create(
            name='Заказчик P5', short_name='ЗП5',
            inn='7777777777',
            type=Counterparty.Type.CUSTOMER,
            legal_form=Counterparty.LegalForm.OOO,
        )
        self.obj = Object.objects.create(name='Объект P5', address='Москва')
        self.contract = Contract.objects.create(
            object=self.obj,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.INCOME,
            number='ДГ-P5',
            name='Договор Phase5',
            contract_date=date.today(),
            total_amount=Decimal('500000'),
            vat_rate=Decimal('20.00'),
        )
        self.product1 = Product.objects.create(name='Кабель ВВГнг 3х1.5')
        self.product2 = Product.objects.create(name='Автомат ABB 16A')

    def _create_contract_estimate_with_items(self):
        self.ce = ContractEstimate.objects.create(
            contract=self.contract,
            number='СМД-P5-001',
            name='Смета Phase5',
            status=ContractEstimate.Status.SIGNED,
            signed_date=date.today(),
        )
        self.section1 = ContractEstimateSection.objects.create(
            contract_estimate=self.ce, name='Электрика', sort_order=0,
        )
        self.section2 = ContractEstimateSection.objects.create(
            contract_estimate=self.ce, name='Автоматика', sort_order=1,
        )
        self.cei1 = ContractEstimateItem.objects.create(
            contract_estimate=self.ce, section=self.section1,
            item_number=1, name='Кабель ВВГнг 3х1.5', unit='м',
            quantity=Decimal('200'), material_unit_price=Decimal('40.00'),
            work_unit_price=Decimal('20.00'), product=self.product1, sort_order=0,
        )
        self.cei2 = ContractEstimateItem.objects.create(
            contract_estimate=self.ce, section=self.section2,
            item_number=2, name='Автомат ABB 16A', unit='шт',
            quantity=Decimal('10'), material_unit_price=Decimal('500.00'),
            work_unit_price=Decimal('200.00'), product=self.product2, sort_order=0,
        )

    def _create_purchase_links(self):
        """Создаёт счёт с позициями и привязывает к смете"""
        invoice = Invoice.objects.create(
            invoice_type=Invoice.InvoiceType.SUPPLIER,
            source=Invoice.Source.MANUAL,
            status=Invoice.Status.PAID,
            contract=self.contract,
            amount_gross=Decimal('10000'),
        )
        inv_item1 = InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель ВВГнг 3х1.5', quantity=Decimal('80'),
            unit='м', price_per_unit=Decimal('42.00'), amount=Decimal('3360'),
        )
        inv_item2 = InvoiceItem.objects.create(
            invoice=invoice, product=self.product2,
            raw_name='Автомат ABB S201 C16', quantity=Decimal('3'),
            unit='шт', price_per_unit=Decimal('480.00'), amount=Decimal('1440'),
        )
        EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1,
            invoice_item=inv_item1,
            quantity_matched=Decimal('80'),
            match_type=EstimatePurchaseLink.MatchType.EXACT,
        )
        EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei2,
            invoice_item=inv_item2,
            quantity_matched=Decimal('3'),
            match_type=EstimatePurchaseLink.MatchType.EXACT,
        )
        return invoice


class AccumulativeEstimateTests(Phase5TestMixin, TestCase):
    """Тесты AccumulativeEstimateService.get_accumulative()"""

    def setUp(self):
        self._create_base()
        self._create_contract_estimate_with_items()

    def test_accumulative_without_purchases(self):
        result = AccumulativeEstimateService.get_accumulative(self.ce.id)
        self.assertEqual(len(result), 2)
        self.assertEqual(Decimal(result[0]['purchased_quantity']), Decimal('0'))
        self.assertEqual(Decimal(result[0]['purchased_amount']), Decimal('0'))
        self.assertEqual(Decimal(result[0]['remaining_quantity']), Decimal('200'))

    def test_accumulative_with_purchases(self):
        self._create_purchase_links()
        result = AccumulativeEstimateService.get_accumulative(self.ce.id)

        cable_row = next(r for r in result if r['name'] == 'Кабель ВВГнг 3х1.5')
        self.assertEqual(Decimal(cable_row['purchased_quantity']), Decimal('80'))
        self.assertEqual(Decimal(cable_row['purchased_amount']), Decimal('3360'))
        self.assertEqual(Decimal(cable_row['remaining_quantity']), Decimal('120'))

        auto_row = next(r for r in result if r['name'] == 'Автомат ABB 16A')
        self.assertEqual(Decimal(auto_row['purchased_quantity']), Decimal('3'))
        self.assertEqual(Decimal(auto_row['purchased_amount']), Decimal('1440'))
        self.assertEqual(Decimal(auto_row['remaining_quantity']), Decimal('7'))

    def test_accumulative_includes_estimate_data(self):
        result = AccumulativeEstimateService.get_accumulative(self.ce.id)
        cable = result[0]
        self.assertEqual(Decimal(cable['estimate_quantity']), Decimal('200'))
        self.assertEqual(Decimal(cable['estimate_material_price']), Decimal('40.00'))
        self.assertEqual(Decimal(cable['estimate_work_price']), Decimal('20.00'))
        self.assertEqual(cable['unit'], 'м')
        self.assertEqual(cable['item_number'], 1)

    def test_accumulative_section_names(self):
        result = AccumulativeEstimateService.get_accumulative(self.ce.id)
        self.assertEqual(result[0]['section_name'], 'Электрика')
        self.assertEqual(result[1]['section_name'], 'Автоматика')

    def test_accumulative_ordering(self):
        result = AccumulativeEstimateService.get_accumulative(self.ce.id)
        self.assertEqual(result[0]['name'], 'Кабель ВВГнг 3х1.5')
        self.assertEqual(result[1]['name'], 'Автомат ABB 16A')

    def test_accumulative_empty_estimate(self):
        empty_ce = ContractEstimate.objects.create(
            contract=self.contract, number='СМД-EMPTY',
            name='Пустая', status=ContractEstimate.Status.SIGNED,
        )
        result = AccumulativeEstimateService.get_accumulative(empty_ce.id)
        self.assertEqual(len(result), 0)


class RemainderTests(Phase5TestMixin, TestCase):
    """Тесты AccumulativeEstimateService.get_remainder()"""

    def setUp(self):
        self._create_base()
        self._create_contract_estimate_with_items()

    def test_remainder_no_purchases(self):
        result = AccumulativeEstimateService.get_remainder(self.ce.id)
        self.assertEqual(len(result), 2)
        cable = next(r for r in result if r['name'] == 'Кабель ВВГнг 3х1.5')
        self.assertEqual(Decimal(cable['remaining_quantity']), Decimal('200'))

    def test_remainder_with_partial_purchase(self):
        self._create_purchase_links()
        result = AccumulativeEstimateService.get_remainder(self.ce.id)

        cable = next(r for r in result if r['name'] == 'Кабель ВВГнг 3х1.5')
        self.assertEqual(Decimal(cable['remaining_quantity']), Decimal('120'))
        self.assertEqual(Decimal(cable['purchased_quantity']), Decimal('80'))

    def test_remainder_excludes_fully_purchased(self):
        """Полностью закупленные позиции не отображаются в остатках"""
        invoice = Invoice.objects.create(
            invoice_type=Invoice.InvoiceType.SUPPLIER,
            source=Invoice.Source.MANUAL,
            status=Invoice.Status.PAID,
            contract=self.contract,
            amount_gross=Decimal('5000'),
        )
        inv_item = InvoiceItem.objects.create(
            invoice=invoice, product=self.product2,
            raw_name='Автомат ABB 16A', quantity=Decimal('10'),
            unit='шт', price_per_unit=Decimal('500'), amount=Decimal('5000'),
        )
        EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei2,
            invoice_item=inv_item,
            quantity_matched=Decimal('10'),
        )
        result = AccumulativeEstimateService.get_remainder(self.ce.id)
        names = [r['name'] for r in result]
        self.assertNotIn('Автомат ABB 16A', names)
        self.assertIn('Кабель ВВГнг 3х1.5', names)

    def test_remainder_material_total_calculated(self):
        self._create_purchase_links()
        result = AccumulativeEstimateService.get_remainder(self.ce.id)
        cable = next(r for r in result if r['name'] == 'Кабель ВВГнг 3х1.5')
        expected = Decimal('120') * Decimal('40.00')
        self.assertEqual(
            Decimal(cable['remaining_material_total']),
            expected.quantize(Decimal('0.01')),
        )


class DeviationsTests(Phase5TestMixin, TestCase):
    """Тесты AccumulativeEstimateService.get_deviations()"""

    def setUp(self):
        self._create_base()
        self._create_contract_estimate_with_items()

    def test_no_deviations(self):
        """Без превышений и аналогов — отклонений нет"""
        invoice = Invoice.objects.create(
            invoice_type=Invoice.InvoiceType.SUPPLIER,
            source=Invoice.Source.MANUAL,
            status=Invoice.Status.PAID,
            contract=self.contract,
            amount_gross=Decimal('4000'),
        )
        inv_item1 = InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель ВВГнг 3х1.5', quantity=Decimal('50'),
            unit='м', price_per_unit=Decimal('35.00'), amount=Decimal('1750'),
        )
        inv_item2 = InvoiceItem.objects.create(
            invoice=invoice, product=self.product2,
            raw_name='Автомат ABB 16A', quantity=Decimal('3'),
            unit='шт', price_per_unit=Decimal('450.00'), amount=Decimal('1350'),
        )
        EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1, invoice_item=inv_item1,
            quantity_matched=Decimal('50'), match_type=EstimatePurchaseLink.MatchType.EXACT,
        )
        EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei2, invoice_item=inv_item2,
            quantity_matched=Decimal('3'), match_type=EstimatePurchaseLink.MatchType.EXACT,
        )
        result = AccumulativeEstimateService.get_deviations(self.ce.id)
        self.assertEqual(len(result), 0)

    def test_analog_deviation(self):
        invoice = Invoice.objects.create(
            invoice_type=Invoice.InvoiceType.SUPPLIER,
            source=Invoice.Source.MANUAL,
            status=Invoice.Status.PAID,
            contract=self.contract,
            amount_gross=Decimal('3500'),
        )
        inv_item = InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель NYM 3х1.5 (аналог)', quantity=Decimal('50'),
            unit='м', price_per_unit=Decimal('45'), amount=Decimal('2250'),
        )
        EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1,
            invoice_item=inv_item,
            quantity_matched=Decimal('50'),
            match_type=EstimatePurchaseLink.MatchType.ANALOG,
            match_reason='Замена на NYM по ТУ',
        )
        result = AccumulativeEstimateService.get_deviations(self.ce.id)
        analog_devs = [r for r in result if r['match_type'] == 'analog']
        self.assertEqual(len(analog_devs), 1)
        self.assertEqual(analog_devs[0]['match_reason'], 'Замена на NYM по ТУ')

    def test_price_exceed_deviation(self):
        invoice = Invoice.objects.create(
            invoice_type=Invoice.InvoiceType.SUPPLIER,
            source=Invoice.Source.MANUAL,
            status=Invoice.Status.PAID,
            contract=self.contract,
            amount_gross=Decimal('5000'),
        )
        inv_item = InvoiceItem.objects.create(
            invoice=invoice, product=self.product1,
            raw_name='Кабель ВВГнг 3х1.5', quantity=Decimal('50'),
            unit='м', price_per_unit=Decimal('60'), amount=Decimal('3000'),
        )
        EstimatePurchaseLink.objects.create(
            contract_estimate_item=self.cei1,
            invoice_item=inv_item,
            quantity_matched=Decimal('50'),
            match_type=EstimatePurchaseLink.MatchType.EXACT,
        )
        result = AccumulativeEstimateService.get_deviations(self.ce.id)
        price_devs = [r for r in result if r.get('price_exceeds')]
        self.assertEqual(len(price_devs), 1)

    def test_additional_items_in_deviations(self):
        ContractEstimateItem.objects.create(
            contract_estimate=self.ce, section=self.section1,
            item_number=99, name='Расходные материалы', unit='компл',
            quantity=Decimal('1'), material_unit_price=Decimal('10000'),
            work_unit_price=Decimal('0'), item_type='consumable', sort_order=99,
        )
        ContractEstimateItem.objects.create(
            contract_estimate=self.ce, section=self.section1,
            item_number=100, name='Допработы по кабеленесущим', unit='компл',
            quantity=Decimal('1'), material_unit_price=Decimal('5000'),
            work_unit_price=Decimal('3000'), item_type='additional', sort_order=100,
        )
        result = AccumulativeEstimateService.get_deviations(self.ce.id)
        additional = [r for r in result if r['match_type'] == 'additional']
        self.assertEqual(len(additional), 2)


class ExportDataTests(Phase5TestMixin, TestCase):
    """Тесты AccumulativeEstimateService.export_accumulative_data()"""

    def setUp(self):
        self._create_base()
        self._create_contract_estimate_with_items()

    def test_export_returns_same_as_accumulative(self):
        self._create_purchase_links()
        acc = AccumulativeEstimateService.get_accumulative(self.ce.id)
        exp = AccumulativeEstimateService.export_accumulative_data(self.ce.id)
        self.assertEqual(acc, exp)

    def test_export_empty(self):
        empty_ce = ContractEstimate.objects.create(
            contract=self.contract, number='СМД-EXP-E',
            name='Пустая экспорт', status=ContractEstimate.Status.SIGNED,
        )
        result = AccumulativeEstimateService.export_accumulative_data(empty_ce.id)
        self.assertEqual(len(result), 0)


class AccumulativeEstimateAPITests(Phase5TestMixin, TestCase):
    """Тесты API-эндпоинтов накопительной сметы"""

    def setUp(self):
        self._create_base()
        self._create_contract_estimate_with_items()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_accumulative_endpoint(self):
        self._create_purchase_links()
        response = self.client.get(
            f'/api/v1/contracts/{self.contract.id}/accumulative-estimate/',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_remainder_endpoint(self):
        self._create_purchase_links()
        response = self.client.get(
            f'/api/v1/contracts/{self.contract.id}/estimate-remainder/',
        )
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data), 1)

    def test_deviations_endpoint(self):
        response = self.client.get(
            f'/api/v1/contracts/{self.contract.id}/estimate-deviations/',
        )
        self.assertEqual(response.status_code, 200)

    def test_no_signed_estimate_returns_404(self):
        self.ce.status = ContractEstimate.Status.DRAFT
        self.ce.save()
        response = self.client.get(
            f'/api/v1/contracts/{self.contract.id}/accumulative-estimate/',
        )
        self.assertEqual(response.status_code, 404)
