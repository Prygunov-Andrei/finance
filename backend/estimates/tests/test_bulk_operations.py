"""Тесты bulk-операций: bulk-update, bulk-set-markup API."""
from decimal import Decimal

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
import uuid

from estimates.models import (
    Estimate, EstimateSection, EstimateSubsection, EstimateItem,
)
from objects.models import Object
from accounting.models import LegalEntity, TaxSystem


class BulkOperationsTestBase(TestCase):
    """Базовый setUp для тестов bulk-операций."""

    def setUp(self):
        self.client = APIClient()
        uid = str(uuid.uuid4())[:8]
        self.user = User.objects.create_user(username=f'test_{uid}', password='pass')
        self.client.force_authenticate(user=self.user)

        self.obj = Object.objects.create(name=f'Объект {uid}', address='Адрес')
        self.tax = TaxSystem.objects.create(
            name=f'ОСН {uid}', code=f'osn_{uid}',
            has_vat=True, vat_rate=Decimal('20'),
        )
        self.entity = LegalEntity.objects.create(
            short_name=f'ООО {uid}', name=f'ООО Тест {uid}',
            inn=f'77{uid}', tax_system=self.tax,
        )
        self.estimate = Estimate.objects.create(
            name='Смета', object=self.obj, legal_entity=self.entity,
            created_by=self.user,
            default_material_markup_percent=Decimal('30'),
            default_work_markup_percent=Decimal('300'),
        )
        self.section = EstimateSection.objects.create(
            estimate=self.estimate, name='Раздел-1',
        )
        self.subsection = EstimateSubsection.objects.create(
            section=self.section, name='Подраздел-1',
        )

    def _create_item(self, name='Товар', mat_price=Decimal('1000'),
                     work_price=Decimal('500'), quantity=Decimal('2'), **kw):
        return EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            subsection=self.subsection,
            name=name, unit='шт', quantity=quantity,
            material_unit_price=mat_price, work_unit_price=work_price,
            **kw,
        )


# ---------------------------------------------------------------------------
#  bulk-update API
# ---------------------------------------------------------------------------
class BulkUpdateAPITests(BulkOperationsTestBase):
    """Тесты эндпоинта POST /api/v1/estimate-items/bulk-update/"""

    url = '/api/v1/estimate-items/bulk-update/'

    def test_bulk_update_allowed_fields(self):
        """Обновление name и quantity через bulk-update."""
        item1 = self._create_item(name='Товар-1')
        item2 = self._create_item(name='Товар-2')

        resp = self.client.post(self.url, [
            {'id': item1.id, 'name': 'Новый-1', 'quantity': '5'},
            {'id': item2.id, 'name': 'Новый-2', 'quantity': '10'},
        ], format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        item1.refresh_from_db()
        item2.refresh_from_db()
        self.assertEqual(item1.name, 'Новый-1')
        self.assertEqual(item1.quantity, Decimal('5'))
        self.assertEqual(item2.name, 'Новый-2')
        self.assertEqual(item2.quantity, Decimal('10'))

    def test_bulk_update_rejects_forbidden_fields(self):
        """Поля estimate, created_by не должны обновляться."""
        item = self._create_item()
        original_estimate_id = item.estimate_id

        # Создаём вторую смету
        other_estimate = Estimate.objects.create(
            name='Другая', object=self.obj, legal_entity=self.entity,
            created_by=self.user,
        )

        resp = self.client.post(self.url, [
            {'id': item.id, 'estimate': other_estimate.id, 'name': 'Хак'},
        ], format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        # estimate не должен измениться
        self.assertEqual(item.estimate_id, original_estimate_id)
        # name — разрешённое поле, должен обновиться
        self.assertEqual(item.name, 'Хак')

    def test_bulk_update_different_fields_per_item(self):
        """Разные наборы полей у разных items — все поля обновляются."""
        item1 = self._create_item(name='Товар-1')
        item2 = self._create_item(name='Товар-2')

        resp = self.client.post(self.url, [
            {'id': item1.id, 'name': 'Обновлённый'},
            {'id': item2.id, 'quantity': '99'},
        ], format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        item1.refresh_from_db()
        item2.refresh_from_db()
        self.assertEqual(item1.name, 'Обновлённый')
        self.assertEqual(item2.quantity, Decimal('99'))

    def test_bulk_update_recalculates_subsection(self):
        """После bulk-update quantity/price подразделы пересчитываются."""
        item = self._create_item(
            mat_price=Decimal('1000'), work_price=Decimal('500'),
            quantity=Decimal('2'),
        )
        # Ожидаемый пересчёт: mat_purchase = 1000*2 = 2000 до обновления
        self.subsection.refresh_from_db()
        old_mat_purchase = self.subsection.materials_purchase

        resp = self.client.post(self.url, [
            {'id': item.id, 'quantity': '10'},
        ], format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.subsection.refresh_from_db()
        # 1000 * 10 = 10000
        self.assertEqual(self.subsection.materials_purchase, Decimal('10000.00'))

    def test_bulk_update_empty_array(self):
        """Пустой массив → 400."""
        resp = self.client.post(self.url, [], format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bulk_update_not_array(self):
        """Не массив → 400."""
        resp = self.client.post(self.url, {'id': 1, 'name': 'test'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bulk_update_nonexistent_ids_ignored(self):
        """Несуществующие ID пропускаются, остальные обновляются."""
        item = self._create_item(name='Оригинал')

        resp = self.client.post(self.url, [
            {'id': item.id, 'name': 'Обновлён'},
            {'id': 999999, 'name': 'Не существует'},
        ], format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertEqual(item.name, 'Обновлён')

    def test_bulk_update_no_allowed_fields(self):
        """Только запрещённые поля → 400."""
        item = self._create_item()
        resp = self.client.post(self.url, [
            {'id': item.id, 'estimate': 999},
        ], format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
#  bulk-set-markup API
# ---------------------------------------------------------------------------
class BulkSetMarkupAPITests(BulkOperationsTestBase):
    """Тесты эндпоинта POST /api/v1/estimate-items/bulk-set-markup/"""

    url = '/api/v1/estimate-items/bulk-set-markup/'

    def test_set_percent_markup(self):
        """Установка процентной наценки через API."""
        item = self._create_item(mat_price=Decimal('1000'))

        resp = self.client.post(self.url, {
            'item_ids': [item.id],
            'material_markup_type': 'percent',
            'material_markup_value': '50',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertEqual(item.material_markup_type, 'percent')
        self.assertEqual(item.material_markup_value, Decimal('50'))
        self.assertEqual(item.material_sale_unit_price, Decimal('1500.00'))

    def test_set_fixed_price_markup(self):
        """Установка фиксированной цены через API."""
        item = self._create_item(mat_price=Decimal('1000'))

        resp = self.client.post(self.url, {
            'item_ids': [item.id],
            'material_markup_type': 'fixed_price',
            'material_markup_value': '1800',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertEqual(item.material_sale_unit_price, Decimal('1800'))

    def test_clear_markup(self):
        """Сброс наценки к наследованию через API."""
        item = self._create_item(
            mat_price=Decimal('1000'),
            material_markup_type='percent',
            material_markup_value=Decimal('50'),
        )
        self.assertEqual(item.material_sale_unit_price, Decimal('1500.00'))

        resp = self.client.post(self.url, {
            'item_ids': [item.id],
            'material_markup_type': 'clear',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertIsNone(item.material_markup_type)
        # Должна унаследоваться дефолтная 30%
        self.assertEqual(item.material_sale_unit_price, Decimal('1300.00'))

    def test_subsection_recalculated_after_markup(self):
        """Подраздел пересчитывается после массовой установки наценки."""
        item = self._create_item(
            mat_price=Decimal('1000'), quantity=Decimal('2'),
        )
        # Дефолт 30%: sale = 1000*1.3 = 1300, total = 1300*2 = 2600
        self.subsection.refresh_from_db()
        self.assertEqual(self.subsection.materials_sale, Decimal('2600.00'))

        self.client.post(self.url, {
            'item_ids': [item.id],
            'material_markup_type': 'percent',
            'material_markup_value': '100',
        }, format='json')

        self.subsection.refresh_from_db()
        # 100%: sale = 1000*2 = 2000, total = 2000*2 = 4000
        self.assertEqual(self.subsection.materials_sale, Decimal('4000.00'))


# ---------------------------------------------------------------------------
#  bulk-move API: перенос строк между разделами
# ---------------------------------------------------------------------------
class BulkMoveAPITests(BulkOperationsTestBase):
    """Тесты эндпоинта POST /api/v1/estimate-items/bulk-move/"""

    url = '/api/v1/estimate-items/bulk-move/'

    def setUp(self):
        super().setUp()
        # Второй раздел с подразделом
        self.section2 = EstimateSection.objects.create(
            estimate=self.estimate, name='Раздел-2', sort_order=2,
        )
        self.subsection2 = EstimateSubsection.objects.create(
            section=self.section2, name='Подраздел-2',
        )

    def _create_item_in_section(self, section, subsection, name, sort_order=1):
        return EstimateItem.objects.create(
            estimate=self.estimate, section=section, subsection=subsection,
            name=name, unit='шт', quantity=Decimal('1'),
            material_unit_price=Decimal('100'), work_unit_price=Decimal('50'),
            sort_order=sort_order,
        )

    def test_bulk_move_cross_section(self):
        """Перенос строки из раздела 1 в позицию раздела 2 — section FK обновляется."""
        item_a1 = self._create_item_in_section(self.section, self.subsection, 'A1', 1)
        item_a2 = self._create_item_in_section(self.section, self.subsection, 'A2', 2)
        item_a3 = self._create_item_in_section(self.section, self.subsection, 'A3', 3)
        item_b1 = self._create_item_in_section(self.section2, self.subsection2, 'B1', 1)
        item_b2 = self._create_item_in_section(self.section2, self.subsection2, 'B2', 2)
        item_b3 = self._create_item_in_section(self.section2, self.subsection2, 'B3', 3)

        # Переносим A1 на позицию 5 (между B1 и B2 в глобальном порядке)
        resp = self.client.post(self.url, {
            'item_ids': [item_a1.id],
            'target_position': 5,
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        item_a1.refresh_from_db()
        self.assertEqual(item_a1.section_id, self.section2.id,
                         'Строка должна переместиться в раздел 2')

    def test_bulk_move_within_same_section(self):
        """Перенос строки внутри своего раздела — section FK не меняется."""
        item_a1 = self._create_item_in_section(self.section, self.subsection, 'A1', 1)
        item_a2 = self._create_item_in_section(self.section, self.subsection, 'A2', 2)
        item_a3 = self._create_item_in_section(self.section, self.subsection, 'A3', 3)

        resp = self.client.post(self.url, {
            'item_ids': [item_a1.id],
            'target_position': 3,
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        item_a1.refresh_from_db()
        self.assertEqual(item_a1.section_id, self.section.id,
                         'Строка должна остаться в своём разделе')

    def test_bulk_move_to_end(self):
        """Перенос строки на позицию за последней — попадает в последний раздел."""
        item_a1 = self._create_item_in_section(self.section, self.subsection, 'A1', 1)
        item_b1 = self._create_item_in_section(self.section2, self.subsection2, 'B1', 1)

        resp = self.client.post(self.url, {
            'item_ids': [item_a1.id],
            'target_position': 999,
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        item_a1.refresh_from_db()
        self.assertEqual(item_a1.section_id, self.section2.id,
                         'Строка должна оказаться в последнем разделе')
