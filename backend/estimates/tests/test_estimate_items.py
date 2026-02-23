from decimal import Decimal

from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from django.db import IntegrityError
from rest_framework.test import APITestCase, APIClient
from rest_framework import status

from accounting.models import TaxSystem, LegalEntity
from objects.models import Object
from estimates.models import (
    Estimate, EstimateSection, EstimateSubsection, EstimateItem,
)
from catalog.models import Product, Category, ProductWorkMapping
from pricelists.models import WorkerGrade, WorkSection, WorkItem


class EstimateItemModelTestMixin:
    """Общий setUp для тестов EstimateItem."""

    def _create_base_objects(self):
        self.user = User.objects.create_user('testuser', password='testpass')
        self.tax_system = TaxSystem.objects.create(
            code='osn_20', name='ОСН 20%', vat_rate=Decimal('20.00'), has_vat=True,
        )
        self.legal_entity = LegalEntity.objects.create(
            name='ООО Тест', short_name='Тест', inn='1234567890',
            tax_system=self.tax_system,
        )
        self.obj = Object.objects.create(name='Объект-1', address='ул. Тестовая, 1')
        self.estimate = Estimate.objects.create(
            name='Смета-1', object=self.obj,
            legal_entity=self.legal_entity, created_by=self.user,
        )
        self.section = EstimateSection.objects.create(
            estimate=self.estimate, name='Раздел-1',
        )
        self.subsection = EstimateSubsection.objects.create(
            section=self.section, name='Подраздел-1',
        )

        self.category = Category.objects.create(name='Вентиляция', code='vent')
        self.product = Product.objects.create(name='Вентилятор ВКР-100')
        self.grade = WorkerGrade.objects.create(
            grade=3, name='Монтажник 3 разряда',
            default_hourly_rate=Decimal('500.00'),
        )
        self.work_section = WorkSection.objects.create(code='VENT', name='Вентиляция')
        self.work_item = WorkItem.objects.create(
            article='V-001', section=self.work_section,
            name='Монтаж вентилятора', unit='шт', grade=self.grade,
        )


# ---------------------------------------------------------------------------
#  EstimateItem — model tests
# ---------------------------------------------------------------------------
class EstimateItemModelTests(EstimateItemModelTestMixin, TestCase):

    def setUp(self):
        self._create_base_objects()

    # -- creation --
    def test_create_with_all_fields(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.section,
            subsection=self.subsection,
            sort_order=1,
            item_number=1,
            name='Вентилятор ВКР-100',
            model_name='ВКР-100',
            unit='шт',
            quantity=Decimal('10.000'),
            material_unit_price=Decimal('5000.00'),
            work_unit_price=Decimal('1500.00'),
            product=self.product,
            work_item=self.work_item,
            is_analog=False,
        )
        self.assertEqual(item.name, 'Вентилятор ВКР-100')
        self.assertEqual(item.quantity, Decimal('10.000'))
        self.assertEqual(item.product, self.product)
        self.assertEqual(item.work_item, self.work_item)
        self.assertIsNotNone(item.created_at)

    def test_create_minimal(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.section,
            name='Позиция без подраздела',
        )
        self.assertIsNone(item.subsection)
        self.assertEqual(item.quantity, Decimal('0'))
        self.assertEqual(item.material_unit_price, Decimal('0'))

    # -- validation: analog --
    def test_is_analog_requires_reason(self):
        with self.assertRaises(ValidationError) as ctx:
            EstimateItem.objects.create(
                estimate=self.estimate,
                section=self.section,
                name='Аналог',
                is_analog=True,
                analog_reason='',
            )
        self.assertIn('analog_reason', ctx.exception.message_dict)

    def test_is_analog_with_reason_ok(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.section,
            name='Аналог',
            is_analog=True,
            analog_reason='Замена по согласованию с заказчиком',
        )
        self.assertTrue(item.is_analog)

    # -- validation: subsection belongs to section --
    def test_subsection_must_belong_to_section(self):
        other_section = EstimateSection.objects.create(
            estimate=self.estimate, name='Раздел-2',
        )
        other_sub = EstimateSubsection.objects.create(
            section=other_section, name='Подраздел-другой',
        )
        with self.assertRaises(ValidationError) as ctx:
            EstimateItem.objects.create(
                estimate=self.estimate,
                section=self.section,
                subsection=other_sub,
                name='Позиция',
            )
        self.assertIn('subsection', ctx.exception.message_dict)

    def test_subsection_same_section_ok(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.section,
            subsection=self.subsection,
            name='Позиция',
        )
        self.assertEqual(item.subsection, self.subsection)

    # -- computed properties --
    def test_material_total(self):
        item = EstimateItem(
            quantity=Decimal('5.000'),
            material_unit_price=Decimal('1234.56'),
            work_unit_price=Decimal('0'),
        )
        self.assertEqual(item.material_total, Decimal('6172.80'))

    def test_work_total(self):
        item = EstimateItem(
            quantity=Decimal('3.000'),
            material_unit_price=Decimal('0'),
            work_unit_price=Decimal('2000.00'),
        )
        self.assertEqual(item.work_total, Decimal('6000.00'))

    def test_line_total(self):
        item = EstimateItem(
            quantity=Decimal('2.000'),
            material_unit_price=Decimal('1000.00'),
            work_unit_price=Decimal('500.00'),
        )
        self.assertEqual(item.line_total, Decimal('3000.00'))

    def test_line_total_zero_quantity(self):
        item = EstimateItem(
            quantity=Decimal('0'),
            material_unit_price=Decimal('999.99'),
            work_unit_price=Decimal('100.00'),
        )
        self.assertEqual(item.line_total, Decimal('0.00'))

    # -- signal: recalculate subsection aggregates --
    def test_signal_updates_subsection_on_create(self):
        EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.section,
            subsection=self.subsection,
            name='Позиция-1',
            quantity=Decimal('10.000'),
            material_unit_price=Decimal('100.00'),
            work_unit_price=Decimal('50.00'),
        )
        self.subsection.refresh_from_db()
        self.assertEqual(self.subsection.materials_sale, Decimal('1000.00'))
        self.assertEqual(self.subsection.works_sale, Decimal('500.00'))

    def test_signal_updates_subsection_on_save(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.section,
            subsection=self.subsection,
            name='Позиция-1',
            quantity=Decimal('2.000'),
            material_unit_price=Decimal('100.00'),
            work_unit_price=Decimal('50.00'),
        )
        item.quantity = Decimal('5.000')
        item.save()
        self.subsection.refresh_from_db()
        self.assertEqual(self.subsection.materials_sale, Decimal('500.00'))
        self.assertEqual(self.subsection.works_sale, Decimal('250.00'))

    def test_signal_updates_subsection_on_delete(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.section,
            subsection=self.subsection,
            name='Позиция-1',
            quantity=Decimal('4.000'),
            material_unit_price=Decimal('200.00'),
            work_unit_price=Decimal('100.00'),
        )
        item.delete()
        self.subsection.refresh_from_db()
        self.assertEqual(self.subsection.materials_sale, Decimal('0'))
        self.assertEqual(self.subsection.works_sale, Decimal('0'))

    def test_signal_multiple_items_aggregate(self):
        EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.section,
            subsection=self.subsection,
            name='A',
            quantity=Decimal('2.000'),
            material_unit_price=Decimal('100.00'),
            work_unit_price=Decimal('50.00'),
        )
        EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.section,
            subsection=self.subsection,
            name='B',
            quantity=Decimal('3.000'),
            material_unit_price=Decimal('200.00'),
            work_unit_price=Decimal('80.00'),
        )
        self.subsection.refresh_from_db()
        self.assertEqual(
            self.subsection.materials_sale,
            Decimal('200.00') + Decimal('600.00'),
        )
        self.assertEqual(
            self.subsection.works_sale,
            Decimal('100.00') + Decimal('240.00'),
        )

    def test_signal_no_subsection_no_crash(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.section,
            subsection=None,
            name='Без подраздела',
            quantity=Decimal('1.000'),
            material_unit_price=Decimal('100.00'),
            work_unit_price=Decimal('50.00'),
        )
        item.delete()

    # -- str --
    def test_str(self):
        item = EstimateItem(item_number=5, name='Кабель ВВГнг 3×2.5')
        self.assertEqual(str(item), '#5 Кабель ВВГнг 3×2.5')


# ---------------------------------------------------------------------------
#  EstimateItem — API tests
# ---------------------------------------------------------------------------
class EstimateItemAPITests(EstimateItemModelTestMixin, APITestCase):

    def setUp(self):
        self._create_base_objects()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.list_url = '/api/v1/estimate-items/'

    def _item_payload(self, **overrides):
        data = {
            'estimate': self.estimate.pk,
            'section': self.section.pk,
            'name': 'Позиция API',
            'unit': 'шт',
            'quantity': '1.000',
            'material_unit_price': '100.00',
            'work_unit_price': '50.00',
        }
        data.update(overrides)
        return data

    # -- CRUD --
    def test_create(self):
        resp = self.client.post(self.list_url, self._item_payload(), format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['name'], 'Позиция API')
        self.assertEqual(resp.data['material_total'], '100.00')

    def test_list(self):
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section, name='A',
        )
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section, name='B',
        )
        resp = self.client.get(self.list_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(resp.data), 2)

    def test_retrieve(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            name='Деталь', quantity=Decimal('3.000'),
            material_unit_price=Decimal('200.00'),
            work_unit_price=Decimal('100.00'),
        )
        resp = self.client.get(f'{self.list_url}{item.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['line_total'], '900.00')

    def test_update_put(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.section, name='Старое',
        )
        payload = self._item_payload(name='Новое', quantity='5.000')
        resp = self.client.put(f'{self.list_url}{item.pk}/', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['name'], 'Новое')

    def test_update_patch(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.section, name='Orig',
            quantity=Decimal('1.000'), material_unit_price=Decimal('100.00'),
        )
        resp = self.client.patch(
            f'{self.list_url}{item.pk}/',
            {'name': 'Patched'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['name'], 'Patched')

    def test_delete(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.section, name='Del',
        )
        resp = self.client.delete(f'{self.list_url}{item.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(EstimateItem.objects.filter(pk=item.pk).exists())

    # -- validation via API --
    def test_api_analog_without_reason_rejected(self):
        payload = self._item_payload(is_analog=True, analog_reason='')
        resp = self.client.post(self.list_url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('analog_reason', resp.data)

    def test_api_subsection_wrong_section_rejected(self):
        other_section = EstimateSection.objects.create(
            estimate=self.estimate, name='Другой раздел',
        )
        other_sub = EstimateSubsection.objects.create(
            section=other_section, name='Чужой подраздел',
        )
        payload = self._item_payload(
            section=self.section.pk,
            subsection=other_sub.pk,
        )
        resp = self.client.post(self.list_url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('subsection', resp.data)

    # -- bulk create --
    def test_bulk_create(self):
        url = f'{self.list_url}bulk-create/'
        payload = {
            'items': [
                self._item_payload(name='Bulk-1', item_number=1),
                self._item_payload(name='Bulk-2', item_number=2),
                self._item_payload(name='Bulk-3', item_number=3),
            ],
        }
        resp = self.client.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(resp.data), 3)
        self.assertEqual(EstimateItem.objects.count(), 3)

    def test_bulk_create_empty_list(self):
        url = f'{self.list_url}bulk-create/'
        resp = self.client.post(url, {'items': []}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(resp.data), 0)

    # -- filtering --
    def test_filter_by_estimate(self):
        est2 = Estimate.objects.create(
            name='Смета-2', object=self.obj,
            legal_entity=self.legal_entity, created_by=self.user,
        )
        sec2 = EstimateSection.objects.create(estimate=est2, name='Р2')
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section, name='A',
        )
        EstimateItem.objects.create(
            estimate=est2, section=sec2, name='B',
        )
        resp = self.client.get(self.list_url, {'estimate': self.estimate.pk})
        results = resp.data if isinstance(resp.data, list) else resp.data.get('results', resp.data)
        names = [r['name'] for r in results]
        self.assertIn('A', names)
        self.assertNotIn('B', names)

    def test_filter_by_section(self):
        sec2 = EstimateSection.objects.create(
            estimate=self.estimate, name='Раздел-2',
        )
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section, name='A',
        )
        EstimateItem.objects.create(
            estimate=self.estimate, section=sec2, name='B',
        )
        resp = self.client.get(self.list_url, {'section': self.section.pk})
        results = resp.data if isinstance(resp.data, list) else resp.data.get('results', resp.data)
        names = [r['name'] for r in results]
        self.assertIn('A', names)
        self.assertNotIn('B', names)

    def test_filter_by_subsection(self):
        sub2 = EstimateSubsection.objects.create(
            section=self.section, name='Подраздел-2',
        )
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            subsection=self.subsection, name='A',
        )
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            subsection=sub2, name='B',
        )
        resp = self.client.get(self.list_url, {'subsection': self.subsection.pk})
        results = resp.data if isinstance(resp.data, list) else resp.data.get('results', resp.data)
        names = [r['name'] for r in results]
        self.assertIn('A', names)
        self.assertNotIn('B', names)

    def test_filter_by_product(self):
        other_product = Product.objects.create(name='Другой товар')
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            name='A', product=self.product,
        )
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            name='B', product=other_product,
        )
        resp = self.client.get(self.list_url, {'product': self.product.pk})
        results = resp.data if isinstance(resp.data, list) else resp.data.get('results', resp.data)
        names = [r['name'] for r in results]
        self.assertIn('A', names)
        self.assertNotIn('B', names)

    def test_filter_by_is_analog(self):
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            name='Обычный', is_analog=False,
        )
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            name='Аналог', is_analog=True,
            analog_reason='Обоснование',
        )
        resp = self.client.get(self.list_url, {'is_analog': 'true'})
        results = resp.data if isinstance(resp.data, list) else resp.data.get('results', resp.data)
        names = [r['name'] for r in results]
        self.assertIn('Аналог', names)
        self.assertNotIn('Обычный', names)

    # -- search --
    def test_search_by_name(self):
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            name='Кабель ВВГнг 3×2.5',
        )
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            name='Автомат ABB',
        )
        resp = self.client.get(self.list_url, {'search': 'Кабель'})
        results = resp.data if isinstance(resp.data, list) else resp.data.get('results', resp.data)
        names = [r['name'] for r in results]
        self.assertIn('Кабель ВВГнг 3×2.5', names)
        self.assertNotIn('Автомат ABB', names)

    def test_search_by_model_name(self):
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            name='Вентилятор', model_name='VKR-100',
        )
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            name='Другой', model_name='XYZ-999',
        )
        resp = self.client.get(self.list_url, {'search': 'VKR'})
        results = resp.data if isinstance(resp.data, list) else resp.data.get('results', resp.data)
        model_names = [r['model_name'] for r in results]
        self.assertIn('VKR-100', model_names)
        self.assertNotIn('XYZ-999', model_names)

    # -- computed fields in response --
    def test_response_includes_computed_fields(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate,
            section=self.section,
            name='Тест',
            quantity=Decimal('4.000'),
            material_unit_price=Decimal('250.00'),
            work_unit_price=Decimal('150.00'),
        )
        resp = self.client.get(f'{self.list_url}{item.pk}/')
        self.assertEqual(resp.data['material_total'], '1000.00')
        self.assertEqual(resp.data['work_total'], '600.00')
        self.assertEqual(resp.data['line_total'], '1600.00')

    # -- unauthenticated access --
    def test_unauthenticated_forbidden(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(self.list_url)
        self.assertIn(resp.status_code, (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ))


# ---------------------------------------------------------------------------
#  ProductWorkMapping — model tests
# ---------------------------------------------------------------------------
class ProductWorkMappingModelTests(EstimateItemModelTestMixin, TestCase):

    def setUp(self):
        self._create_base_objects()

    def test_create_with_all_fields(self):
        mapping = ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item,
            confidence=0.95,
            source=ProductWorkMapping.Source.MANUAL,
            usage_count=5,
        )
        self.assertEqual(mapping.product, self.product)
        self.assertEqual(mapping.work_item, self.work_item)
        self.assertEqual(mapping.confidence, 0.95)
        self.assertEqual(mapping.usage_count, 5)
        self.assertIsNotNone(mapping.created_at)

    def test_create_defaults(self):
        mapping = ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item,
        )
        self.assertEqual(mapping.confidence, 1.0)
        self.assertEqual(mapping.source, ProductWorkMapping.Source.MANUAL)
        self.assertEqual(mapping.usage_count, 1)

    def test_unique_together_product_work_item(self):
        ProductWorkMapping.objects.create(
            product=self.product, work_item=self.work_item,
        )
        with self.assertRaises(IntegrityError):
            ProductWorkMapping.objects.create(
                product=self.product, work_item=self.work_item,
            )

    def test_ordering_by_usage_count_desc(self):
        wi2 = WorkItem.objects.create(
            article='V-002', section=self.work_section,
            name='Монтаж воздуховода', unit='м.п.', grade=self.grade,
        )
        wi3 = WorkItem.objects.create(
            article='V-003', section=self.work_section,
            name='Подключение', unit='шт', grade=self.grade,
        )
        ProductWorkMapping.objects.create(
            product=self.product, work_item=self.work_item, usage_count=3,
        )
        ProductWorkMapping.objects.create(
            product=self.product, work_item=wi2, usage_count=10,
        )
        ProductWorkMapping.objects.create(
            product=self.product, work_item=wi3, usage_count=1,
        )
        qs = ProductWorkMapping.objects.filter(product=self.product)
        counts = list(qs.values_list('usage_count', flat=True))
        self.assertEqual(counts, [10, 3, 1])

    def test_str(self):
        mapping = ProductWorkMapping(
            product=self.product,
            work_item=self.work_item,
            usage_count=7,
        )
        expected = f"{self.product.name} → {self.work_item.name} (7x)"
        self.assertEqual(str(mapping), expected)

    def test_source_choices(self):
        for src in ('manual', 'rule', 'llm'):
            mapping = ProductWorkMapping.objects.create(
                product=Product.objects.create(name=f'Product-{src}'),
                work_item=self.work_item,
                source=src,
            )
            self.assertEqual(mapping.source, src)
