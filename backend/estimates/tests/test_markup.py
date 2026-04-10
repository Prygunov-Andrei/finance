"""Тесты системы наценок в сметах."""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
import uuid

from estimates.models import (
    Estimate, EstimateSection, EstimateSubsection, EstimateItem,
    EstimateMarkupDefaults,
)
from estimates.services.markup_service import (
    recalculate_estimate_subsections,
    recalculate_section_subsections,
    bulk_set_item_markup,
)
from objects.models import Object
from accounting.models import LegalEntity, TaxSystem


class MarkupTestBase(TestCase):
    """Базовый класс с общими setUp для тестов наценок."""

    def setUp(self):
        uid = str(uuid.uuid4())[:8]
        self.user = User.objects.create_user(username=f'test_{uid}', password='pass')
        self.obj = Object.objects.create(name=f'Объект {uid}', address='Адрес')
        self.tax = TaxSystem.objects.create(
            name=f'ОСН {uid}', code=f'osn_{uid}', has_vat=True, vat_rate=Decimal('20'))
        self.entity = LegalEntity.objects.create(
            short_name=f'ООО {uid}', name=f'ООО Тест {uid}',
            inn=f'77{uid}', tax_system=self.tax)

    def _create_estimate(self, mat_markup=Decimal('30'), work_markup=Decimal('300')):
        est = Estimate.objects.create(
            name='Тест', object=self.obj, legal_entity=self.entity,
            created_by=self.user,
            default_material_markup_percent=mat_markup,
            default_work_markup_percent=work_markup,
        )
        return est

    def _create_section(self, estimate, mat_markup=None, work_markup=None):
        return EstimateSection.objects.create(
            estimate=estimate, name='Раздел',
            material_markup_percent=mat_markup,
            work_markup_percent=work_markup,
        )

    def _create_subsection(self, section):
        return EstimateSubsection.objects.create(
            section=section, name='Подраздел')

    def _create_item(self, estimate, section, subsection,
                     mat_price=Decimal('1000'), work_price=Decimal('500'),
                     quantity=Decimal('2'), **markup_kwargs):
        return EstimateItem.objects.create(
            estimate=estimate, section=section, subsection=subsection,
            name='Товар', unit='шт', quantity=quantity,
            material_unit_price=mat_price, work_unit_price=work_price,
            **markup_kwargs,
        )


class MarkupCascadeTests(MarkupTestBase):
    """Тесты каскада наценок: строка → раздел → смета."""

    def test_inherit_from_estimate_default(self):
        """Строка без своей наценки — берёт из сметы."""
        est = self._create_estimate(mat_markup=Decimal('30'), work_markup=Decimal('300'))
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        item = self._create_item(est, sec, sub, mat_price=Decimal('1000'), work_price=Decimal('500'))

        self.assertEqual(item.material_sale_unit_price, Decimal('1300.00'))
        self.assertEqual(item.work_sale_unit_price, Decimal('2000.00'))

    def test_inherit_from_section(self):
        """Раздел с наценкой — строка берёт из раздела, а не из сметы."""
        est = self._create_estimate(mat_markup=Decimal('30'), work_markup=Decimal('300'))
        sec = self._create_section(est, mat_markup=Decimal('50'), work_markup=Decimal('100'))
        sub = self._create_subsection(sec)
        item = self._create_item(est, sec, sub, mat_price=Decimal('1000'), work_price=Decimal('500'))

        self.assertEqual(item.material_sale_unit_price, Decimal('1500.00'))
        self.assertEqual(item.work_sale_unit_price, Decimal('1000.00'))

    def test_item_override(self):
        """Строка с собственной наценкой — перекрывает раздел и смету."""
        est = self._create_estimate(mat_markup=Decimal('30'), work_markup=Decimal('300'))
        sec = self._create_section(est, mat_markup=Decimal('50'))
        sub = self._create_subsection(sec)
        item = self._create_item(
            est, sec, sub,
            mat_price=Decimal('1000'), work_price=Decimal('500'),
            material_markup_type='percent', material_markup_value=Decimal('20'),
            work_markup_type='percent', work_markup_value=Decimal('100'),
        )

        self.assertEqual(item.material_sale_unit_price, Decimal('1200.00'))
        self.assertEqual(item.work_sale_unit_price, Decimal('1000.00'))


class MarkupModesTests(MarkupTestBase):
    """Тесты трёх режимов наценки: процент, продажная цена, фикс. сумма."""

    def test_percent_mode(self):
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        item = self._create_item(
            est, sec, sub, mat_price=Decimal('1000'),
            material_markup_type='percent', material_markup_value=Decimal('25'),
        )
        self.assertEqual(item.material_sale_unit_price, Decimal('1250.00'))

    def test_fixed_price_mode(self):
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        item = self._create_item(
            est, sec, sub, mat_price=Decimal('1000'),
            material_markup_type='fixed_price', material_markup_value=Decimal('1500'),
        )
        self.assertEqual(item.material_sale_unit_price, Decimal('1500'))

    def test_fixed_amount_mode(self):
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        item = self._create_item(
            est, sec, sub, mat_price=Decimal('1000'),
            material_markup_type='fixed_amount', material_markup_value=Decimal('500'),
        )
        self.assertEqual(item.material_sale_unit_price, Decimal('1500.00'))

    def test_zero_price_returns_zero_sale(self):
        """При нулевой закупке — продажная тоже 0."""
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        item = self._create_item(
            est, sec, sub, mat_price=Decimal('0'), work_price=Decimal('0'),
        )
        self.assertEqual(item.material_sale_unit_price, Decimal('0'))
        self.assertEqual(item.work_sale_unit_price, Decimal('0'))


class MarkupTotalsTests(MarkupTestBase):
    """Тесты агрегатов (purchase + sale) на подразделе."""

    def test_item_totals(self):
        est = self._create_estimate(mat_markup=Decimal('30'), work_markup=Decimal('300'))
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        item = self._create_item(
            est, sec, sub,
            mat_price=Decimal('1000'), work_price=Decimal('500'),
            quantity=Decimal('2'),
        )
        self.assertEqual(item.material_purchase_total, Decimal('2000.00'))
        self.assertEqual(item.material_sale_total, Decimal('2600.00'))
        self.assertEqual(item.work_purchase_total, Decimal('1000.00'))
        self.assertEqual(item.work_sale_total, Decimal('4000.00'))

    def test_signal_updates_subsection(self):
        """Сигнал после сохранения строки обновляет подраздел (purchase + sale)."""
        est = self._create_estimate(mat_markup=Decimal('30'), work_markup=Decimal('300'))
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        self._create_item(est, sec, sub, mat_price=Decimal('1000'), work_price=Decimal('500'), quantity=Decimal('2'))

        sub.refresh_from_db()
        self.assertEqual(sub.materials_purchase, Decimal('2000.00'))
        self.assertEqual(sub.materials_sale, Decimal('2600.00'))
        self.assertEqual(sub.works_purchase, Decimal('1000.00'))
        self.assertEqual(sub.works_sale, Decimal('4000.00'))

    def test_effective_markup_percent(self):
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        item = self._create_item(
            est, sec, sub, mat_price=Decimal('1000'),
            material_markup_type='fixed_price', material_markup_value=Decimal('1500'),
        )
        self.assertEqual(item.effective_material_markup_percent, Decimal('50.00'))


class MarkupRecalculationTests(MarkupTestBase):
    """Тесты пересчёта при изменении наценки на смете/разделе."""

    def test_recalculate_estimate(self):
        est = self._create_estimate(mat_markup=Decimal('30'), work_markup=Decimal('300'))
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        self._create_item(est, sec, sub, mat_price=Decimal('1000'), work_price=Decimal('500'), quantity=Decimal('1'))

        sub.refresh_from_db()
        self.assertEqual(sub.materials_sale, Decimal('1300.00'))

        # Изменяем дефолтную наценку
        est.default_material_markup_percent = Decimal('50')
        est.save()
        recalculate_estimate_subsections(est.id)

        sub.refresh_from_db()
        self.assertEqual(sub.materials_sale, Decimal('1500.00'))

    def test_recalculate_section(self):
        est = self._create_estimate(mat_markup=Decimal('30'), work_markup=Decimal('300'))
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        self._create_item(est, sec, sub, mat_price=Decimal('1000'), work_price=Decimal('500'), quantity=Decimal('1'))

        sub.refresh_from_db()
        self.assertEqual(sub.materials_sale, Decimal('1300.00'))

        # Устанавливаем наценку на разделе
        sec.material_markup_percent = Decimal('50')
        sec.save()
        recalculate_section_subsections(sec.id)

        sub.refresh_from_db()
        self.assertEqual(sub.materials_sale, Decimal('1500.00'))


class BulkSetMarkupTests(MarkupTestBase):
    """Тесты массовой установки наценки."""

    def test_bulk_set_markup_percent(self):
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        item1 = self._create_item(est, sec, sub, mat_price=Decimal('1000'))
        item2 = self._create_item(est, sec, sub, mat_price=Decimal('2000'))

        bulk_set_item_markup(
            [item1.id, item2.id],
            material_markup_type='percent',
            material_markup_value=Decimal('50'),
        )

        item1.refresh_from_db()
        item2.refresh_from_db()
        self.assertEqual(item1.material_markup_type, 'percent')
        self.assertEqual(item1.material_markup_value, Decimal('50'))
        self.assertEqual(item2.material_markup_type, 'percent')

    def test_bulk_clear_markup(self):
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        item = self._create_item(
            est, sec, sub,
            material_markup_type='percent', material_markup_value=Decimal('50'),
        )

        bulk_set_item_markup(
            [item.id],
            material_markup_type='clear',
        )

        item.refresh_from_db()
        self.assertIsNone(item.material_markup_type)
        self.assertIsNone(item.material_markup_value)


class MarkupDefaultsTests(MarkupTestBase):
    """Тесты глобальных дефолтов наценок."""

    def test_singleton(self):
        defaults = EstimateMarkupDefaults.get()
        self.assertEqual(defaults.pk, 1)
        self.assertEqual(defaults.material_markup_percent, Decimal('30.00'))
        self.assertEqual(defaults.work_markup_percent, Decimal('300.00'))

    def test_new_estimate_inherits_global(self):
        """Новая смета берёт дефолты из глобальной настройки."""
        defaults = EstimateMarkupDefaults.get()
        defaults.material_markup_percent = Decimal('40')
        defaults.work_markup_percent = Decimal('200')
        defaults.save()

        est = Estimate.objects.create(
            name='Новая', object=self.obj, legal_entity=self.entity,
            created_by=self.user,
        )
        self.assertEqual(est.default_material_markup_percent, Decimal('40.00'))
        self.assertEqual(est.default_work_markup_percent, Decimal('200.00'))


class VersionCopyTests(MarkupTestBase):
    """Тест что версионирование копирует наценки и строки."""

    def test_new_version_copies_markup(self):
        est = self._create_estimate(mat_markup=Decimal('50'), work_markup=Decimal('200'))
        sec = self._create_section(est, mat_markup=Decimal('40'), work_markup=Decimal('150'))
        sub = self._create_subsection(sec)
        est.create_initial_characteristics()

        new_est = est.create_new_version()

        self.assertEqual(new_est.default_material_markup_percent, Decimal('50'))
        self.assertEqual(new_est.default_work_markup_percent, Decimal('200'))

        new_sec = new_est.sections.first()
        self.assertEqual(new_sec.material_markup_percent, Decimal('40'))
        self.assertEqual(new_sec.work_markup_percent, Decimal('150'))

    def test_new_version_copies_items(self):
        """Новая версия содержит копии всех строк сметы."""
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        item1 = self._create_item(est, sec, sub, mat_price=Decimal('1000'), work_price=Decimal('500'))
        item2 = self._create_item(est, sec, sub, mat_price=Decimal('2000'), work_price=Decimal('800'))

        new_est = est.create_new_version()

        new_items = list(EstimateItem.objects.filter(estimate=new_est).order_by('sort_order'))
        self.assertEqual(len(new_items), 2)

    def test_new_version_items_reference_new_sections(self):
        """Строки новой версии ссылаются на новые разделы/подразделы."""
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        self._create_item(est, sec, sub)

        new_est = est.create_new_version()
        new_item = EstimateItem.objects.filter(estimate=new_est).first()
        new_sec = new_est.sections.first()

        self.assertIsNotNone(new_item)
        self.assertEqual(new_item.section_id, new_sec.id)
        # Строка НЕ ссылается на старый раздел
        self.assertNotEqual(new_item.section_id, sec.id)

    def test_new_version_items_preserve_markup(self):
        """Строковые наценки сохраняются при копировании."""
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        self._create_item(
            est, sec, sub,
            material_markup_type='fixed_price',
            material_markup_value=Decimal('1500'),
            work_markup_type='percent',
            work_markup_value=Decimal('50'),
        )

        new_est = est.create_new_version()
        new_item = EstimateItem.objects.filter(estimate=new_est).first()

        self.assertEqual(new_item.material_markup_type, 'fixed_price')
        self.assertEqual(new_item.material_markup_value, Decimal('1500'))
        self.assertEqual(new_item.work_markup_type, 'percent')
        self.assertEqual(new_item.work_markup_value, Decimal('50'))

    def test_new_version_items_preserve_custom_data(self):
        """custom_data сохраняется при копировании."""
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        self._create_item(est, sec, sub, custom_data={'note': 'тест', 'color': 'red'})

        new_est = est.create_new_version()
        new_item = EstimateItem.objects.filter(estimate=new_est).first()

        self.assertEqual(new_item.custom_data, {'note': 'тест', 'color': 'red'})

    def test_new_version_items_preserve_field_values(self):
        """Все основные поля строки сохраняются при копировании."""
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        item = self._create_item(
            est, sec, sub,
            mat_price=Decimal('1234.56'), work_price=Decimal('789.01'),
            quantity=Decimal('3.5'),
        )
        item.name = 'Особый товар'
        item.model_name = 'Модель-XYZ'
        item.unit = 'м²'
        item.save()

        new_est = est.create_new_version()
        new_item = EstimateItem.objects.filter(estimate=new_est).first()

        self.assertEqual(new_item.name, 'Особый товар')
        self.assertEqual(new_item.model_name, 'Модель-XYZ')
        self.assertEqual(new_item.unit, 'м²')
        self.assertEqual(new_item.quantity, Decimal('3.5'))
        self.assertEqual(new_item.material_unit_price, Decimal('1234.56'))
        self.assertEqual(new_item.work_unit_price, Decimal('789.01'))


class FixedPriceStabilityTests(MarkupTestBase):
    """Fixed price остаётся стабильной при изменении закупочной цены."""

    def test_fixed_price_stable_on_purchase_change(self):
        """markup_type='fixed_price' — продажная цена не зависит от закупочной."""
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        item = self._create_item(
            est, sec, sub, mat_price=Decimal('1000'),
            material_markup_type='fixed_price', material_markup_value=Decimal('1500'),
        )
        self.assertEqual(item.material_sale_unit_price, Decimal('1500'))

        # Изменяем закупочную цену
        item.material_unit_price = Decimal('2000')
        item.save()
        item.refresh_from_db()
        # Продажная цена не изменилась
        self.assertEqual(item.material_sale_unit_price, Decimal('1500'))


class TKPCopyTests(MarkupTestBase):
    """Тест что данные подразделов корректно копируются в ТКП."""

    def test_tkp_copies_subsection_totals(self):
        """При копировании в ТКП подразделы содержат корректные purchase/sale."""
        from proposals.models import TechnicalProposal

        est = self._create_estimate(mat_markup=Decimal('30'), work_markup=Decimal('300'))
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        self._create_item(est, sec, sub, mat_price=Decimal('1000'), work_price=Decimal('500'), quantity=Decimal('1'))

        sub.refresh_from_db()
        # Проверяем что подразделы содержат корректные данные
        self.assertEqual(sub.materials_purchase, Decimal('1000.00'))
        self.assertEqual(sub.materials_sale, Decimal('1300.00'))
        self.assertEqual(sub.works_purchase, Decimal('500.00'))
        self.assertEqual(sub.works_sale, Decimal('2000.00'))

        # Создаём ТКП и копируем данные
        from datetime import date
        tkp = TechnicalProposal.objects.create(
            name='ТКП тест', date=date.today(),
            object=self.obj,
            legal_entity=self.entity, created_by=self.user,
        )
        tkp.estimates.add(est)
        tkp.copy_data_from_estimates()

        # Проверяем что ТКП подразделы скопировали данные
        tkp_sub = tkp.estimate_sections.first().subsections.first()
        self.assertEqual(tkp_sub.materials_purchase, Decimal('1000.00'))
        self.assertEqual(tkp_sub.materials_sale, Decimal('1300.00'))
        self.assertEqual(tkp_sub.works_purchase, Decimal('500.00'))
        self.assertEqual(tkp_sub.works_sale, Decimal('2000.00'))


class ExportModeTests(MarkupTestBase):
    """Тесты экспорта с разными режимами."""

    def test_internal_export(self):
        from estimates.services.estimate_excel_exporter import EstimateExcelExporter
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        self._create_item(est, sec, sub)

        exporter = EstimateExcelExporter(est)
        buf = exporter.export_with_column_config(mode='internal')
        self.assertTrue(buf.getvalue())

    def test_external_export(self):
        from estimates.services.estimate_excel_exporter import EstimateExcelExporter
        est = self._create_estimate()
        sec = self._create_section(est)
        sub = self._create_subsection(sec)
        self._create_item(est, sec, sub)

        exporter = EstimateExcelExporter(est)
        buf = exporter.export_with_column_config(mode='external')
        self.assertTrue(buf.getvalue())
