from django.test import TestCase
from django.core.exceptions import ValidationError
from decimal import Decimal
from datetime import date
from pricelists.models import (
    WorkerGrade, WorkSection, WorkerGradeSkills,
    WorkItem, PriceList, PriceListItem, PriceListAgreement
)
from accounting.models import Counterparty


class WorkerGradeTests(TestCase):
    """Тесты для модели WorkerGrade"""
    
    def test_create_worker_grade(self):
        """Тест создания разряда рабочего"""
        grade = WorkerGrade.objects.create(
            grade=1,
            name='Монтажник 1 разряда',
            default_hourly_rate=Decimal('500.00')
        )
        self.assertEqual(grade.grade, 1)
        self.assertEqual(grade.name, 'Монтажник 1 разряда')
        self.assertEqual(grade.default_hourly_rate, Decimal('500.00'))
        self.assertTrue(grade.is_active)

    def test_grade_validation(self):
        """Тест валидации разряда (1-5)"""
        # Невалидный разряд
        with self.assertRaises(ValidationError):
            grade = WorkerGrade(
                grade=6,
                name='Невалидный разряд',
                default_hourly_rate=Decimal('500.00')
            )
            grade.full_clean()


class WorkSectionTests(TestCase):
    """Тесты для модели WorkSection"""
    
    def test_create_work_section(self):
        """Тест создания раздела работ"""
        section = WorkSection.objects.create(
            code='VENT',
            name='Вентиляция',
            sort_order=1
        )
        self.assertEqual(section.code, 'VENT')
        self.assertEqual(section.name, 'Вентиляция')
        self.assertTrue(section.is_active)

    def test_section_hierarchy(self):
        """Тест иерархии разделов"""
        parent = WorkSection.objects.create(
            code='VENT',
            name='Вентиляция'
        )
        child = WorkSection.objects.create(
            code='VENT-SUPPLY',
            name='Приточная вентиляция',
            parent=parent
        )
        self.assertEqual(child.parent, parent)
        self.assertIn(child, parent.children.all())

    def test_cyclic_reference_prevention(self):
        """Тест предотвращения циклических ссылок"""
        section = WorkSection.objects.create(
            code='TEST',
            name='Тест'
        )
        section.parent = section
        with self.assertRaises(ValidationError):
            section.full_clean()


class WorkItemTests(TestCase):
    """Тесты для модели WorkItem"""
    
    def setUp(self):
        self.section = WorkSection.objects.create(
            code='VENT',
            name='Вентиляция'
        )
        self.grade = WorkerGrade.objects.create(
            grade=2,
            name='Монтажник 2 разряда',
            default_hourly_rate=Decimal('650.00')
        )

    def test_create_work_item(self):
        """Тест создания работы"""
        work_item = WorkItem.objects.create(
            article='V-001',
            section=self.section,
            name='Монтаж воздуховода',
            unit='м.п.',
            hours=Decimal('2.00'),
            grade=self.grade
        )
        self.assertEqual(work_item.article, 'V-001')
        self.assertEqual(work_item.section, self.section)
        self.assertTrue(work_item.is_current)
        self.assertEqual(work_item.version_number, 1)

    def test_create_work_item_without_hours(self):
        """Тест создания работы без часов (автоматически подставляется 0)"""
        work_item = WorkItem.objects.create(
            article='V-002',
            section=self.section,
            name='Работа без часов',
            unit='шт',
            grade=self.grade
            # hours не указан
        )
        self.assertEqual(work_item.hours, Decimal('0'))
        self.assertEqual(work_item.article, 'V-002')

    def test_work_item_versioning(self):
        """Тест версионирования работы"""
        work_item = WorkItem.objects.create(
            article='V-001',
            section=self.section,
            name='Монтаж воздуховода',
            unit='м.п.',
            hours=Decimal('2.00'),
            grade=self.grade
        )
        
        # Создаём новую версию
        new_version = work_item.create_new_version()
        
        # Проверяем старую версию
        work_item.refresh_from_db()
        self.assertFalse(work_item.is_current)
        
        # Проверяем новую версию
        self.assertTrue(new_version.is_current)
        self.assertEqual(new_version.version_number, 2)
        self.assertEqual(new_version.parent_version, work_item)
        self.assertEqual(new_version.article, 'V-001-v2')

    def test_get_current_items(self):
        """Тест получения только актуальных версий"""
        work_item = WorkItem.objects.create(
            article='V-001',
            section=self.section,
            name='Монтаж воздуховода',
            unit='м.п.',
            hours=Decimal('2.00'),
            grade=self.grade
        )
        new_version = work_item.create_new_version()
        
        current_items = WorkItem.get_current_items()
        self.assertEqual(current_items.count(), 1)
        self.assertEqual(current_items.first(), new_version)


class PriceListTests(TestCase):
    """Тесты для модели PriceList"""
    
    def setUp(self):
        self.section = WorkSection.objects.create(
            code='VENT',
            name='Вентиляция'
        )
        self.grade = WorkerGrade.objects.create(
            grade=2,
            name='Монтажник 2 разряда',
            default_hourly_rate=Decimal('650.00')
        )
        self.work_item = WorkItem.objects.create(
            article='V-001',
            section=self.section,
            name='Монтаж воздуховода',
            unit='м.п.',
            hours=Decimal('2.00'),
            grade=self.grade
        )

    def test_create_price_list(self):
        """Тест создания прайс-листа"""
        price_list = PriceList.objects.create(
            number='PL-001',
            name='Тестовый прайс-лист',
            date=date.today(),
            grade_2_rate=Decimal('650.00')
        )
        self.assertEqual(price_list.number, 'PL-001')
        self.assertEqual(price_list.status, PriceList.Status.DRAFT)
        self.assertEqual(price_list.version_number, 1)

    def test_populate_rates_from_grades(self):
        """Тест заполнения ставок из справочника разрядов"""
        price_list = PriceList(
            number='PL-001',
            date=date.today()
        )
        price_list.populate_rates_from_grades()
        price_list.save()
        
        self.assertEqual(price_list.grade_2_rate, Decimal('650.00'))

    def test_get_rate_for_grade(self):
        """Тест получения ставки по разряду"""
        price_list = PriceList.objects.create(
            number='PL-001',
            date=date.today(),
            grade_2_rate=Decimal('650.00')
        )
        self.assertEqual(price_list.get_rate_for_grade(2), Decimal('650.00'))
        self.assertEqual(price_list.get_rate_for_grade(3), Decimal('0'))

    def test_get_rate_for_fractional_grade(self):
        """Тест получения ставки для дробного разряда (интерполяция)"""
        price_list = PriceList.objects.create(
            number='PL-002',
            date=date.today(),
            grade_2_rate=Decimal('650.00'),
            grade_3_rate=Decimal('800.00')
        )
        
        # Тест для разряда 2.5: интерполяция между 2 и 3
        # 650 + (800 - 650) * 0.5 = 650 + 75 = 725
        rate_2_5 = price_list.get_rate_for_grade(Decimal('2.5'))
        self.assertEqual(rate_2_5, Decimal('725.00'))
        
        # Тест для разряда 2.25: интерполяция между 2 и 3
        # 650 + (800 - 650) * 0.25 = 650 + 37.5 = 687.5
        rate_2_25 = price_list.get_rate_for_grade(Decimal('2.25'))
        self.assertEqual(rate_2_25, Decimal('687.50'))
        
        # Тест для разряда 3.65: интерполяция между 3 и 4
        price_list.grade_4_rate = Decimal('950.00')
        price_list.save()
        # 800 + (950 - 800) * 0.65 = 800 + 97.5 = 897.5
        rate_3_65 = price_list.get_rate_for_grade(Decimal('3.65'))
        self.assertEqual(rate_3_65, Decimal('897.50'))
        
        # Тест для целого разряда (должен работать как раньше)
        self.assertEqual(price_list.get_rate_for_grade(2), Decimal('650.00'))
        self.assertEqual(price_list.get_rate_for_grade(3), Decimal('800.00'))

    def test_price_list_versioning(self):
        """Тест версионирования прайс-листа"""
        price_list = PriceList.objects.create(
            number='PL-001',
            date=date.today(),
            status=PriceList.Status.ACTIVE,
            grade_2_rate=Decimal('650.00')
        )
        
        # Добавляем позицию с переопределениями
        item = PriceListItem.objects.create(
            price_list=price_list,
            work_item=self.work_item,
            hours_override=Decimal('3.00'),
            coefficient_override=Decimal('1.5'),
            grade_override=Decimal('3.65')
        )
        
        # Создаём новую версию
        new_version = price_list.create_new_version()
        
        # Проверяем старую версию
        price_list.refresh_from_db()
        self.assertEqual(price_list.status, PriceList.Status.ARCHIVED)
        
        # Проверяем новую версию
        self.assertEqual(new_version.status, PriceList.Status.DRAFT)
        self.assertEqual(new_version.version_number, 2)
        self.assertEqual(new_version.parent_version, price_list)
        self.assertEqual(new_version.items.count(), 1)
        
        # Проверяем, что переопределения скопированы
        new_item = new_version.items.first()
        self.assertEqual(new_item.hours_override, Decimal('3.00'))
        self.assertEqual(new_item.coefficient_override, Decimal('1.5'))
        self.assertEqual(new_item.grade_override, Decimal('3.65'))


class PriceListItemTests(TestCase):
    """Тесты для модели PriceListItem"""
    
    def setUp(self):
        self.section = WorkSection.objects.create(
            code='VENT',
            name='Вентиляция'
        )
        self.grade = WorkerGrade.objects.create(
            grade=2,
            name='Монтажник 2 разряда',
            default_hourly_rate=Decimal('650.00')
        )
        self.work_item = WorkItem.objects.create(
            article='V-001',
            section=self.section,
            name='Монтаж воздуховода',
            unit='м.п.',
            hours=Decimal('2.00'),
            grade=self.grade,
            coefficient=Decimal('1.00')
        )
        self.price_list = PriceList.objects.create(
            number='PL-001',
            date=date.today(),
            grade_2_rate=Decimal('650.00')
        )

    def test_calculated_cost(self):
        """Тест расчёта стоимости работы"""
        item = PriceListItem.objects.create(
            price_list=self.price_list,
            work_item=self.work_item
        )
        # Стоимость = 2 часа × 1.0 коэфф × 650 руб = 1300 руб
        self.assertEqual(item.calculated_cost, Decimal('1300.00'))

    def test_calculated_cost_with_zero_hours(self):
        """Тест расчёта стоимости работы с нулевыми часами"""
        # Создаём работу с hours = 0
        work_item_zero = WorkItem.objects.create(
            article='V-003',
            section=self.section,
            name='Работа без часов',
            unit='шт',
            hours=Decimal('0'),
            grade=self.grade
        )
        
        item = PriceListItem.objects.create(
            price_list=self.price_list,
            work_item=work_item_zero
        )
        # Стоимость = 0 часов × 1.0 коэфф × 650 руб = 0 руб
        self.assertEqual(item.calculated_cost, Decimal('0'))
        self.assertEqual(item.effective_hours, Decimal('0'))

    def test_effective_hours_override(self):
        """Тест переопределения часов"""
        item = PriceListItem.objects.create(
            price_list=self.price_list,
            work_item=self.work_item,
            hours_override=Decimal('3.00')
        )
        self.assertEqual(item.effective_hours, Decimal('3.00'))
        # Стоимость = 3 часа × 1.0 коэфф × 650 руб = 1950 руб
        self.assertEqual(item.calculated_cost, Decimal('1950.00'))

    def test_effective_coefficient_override(self):
        """Тест переопределения коэффициента"""
        item = PriceListItem.objects.create(
            price_list=self.price_list,
            work_item=self.work_item,
            coefficient_override=Decimal('1.50')
        )
        self.assertEqual(item.effective_coefficient, Decimal('1.50'))
        # Стоимость = 2 часа × 1.5 коэфф × 650 руб = 1950 руб
        self.assertEqual(item.calculated_cost, Decimal('1950.00'))

    def test_effective_grade_from_work_item(self):
        """Тест эффективного разряда из работы"""
        item = PriceListItem.objects.create(
            price_list=self.price_list,
            work_item=self.work_item
        )
        # Эффективный разряд должен быть равен разряду работы (2)
        self.assertEqual(item.effective_grade, Decimal('2'))

    def test_grade_override(self):
        """Тест переопределения разряда"""
        item = PriceListItem.objects.create(
            price_list=self.price_list,
            work_item=self.work_item,
            grade_override=Decimal('3.00')
        )
        self.assertEqual(item.effective_grade, Decimal('3.00'))

    def test_fractional_grade_calculation(self):
        """Тест расчёта стоимости с дробным разрядом (интерполяция)"""
        # Создаём прайс-лист с ставками для разрядов 2 и 3
        price_list = PriceList.objects.create(
            number='PL-002',
            date=date.today(),
            grade_2_rate=Decimal('650.00'),
            grade_3_rate=Decimal('800.00')
        )
        
        # Создаём позицию с дробным разрядом 2.5
        # Интерполяция: 650 + (800 - 650) * 0.5 = 650 + 75 = 725 руб/ч
        item = PriceListItem.objects.create(
            price_list=price_list,
            work_item=self.work_item,
            grade_override=Decimal('2.5')
        )
        
        # Проверяем эффективный разряд
        self.assertEqual(item.effective_grade, Decimal('2.5'))
        
        # Проверяем расчёт ставки (интерполяция)
        expected_rate = Decimal('725.00')  # 650 + (800 - 650) * 0.5
        actual_rate = price_list.get_rate_for_grade(Decimal('2.5'))
        self.assertEqual(actual_rate, expected_rate)
        
        # Проверяем стоимость: 2 часа × 1.0 коэфф × 725 руб = 1450 руб
        self.assertEqual(item.calculated_cost, Decimal('1450.00'))

    def test_fractional_grade_3_65(self):
        """Тест расчёта стоимости с дробным разрядом 3.65"""
        # Создаём прайс-лист с ставками для разрядов 3 и 4
        price_list = PriceList.objects.create(
            number='PL-003',
            date=date.today(),
            grade_3_rate=Decimal('800.00'),
            grade_4_rate=Decimal('950.00')
        )
        
        # Создаём позицию с дробным разрядом 3.65
        # Интерполяция: 800 + (950 - 800) * 0.65 = 800 + 97.5 = 897.5 руб/ч
        item = PriceListItem.objects.create(
            price_list=price_list,
            work_item=self.work_item,
            grade_override=Decimal('3.65')
        )
        
        # Проверяем эффективный разряд
        self.assertEqual(item.effective_grade, Decimal('3.65'))
        
        # Проверяем расчёт ставки (интерполяция)
        expected_rate = Decimal('897.50')  # 800 + (950 - 800) * 0.65
        actual_rate = price_list.get_rate_for_grade(Decimal('3.65'))
        self.assertEqual(actual_rate, expected_rate)
        
        # Проверяем стоимость: 2 часа × 1.0 коэфф × 897.5 руб = 1795 руб
        self.assertEqual(item.calculated_cost, Decimal('1795.00'))


class PriceListAgreementTests(TestCase):
    """Тесты для модели PriceListAgreement"""
    
    def setUp(self):
        self.price_list = PriceList.objects.create(
            number='PL-001',
            date=date.today()
        )
        self.vendor = Counterparty.objects.create(
            name='ООО Исполнитель',
            type='vendor',
            legal_form='ooo',
            inn='1234567890'
        )
        self.customer = Counterparty.objects.create(
            name='ООО Заказчик',
            type='customer',
            legal_form='ooo',
            inn='0987654321'
        )

    def test_create_agreement_with_vendor(self):
        """Тест создания согласования с Исполнителем"""
        agreement = PriceListAgreement.objects.create(
            price_list=self.price_list,
            counterparty=self.vendor,
            agreed_date=date.today()
        )
        self.assertEqual(agreement.price_list, self.price_list)
        self.assertEqual(agreement.counterparty, self.vendor)

    def test_agreement_validation_customer_rejected(self):
        """Тест валидации: нельзя создать согласование с Заказчиком"""
        with self.assertRaises(ValidationError):
            PriceListAgreement.objects.create(
                price_list=self.price_list,
                counterparty=self.customer,
                agreed_date=date.today()
            )
