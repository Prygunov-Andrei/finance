import io
from decimal import Decimal

import openpyxl
from django.test import TestCase
from django.contrib.auth import get_user_model

from estimates.models import Estimate, EstimateSection, EstimateItem
from estimates.services.estimate_import_service import EstimateImportService
from objects.models import Object as ConstructionObject
from accounting.models import LegalEntity, TaxSystem

User = get_user_model()


def _create_test_excel(rows, headers=None):
    """Create an in-memory Excel file for testing."""
    wb = openpyxl.Workbook()
    ws = wb.active
    if headers:
        ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class EstimateImportServiceExcelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='tester', password='test')
        self.obj = ConstructionObject.objects.create(
            name='Test Object', address='addr', status='active',
        )
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН', vat_rate=20)
        self.legal_entity = LegalEntity.objects.create(
            name='Test LLC', inn='1234567890', tax_system=self.tax_system,
        )
        self.estimate = Estimate.objects.create(
            number='SM-001', name='Test Estimate', object=self.obj,
            status='draft', created_by=self.user, legal_entity=self.legal_entity,
        )
        self.service = EstimateImportService()

    def test_basic_excel_import(self):
        content = _create_test_excel(
            headers=['Наименование', 'Модель', 'Ед.изм.', 'Количество', 'Цена материала', 'Цена работы'],
            rows=[
                ['Кабель ВВГнг 3x1.5', 'NYM', 'м.п.', 100, 45.5, 12],
                ['Автомат АВВ 16А', 'S201', 'шт', 10, 800, 200],
            ],
        )
        parsed = self.service.import_from_excel(content, 'test.xlsx')
        self.assertEqual(parsed.total_rows, 2)
        self.assertEqual(parsed.rows[0].name, 'Кабель ВВГнг 3x1.5')
        self.assertEqual(parsed.rows[0].model_name, 'NYM')
        self.assertEqual(parsed.rows[0].unit, 'м.п.')
        self.assertEqual(parsed.rows[0].quantity, Decimal('100'))
        self.assertEqual(parsed.rows[0].material_unit_price, Decimal('45.5'))
        self.assertEqual(parsed.rows[1].name, 'Автомат АВВ 16А')

    def test_section_detection(self):
        content = _create_test_excel(
            headers=['Наименование', 'Ед.', 'Кол-во', 'Цена'],
            rows=[
                ['Раздел 1: Кабельная продукция', None, None, None],
                ['Кабель NYM 3x1.5', 'м.п.', 100, 50],
                ['Раздел 2: Автоматика', None, None, None],
                ['Автомат ABB S201', 'шт', 5, 800],
            ],
        )
        parsed = self.service.import_from_excel(content, 'test.xlsx')
        self.assertEqual(parsed.total_rows, 2)
        self.assertEqual(len(parsed.sections), 2)
        self.assertEqual(parsed.rows[0].section_name, 'Раздел 1: Кабельная продукция')
        self.assertEqual(parsed.rows[1].section_name, 'Раздел 2: Автоматика')

    def test_totals_row_skipped(self):
        content = _create_test_excel(
            headers=['Наименование', 'Кол-во', 'Цена'],
            rows=[
                ['Кабель NYM', 100, 50],
                ['Итого', None, 5000],
            ],
        )
        parsed = self.service.import_from_excel(content, 'test.xlsx')
        self.assertEqual(parsed.total_rows, 1)

    def test_empty_file(self):
        wb = openpyxl.Workbook()
        buf = io.BytesIO()
        wb.save(buf)
        parsed = self.service.import_from_excel(buf.getvalue(), 'empty.xlsx')
        self.assertEqual(parsed.total_rows, 0)

    def test_save_imported_items(self):
        content = _create_test_excel(
            headers=['Наименование', 'Модель', 'Ед.', 'Кол-во', 'Цена мат.', 'Цена работ'],
            rows=[
                ['Кабель ВВГнг', 'NYM', 'м.п.', 50, 40, 10],
                ['Автомат', 'S201', 'шт', 5, 800, 200],
            ],
        )
        parsed = self.service.import_from_excel(content, 'test.xlsx')
        items = self.service.save_imported_items(self.estimate.id, parsed)

        self.assertEqual(len(items), 2)
        self.assertEqual(EstimateItem.objects.filter(estimate=self.estimate).count(), 2)

        sections = EstimateSection.objects.filter(estimate=self.estimate)
        self.assertTrue(sections.exists())

    def test_save_with_sections(self):
        content = _create_test_excel(
            headers=['Наименование', 'Ед.', 'Кол-во', 'Цена'],
            rows=[
                ['Раздел: Электрика', None, None, None],
                ['Кабель NYM', 'м.п.', 100, 50],
            ],
        )
        parsed = self.service.import_from_excel(content, 'test.xlsx')
        items = self.service.save_imported_items(self.estimate.id, parsed)

        self.assertEqual(len(items), 1)
        section = EstimateSection.objects.get(estimate=self.estimate, name='Раздел: Электрика')
        self.assertEqual(items[0].section, section)

    def test_confidence_high_with_many_columns(self):
        content = _create_test_excel(
            headers=['Наименование', 'Модель', 'Ед. изм', 'Количество', 'Цена материала'],
            rows=[['Test', 'M1', 'шт', 1, 100]],
        )
        parsed = self.service.import_from_excel(content, 'test.xlsx')
        self.assertGreaterEqual(parsed.confidence, 0.7)

    def test_decimal_parsing_with_commas(self):
        content = _create_test_excel(
            headers=['Наименование', 'Кол-во', 'Цена'],
            rows=[['Test item', '1 234,56', '5 678,90']],
        )
        parsed = self.service.import_from_excel(content, 'test.xlsx')
        self.assertEqual(parsed.total_rows, 1)
