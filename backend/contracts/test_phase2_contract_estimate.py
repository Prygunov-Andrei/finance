from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from datetime import date

from objects.models import Object
from accounting.models import Counterparty, LegalEntity, TaxSystem
from estimates.models import Estimate, EstimateSection, EstimateItem
from contracts.models import (
    Contract, ContractEstimate, ContractEstimateSection,
    ContractEstimateItem, ContractAmendment,
)


class Phase2TestMixin:
    """Общий setUp для тестов Фазы 2: ContractEstimate"""

    def _create_base_objects(self):
        self.user = User.objects.create_user(username='testuser', password='testpass')
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='Наша Фирма', short_name='НФ',
            inn='1111111111', tax_system=self.tax_system,
        )
        self.counterparty = Counterparty.objects.create(
            name='Заказчик Тест', short_name='ЗТ',
            inn='2222222222',
            type=Counterparty.Type.CUSTOMER,
            legal_form=Counterparty.LegalForm.OOO,
        )
        self.obj = Object.objects.create(name='Объект Фаза2', address='г. Москва')
        self.contract = Contract.objects.create(
            object=self.obj,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.INCOME,
            number='ДГ-002',
            name='Договор на сметы',
            contract_date=date.today(),
            total_amount=Decimal('1000000.00'),
            vat_rate=Decimal('20.00'),
        )

    def _create_source_estimate(self):
        """Создать исходную смету (estimates.Estimate) с разделами и строками"""
        self.estimate = Estimate.objects.create(
            number='СМ-TEST-001',
            name='Тестовая смета',
            object=self.obj,
            legal_entity=self.legal_entity,
            created_by=self.user,
        )
        self.est_section1 = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Электромонтаж',
            sort_order=0,
        )
        self.est_section2 = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Слаботочные системы',
            sort_order=1,
        )
        self.est_item1 = EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.est_section1,
            item_number=1,
            name='Кабель ВВГнг 3х2.5',
            unit='м',
            quantity=Decimal('100.000'),
            material_unit_price=Decimal('50.00'),
            work_unit_price=Decimal('30.00'),
            sort_order=0,
        )
        self.est_item2 = EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.est_section1,
            item_number=2,
            name='Розетка ABB Zena',
            unit='шт',
            quantity=Decimal('20.000'),
            material_unit_price=Decimal('200.00'),
            work_unit_price=Decimal('150.00'),
            sort_order=1,
        )
        self.est_item3 = EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.est_section2,
            item_number=3,
            name='Кабель UTP cat.6',
            unit='м',
            quantity=Decimal('500.000'),
            material_unit_price=Decimal('25.00'),
            work_unit_price=Decimal('15.00'),
            sort_order=0,
        )

    def _create_contract_estimate_manually(self):
        """Создать ContractEstimate вручную (без копирования из Estimate)"""
        self.ce = ContractEstimate.objects.create(
            contract=self.contract,
            number='СМД-001',
            name='Смета к договору тест',
            status='draft',
        )
        self.ce_section1 = ContractEstimateSection.objects.create(
            contract_estimate=self.ce,
            name='Электромонтаж',
            sort_order=0,
        )
        self.ce_section2 = ContractEstimateSection.objects.create(
            contract_estimate=self.ce,
            name='Слаботочные системы',
            sort_order=1,
        )
        self.ce_item1 = ContractEstimateItem.objects.create(
            contract_estimate=self.ce,
            section=self.ce_section1,
            item_number=1,
            name='Кабель ВВГнг 3х2.5',
            unit='м',
            quantity=Decimal('100'),
            material_unit_price=Decimal('50.00'),
            work_unit_price=Decimal('30.00'),
            sort_order=0,
        )
        self.ce_item2 = ContractEstimateItem.objects.create(
            contract_estimate=self.ce,
            section=self.ce_section1,
            item_number=2,
            name='Розетка ABB Zena',
            unit='шт',
            quantity=Decimal('20'),
            material_unit_price=Decimal('200.00'),
            work_unit_price=Decimal('150.00'),
            sort_order=1,
        )
        self.ce_item3 = ContractEstimateItem.objects.create(
            contract_estimate=self.ce,
            section=self.ce_section2,
            item_number=3,
            name='Кабель UTP cat.6',
            unit='м',
            quantity=Decimal('500'),
            material_unit_price=Decimal('25.00'),
            work_unit_price=Decimal('15.00'),
            sort_order=0,
        )


class CreateFromEstimateTests(Phase2TestMixin, TestCase):
    """Тесты ContractEstimate.create_from_estimate()"""

    def setUp(self):
        self._create_base_objects()
        self._create_source_estimate()

    def test_creates_contract_estimate(self):
        ce = ContractEstimate.create_from_estimate(self.estimate, self.contract)
        self.assertIsNotNone(ce.id)
        self.assertEqual(ce.contract, self.contract)
        self.assertEqual(ce.source_estimate, self.estimate)
        self.assertEqual(ce.number, self.estimate.number)
        self.assertEqual(ce.name, self.estimate.name)
        self.assertEqual(ce.status, ContractEstimate.Status.DRAFT)
        self.assertEqual(ce.version_number, 1)

    def test_copies_all_sections(self):
        ce = ContractEstimate.create_from_estimate(self.estimate, self.contract)
        sections = ce.sections.all().order_by('sort_order')
        self.assertEqual(sections.count(), 2)
        self.assertEqual(sections[0].name, 'Электромонтаж')
        self.assertEqual(sections[0].sort_order, 0)
        self.assertEqual(sections[1].name, 'Слаботочные системы')
        self.assertEqual(sections[1].sort_order, 1)

    def test_copies_all_items(self):
        ce = ContractEstimate.create_from_estimate(self.estimate, self.contract)
        self.assertEqual(ce.items.count(), 3)

    def test_items_linked_to_correct_sections(self):
        ce = ContractEstimate.create_from_estimate(self.estimate, self.contract)
        sections = ce.sections.all().order_by('sort_order')
        section1_items = sections[0].items.all()
        section2_items = sections[1].items.all()
        self.assertEqual(section1_items.count(), 2)
        self.assertEqual(section2_items.count(), 1)

    def test_source_item_linked(self):
        ce = ContractEstimate.create_from_estimate(self.estimate, self.contract)
        items = ce.items.all().order_by('item_number')
        self.assertEqual(items[0].source_item, self.est_item1)
        self.assertEqual(items[1].source_item, self.est_item2)
        self.assertEqual(items[2].source_item, self.est_item3)

    def test_item_data_copied_correctly(self):
        ce = ContractEstimate.create_from_estimate(self.estimate, self.contract)
        item = ce.items.filter(item_number=1).first()
        self.assertEqual(item.name, 'Кабель ВВГнг 3х2.5')
        self.assertEqual(item.unit, 'м')
        self.assertEqual(item.quantity, Decimal('100.000'))
        self.assertEqual(item.material_unit_price, Decimal('50.00'))
        self.assertEqual(item.work_unit_price, Decimal('30.00'))


class CreateNewVersionTests(Phase2TestMixin, TestCase):
    """Тесты ContractEstimate.create_new_version()"""

    def setUp(self):
        self._create_base_objects()
        self._create_contract_estimate_manually()

    def test_version_number_incremented(self):
        new_ce = self.ce.create_new_version()
        self.assertEqual(new_ce.version_number, 2)

    def test_parent_version_set(self):
        new_ce = self.ce.create_new_version()
        self.assertEqual(new_ce.parent_version, self.ce)

    def test_contract_preserved(self):
        new_ce = self.ce.create_new_version()
        self.assertEqual(new_ce.contract, self.contract)

    def test_number_and_name_preserved(self):
        new_ce = self.ce.create_new_version()
        self.assertEqual(new_ce.number, self.ce.number)
        self.assertEqual(new_ce.name, self.ce.name)

    def test_all_sections_copied(self):
        new_ce = self.ce.create_new_version()
        self.assertEqual(new_ce.sections.count(), 2)
        names = list(new_ce.sections.values_list('name', flat=True).order_by('sort_order'))
        self.assertEqual(names, ['Электромонтаж', 'Слаботочные системы'])

    def test_all_items_copied(self):
        new_ce = self.ce.create_new_version()
        self.assertEqual(new_ce.items.count(), 3)

    def test_items_independent_from_original(self):
        new_ce = self.ce.create_new_version()
        original_ids = set(self.ce.items.values_list('id', flat=True))
        new_ids = set(new_ce.items.values_list('id', flat=True))
        self.assertTrue(original_ids.isdisjoint(new_ids))

    def test_amendment_linked(self):
        amendment = ContractAmendment.objects.create(
            contract=self.contract,
            number='ДС-001',
            date=date.today(),
            reason='Изменение объёмов',
        )
        new_ce = self.ce.create_new_version(amendment=amendment)
        self.assertEqual(new_ce.amendment, amendment)

    def test_chain_versioning(self):
        v2 = self.ce.create_new_version()
        v3 = v2.create_new_version()
        self.assertEqual(v3.version_number, 3)
        self.assertEqual(v3.parent_version, v2)
        self.assertEqual(v3.parent_version.parent_version, self.ce)


class SplitBySectionsTests(Phase2TestMixin, TestCase):
    """Тесты ContractEstimate.split_by_sections()"""

    def setUp(self):
        self._create_base_objects()
        self._create_contract_estimate_manually()
        self.contract2 = Contract.objects.create(
            object=self.obj,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-003',
            name='Договор исполнитель 1',
            contract_date=date.today(),
            total_amount=Decimal('300000.00'),
            vat_rate=Decimal('20.00'),
        )
        self.contract3 = Contract.objects.create(
            object=self.obj,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-004',
            name='Договор исполнитель 2',
            contract_date=date.today(),
            total_amount=Decimal('200000.00'),
            vat_rate=Decimal('20.00'),
        )

    def test_split_creates_correct_count(self):
        mapping = {
            self.contract2.id: [self.ce_section1.id],
            self.contract3.id: [self.ce_section2.id],
        }
        result = self.ce.split_by_sections(mapping)
        self.assertEqual(len(result), 2)

    def test_split_assigns_correct_contracts(self):
        mapping = {
            self.contract2.id: [self.ce_section1.id],
            self.contract3.id: [self.ce_section2.id],
        }
        result = self.ce.split_by_sections(mapping)
        contracts_used = {ce.contract_id for ce in result}
        self.assertEqual(contracts_used, {self.contract2.id, self.contract3.id})

    def test_split_copies_correct_sections(self):
        mapping = {
            self.contract2.id: [self.ce_section1.id],
            self.contract3.id: [self.ce_section2.id],
        }
        result = self.ce.split_by_sections(mapping)

        ce_for_c2 = [ce for ce in result if ce.contract_id == self.contract2.id][0]
        ce_for_c3 = [ce for ce in result if ce.contract_id == self.contract3.id][0]

        self.assertEqual(ce_for_c2.sections.count(), 1)
        self.assertEqual(ce_for_c2.sections.first().name, 'Электромонтаж')
        self.assertEqual(ce_for_c3.sections.count(), 1)
        self.assertEqual(ce_for_c3.sections.first().name, 'Слаботочные системы')

    def test_split_copies_correct_items(self):
        mapping = {
            self.contract2.id: [self.ce_section1.id],
            self.contract3.id: [self.ce_section2.id],
        }
        result = self.ce.split_by_sections(mapping)

        ce_for_c2 = [ce for ce in result if ce.contract_id == self.contract2.id][0]
        ce_for_c3 = [ce for ce in result if ce.contract_id == self.contract3.id][0]

        self.assertEqual(ce_for_c2.items.count(), 2)
        self.assertEqual(ce_for_c3.items.count(), 1)
        self.assertEqual(ce_for_c3.items.first().name, 'Кабель UTP cat.6')

    def test_split_numbering(self):
        mapping = {
            self.contract2.id: [self.ce_section1.id],
            self.contract3.id: [self.ce_section2.id],
        }
        result = self.ce.split_by_sections(mapping)
        self.assertIn('-1', result[0].number)
        self.assertIn('-2', result[1].number)

    def test_split_preserves_source_estimate(self):
        self.ce.source_estimate = None
        self.ce.save(update_fields=['source_estimate'])
        mapping = {
            self.contract2.id: [self.ce_section1.id],
        }
        result = self.ce.split_by_sections(mapping)
        self.assertIsNone(result[0].source_estimate)


class ComputedPropertiesTests(Phase2TestMixin, TestCase):
    """Тесты вычисляемых свойств: total_materials, total_works, total_amount"""

    def setUp(self):
        self._create_base_objects()
        self._create_contract_estimate_manually()

    def test_total_materials(self):
        # item1: 100 * 50 = 5000, item2: 20 * 200 = 4000, item3: 500 * 25 = 12500
        expected = Decimal('5000') + Decimal('4000') + Decimal('12500')
        self.assertEqual(self.ce.total_materials, expected)

    def test_total_works(self):
        # item1: 100 * 30 = 3000, item2: 20 * 150 = 3000, item3: 500 * 15 = 7500
        expected = Decimal('3000') + Decimal('3000') + Decimal('7500')
        self.assertEqual(self.ce.total_works, expected)

    def test_total_amount(self):
        expected_materials = Decimal('21500')
        expected_works = Decimal('13500')
        self.assertEqual(self.ce.total_amount, expected_materials + expected_works)

    def test_empty_estimate_totals_zero(self):
        empty_ce = ContractEstimate.objects.create(
            contract=self.contract,
            number='СМД-EMPTY',
            name='Пустая смета',
        )
        self.assertEqual(empty_ce.total_materials, Decimal('0'))
        self.assertEqual(empty_ce.total_works, Decimal('0'))
        self.assertEqual(empty_ce.total_amount, Decimal('0'))


class StatusFieldTests(Phase2TestMixin, TestCase):
    """Тесты поля status у ContractEstimate"""

    def setUp(self):
        self._create_base_objects()

    def test_default_status_draft(self):
        ce = ContractEstimate.objects.create(
            contract=self.contract,
            number='СМД-S1',
            name='Статус тест',
        )
        self.assertEqual(ce.status, ContractEstimate.Status.DRAFT)

    def test_status_agreed(self):
        ce = ContractEstimate.objects.create(
            contract=self.contract,
            number='СМД-S2',
            name='Статус тест 2',
            status=ContractEstimate.Status.AGREED,
        )
        ce.refresh_from_db()
        self.assertEqual(ce.status, 'agreed')

    def test_status_signed(self):
        ce = ContractEstimate.objects.create(
            contract=self.contract,
            number='СМД-S3',
            name='Статус тест 3',
            status=ContractEstimate.Status.SIGNED,
            signed_date=date.today(),
        )
        ce.refresh_from_db()
        self.assertEqual(ce.status, 'signed')


class ContractEstimateAPITests(Phase2TestMixin, TestCase):
    """Тесты API-эндпоинтов ContractEstimate"""

    def setUp(self):
        self._create_base_objects()
        self._create_source_estimate()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_from_estimate_endpoint(self):
        response = self.client.post(
            '/api/v1/contract-estimates/from-estimate/',
            {'estimate_id': self.estimate.id, 'contract_id': self.contract.id},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['number'], self.estimate.number)
        self.assertEqual(response.data['source_estimate'], self.estimate.id)
        self.assertEqual(len(response.data['sections']), 2)

    def test_from_estimate_missing_params(self):
        response = self.client.post(
            '/api/v1/contract-estimates/from-estimate/',
            {},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_from_estimate_invalid_ids(self):
        response = self.client.post(
            '/api/v1/contract-estimates/from-estimate/',
            {'estimate_id': 99999, 'contract_id': 99999},
            format='json',
        )
        self.assertEqual(response.status_code, 404)

    def test_create_version_endpoint(self):
        ce = ContractEstimate.create_from_estimate(self.estimate, self.contract)
        response = self.client.post(
            f'/api/v1/contract-estimates/{ce.id}/create-version/',
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['version_number'], 2)
        self.assertEqual(response.data['parent_version'], ce.id)

    def test_create_version_with_amendment(self):
        ce = ContractEstimate.create_from_estimate(self.estimate, self.contract)
        amendment = ContractAmendment.objects.create(
            contract=self.contract,
            number='ДС-API-001',
            date=date.today(),
            reason='Тестовое ДОП',
        )
        response = self.client.post(
            f'/api/v1/contract-estimates/{ce.id}/create-version/',
            {'amendment_id': amendment.id},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['amendment'], amendment.id)

    def test_split_endpoint(self):
        ce = ContractEstimate.create_from_estimate(self.estimate, self.contract)
        contract2 = Contract.objects.create(
            object=self.obj,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-API-002',
            name='Исполнитель API',
            contract_date=date.today(),
            total_amount=Decimal('200000.00'),
            vat_rate=Decimal('20.00'),
        )
        section_ids = list(ce.sections.values_list('id', flat=True))
        response = self.client.post(
            f'/api/v1/contract-estimates/{ce.id}/split/',
            {'sections_mapping': {str(contract2.id): section_ids}},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['contract'], contract2.id)

    def test_split_empty_mapping(self):
        ce = ContractEstimate.create_from_estimate(self.estimate, self.contract)
        response = self.client.post(
            f'/api/v1/contract-estimates/{ce.id}/split/',
            {'sections_mapping': {}},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_serializer_includes_totals(self):
        ce = ContractEstimate.create_from_estimate(self.estimate, self.contract)
        response = self.client.get(f'/api/v1/contract-estimates/{ce.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('total_materials', response.data)
        self.assertIn('total_works', response.data)
        self.assertIn('total_amount', response.data)
        self.assertGreater(Decimal(response.data['total_amount']), Decimal('0'))

    def test_list_filtered_by_contract(self):
        ContractEstimate.create_from_estimate(self.estimate, self.contract)
        response = self.client.get(
            f'/api/v1/contract-estimates/?contract={self.contract.id}',
        )
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data['count'], 1)
