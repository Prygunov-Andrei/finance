from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from django.utils import timezone

from objects.models import Object
from accounting.models import LegalEntity, TaxSystem, Counterparty
from estimates.models import Estimate, EstimateSection, EstimateSubsection, EstimateCharacteristic
from .models import (
    FrontOfWorkItem,
    MountingCondition,
    TechnicalProposal,
    TKPEstimateSection,
    TKPEstimateSubsection,
    TKPCharacteristic,
    TKPFrontOfWork,
    MountingProposal,
)
from .models import generate_tkp_number, generate_mp_number


class FrontOfWorkItemTests(TestCase):
    """Тесты для модели FrontOfWorkItem"""
    
    def setUp(self):
        self.item = FrontOfWorkItem.objects.create(
            name='Подвести электропитание',
            category='Электрика',
            is_active=True,
            sort_order=1
        )
    
    def test_create_front_of_work_item(self):
        """Тест создания пункта фронта работ"""
        self.assertEqual(FrontOfWorkItem.objects.count(), 1)
        self.assertEqual(self.item.name, 'Подвести электропитание')
        self.assertEqual(self.item.category, 'Электрика')
        self.assertTrue(self.item.is_active)
    
    def test_str_representation(self):
        """Тест строкового представления"""
        self.assertEqual(str(self.item), 'Подвести электропитание')
    
    def test_defaults(self):
        """Тест значений по умолчанию"""
        item = FrontOfWorkItem.objects.create(name='Тестовый пункт')
        self.assertTrue(item.is_active)
        self.assertEqual(item.sort_order, 0)
        self.assertEqual(item.category, '')


class MountingConditionTests(TestCase):
    """Тесты для модели MountingCondition"""
    
    def setUp(self):
        self.condition = MountingCondition.objects.create(
            name='Проживание',
            description='Обеспечиваем проживание бригады',
            is_active=True,
            sort_order=1
        )
    
    def test_create_mounting_condition(self):
        """Тест создания условия для МП"""
        self.assertEqual(MountingCondition.objects.count(), 1)
        self.assertEqual(self.condition.name, 'Проживание')
        self.assertEqual(self.condition.description, 'Обеспечиваем проживание бригады')
        self.assertTrue(self.condition.is_active)
    
    def test_str_representation(self):
        """Тест строкового представления"""
        self.assertEqual(str(self.condition), 'Проживание')
    
    def test_defaults(self):
        """Тест значений по умолчанию"""
        condition = MountingCondition.objects.create(name='Тестовое условие')
        self.assertTrue(condition.is_active)
        self.assertEqual(condition.sort_order, 0)
        self.assertEqual(condition.description, '')


class TechnicalProposalTests(TestCase):
    """Тесты для модели TechnicalProposal"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.approver = User.objects.create_user(
            username='approver',
            password='testpass123'
        )
        
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='ООО "Тестовая компания"',
            short_name='ТестКом',
            inn='1234567890',
            tax_system=self.tax_system,
            director=self.user,
            director_name='Иванов Иван Иванович',
            director_position='Генеральный директор'
        )
        
        self.object = Object.objects.create(
            name='Тестовый объект',
            address='г. Москва, ул. Тестовая, д. 1'
        )
    
    def test_create_tkp(self):
        """Тест создания ТКП"""
        tkp = TechnicalProposal.objects.create(
            name='ТКП на монтаж',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        self.assertEqual(TechnicalProposal.objects.count(), 1)
        self.assertEqual(tkp.name, 'ТКП на монтаж')
        self.assertEqual(tkp.status, TechnicalProposal.Status.DRAFT)
        self.assertEqual(tkp.version_number, 1)
        self.assertIsNotNone(tkp.number)
        self.assertTrue(tkp.number.startswith('210_'))
    
    def test_automatic_number_generation(self):
        """Тест автоматической генерации номера"""
        tkp = TechnicalProposal.objects.create(
            name='ТКП 1',
            date=date(2025, 1, 15),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        self.assertIsNotNone(tkp.number)
        self.assertIn('15.01.25', tkp.number)
        
        # Второй ТКП должен иметь следующий номер
        tkp2 = TechnicalProposal.objects.create(
            name='ТКП 2',
            date=date(2025, 1, 15),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        self.assertNotEqual(tkp.number, tkp2.number)
    
    def test_properties(self):
        """Тест вычисляемых свойств"""
        tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            validity_days=30
        )
        
        # signatory
        self.assertEqual(tkp.signatory, self.user)
        self.assertEqual(tkp.signatory_name, 'Иванов Иван Иванович')
        self.assertEqual(tkp.signatory_position, 'Генеральный директор')
        
        # object_address
        self.assertEqual(tkp.object_address, 'г. Москва, ул. Тестовая, д. 1')
        
        # validity_date
        expected_date = date.today() + timedelta(days=30)
        self.assertEqual(tkp.validity_date, expected_date)
        
        # total_amount (пустой)
        self.assertEqual(tkp.total_amount, Decimal('0'))
        self.assertEqual(tkp.total_with_vat, Decimal('0'))
        self.assertEqual(tkp.total_profit, Decimal('0'))
        self.assertEqual(tkp.profit_percent, Decimal('0'))
        self.assertEqual(tkp.total_man_hours, Decimal('0'))
        
        # currency_rates (пустой)
        self.assertEqual(tkp.currency_rates, {'usd': None, 'eur': None, 'cny': None})
    
    def test_str_representation(self):
        """Тест строкового представления"""
        tkp = TechnicalProposal.objects.create(
            name='ТКП на монтаж',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            number='210_15.01.25'
        )
        
        self.assertIn('210_15.01.25', str(tkp))
        self.assertIn('ТКП на монтаж', str(tkp))
    
    def test_create_new_version(self):
        """Тест создания новой версии ТКП"""
        tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            advance_required='Аванс 30%',
            work_duration='2 месяца',
            validity_days=30,
            notes='Примечания',
            version_number=1
        )
        
        new_version = tkp.create_new_version()
        
        self.assertEqual(TechnicalProposal.objects.count(), 2)
        self.assertEqual(new_version.parent_version, tkp)
        self.assertEqual(new_version.version_number, 2)
        self.assertEqual(new_version.status, TechnicalProposal.Status.DRAFT)
        self.assertEqual(new_version.name, tkp.name)
        self.assertEqual(new_version.advance_required, tkp.advance_required)
        self.assertEqual(new_version.work_duration, tkp.work_duration)
        self.assertEqual(new_version.validity_days, tkp.validity_days)
        self.assertEqual(new_version.notes, tkp.notes)


class TechnicalProposalWithEstimatesTests(TestCase):
    """Тесты для ТКП со сметами"""
    
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpass123')
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='ООО "Тест"',
            short_name='Тест',
            inn='1234567890',
            tax_system=self.tax_system,
            director=self.user
        )
        self.object = Object.objects.create(name='Объект', address='Адрес')
        
        # Создаем смету с разделами и подразделами
        self.estimate = Estimate.objects.create(
            number='СМ-2025-001',
            name='Смета 1',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            with_vat=True,
            vat_rate=Decimal('20.00'),
            man_hours=Decimal('100.00'),
            usd_rate=Decimal('90.00'),
            eur_rate=Decimal('100.00'),
            cny_rate=Decimal('12.50')
        )
        
        self.section = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Раздел 1',
            sort_order=1
        )
        
        self.subsection = EstimateSubsection.objects.create(
            section=self.section,
            name='Подраздел 1',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('200000.00'),
            materials_purchase=Decimal('80000.00'),
            works_purchase=Decimal('150000.00'),
            sort_order=1
        )
        
        self.characteristic = EstimateCharacteristic.objects.create(
            estimate=self.estimate,
            name='Материалы',
            purchase_amount=Decimal('80000.00'),
            sale_amount=Decimal('100000.00'),
            sort_order=1
        )
        
        self.tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
    
    def test_copy_data_from_estimates(self):
        """Тест копирования данных из смет"""
        self.tkp.estimates.add(self.estimate)
        self.tkp.copy_data_from_estimates()
        
        # Проверяем, что разделы скопированы
        self.assertEqual(self.tkp.estimate_sections.count(), 1)
        tkp_section = self.tkp.estimate_sections.first()
        self.assertEqual(tkp_section.name, 'Раздел 1')
        self.assertEqual(tkp_section.source_estimate, self.estimate)
        self.assertEqual(tkp_section.source_section, self.section)
        
        # Проверяем, что подразделы скопированы
        self.assertEqual(tkp_section.subsections.count(), 1)
        tkp_subsection = tkp_section.subsections.first()
        self.assertEqual(tkp_subsection.name, 'Подраздел 1')
        self.assertEqual(tkp_subsection.materials_sale, Decimal('100000.00'))
        self.assertEqual(tkp_subsection.works_sale, Decimal('200000.00'))
        
        # Проверяем, что характеристики скопированы
        self.assertEqual(self.tkp.characteristics.count(), 1)
        tkp_char = self.tkp.characteristics.first()
        self.assertIn('Материалы', tkp_char.name)
        self.assertEqual(tkp_char.purchase_amount, Decimal('80000.00'))
        self.assertEqual(tkp_char.sale_amount, Decimal('100000.00'))
    
    def test_total_amount_calculation(self):
        """Тест расчета общей суммы"""
        self.tkp.estimates.add(self.estimate)
        self.tkp.copy_data_from_estimates()
        
        expected_total = Decimal('300000.00')  # 100000 + 200000
        self.assertEqual(self.tkp.total_amount, expected_total)
    
    def test_total_with_vat(self):
        """Тест расчета суммы с НДС"""
        self.tkp.estimates.add(self.estimate)
        self.tkp.copy_data_from_estimates()
        
        expected_total = Decimal('300000.00')
        expected_with_vat = expected_total * Decimal('1.20')  # +20% НДС
        self.assertEqual(self.tkp.total_with_vat, expected_with_vat)
    
    def test_total_profit(self):
        """Тест расчета прибыли"""
        self.tkp.estimates.add(self.estimate)
        self.tkp.copy_data_from_estimates()
        
        # Прибыль = продажа - закупка = 100000 - 80000 = 20000
        expected_profit = Decimal('20000.00')
        self.assertEqual(self.tkp.total_profit, expected_profit)
    
    def test_profit_percent(self):
        """Тест расчета процента прибыли"""
        self.tkp.estimates.add(self.estimate)
        self.tkp.copy_data_from_estimates()
        
        # Процент прибыли = (20000 / 100000) * 100 = 20%
        expected_percent = Decimal('20.00')
        self.assertEqual(self.tkp.profit_percent, expected_percent)
    
    def test_currency_rates(self):
        """Тест курсов валют"""
        self.tkp.estimates.add(self.estimate)
        
        rates = self.tkp.currency_rates
        self.assertEqual(rates['usd'], Decimal('90.00'))
        self.assertEqual(rates['eur'], Decimal('100.00'))
        self.assertEqual(rates['cny'], Decimal('12.50'))
    
    def test_total_man_hours(self):
        """Тест суммарных человеко-часов"""
        self.tkp.estimates.add(self.estimate)
        
        self.assertEqual(self.tkp.total_man_hours, Decimal('100.00'))
    
    def test_copy_data_clears_old_data(self):
        """Тест что копирование данных очищает старые данные"""
        # Создаем старые данные
        old_section = TKPEstimateSection.objects.create(
            tkp=self.tkp,
            name='Старый раздел',
            sort_order=0
        )
        old_char = TKPCharacteristic.objects.create(
            tkp=self.tkp,
            name='Старая характеристика',
            purchase_amount=Decimal('1000.00'),
            sale_amount=Decimal('2000.00'),
            sort_order=0
        )
        
        # Копируем данные из смет
        self.tkp.estimates.add(self.estimate)
        self.tkp.copy_data_from_estimates()
        
        # Старые данные должны быть удалены
        self.assertFalse(TKPEstimateSection.objects.filter(id=old_section.id).exists())
        self.assertFalse(TKPCharacteristic.objects.filter(id=old_char.id).exists())


class TKPEstimateSectionTests(TestCase):
    """Тесты для модели TKPEstimateSection"""
    
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpass123')
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='ООО "Тест"',
            short_name='Тест',
            inn='1234567890',
            tax_system=self.tax_system,
            director=self.user
        )
        self.object = Object.objects.create(name='Объект', address='Адрес')
        self.tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        self.estimate = Estimate.objects.create(
            number='СМ-2025-001',
            name='Смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        self.section = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Раздел',
            sort_order=1
        )
    
    def test_create_tkp_section(self):
        """Тест создания раздела ТКП"""
        tkp_section = TKPEstimateSection.objects.create(
            tkp=self.tkp,
            source_estimate=self.estimate,
            source_section=self.section,
            name='Раздел ТКП',
            sort_order=1
        )
        
        self.assertEqual(TKPEstimateSection.objects.count(), 1)
        self.assertEqual(tkp_section.tkp, self.tkp)
        self.assertEqual(tkp_section.name, 'Раздел ТКП')
    
    def test_total_sale_and_purchase(self):
        """Тест расчета суммы продажи и закупки"""
        tkp_section = TKPEstimateSection.objects.create(
            tkp=self.tkp,
            source_estimate=self.estimate,
            name='Раздел',
            sort_order=1
        )
        
        TKPEstimateSubsection.objects.create(
            section=tkp_section,
            name='Подраздел 1',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('50000.00'),
            materials_purchase=Decimal('80000.00'),
            works_purchase=Decimal('40000.00'),
            sort_order=1
        )
        
        TKPEstimateSubsection.objects.create(
            section=tkp_section,
            name='Подраздел 2',
            materials_sale=Decimal('200000.00'),
            works_sale=Decimal('100000.00'),
            materials_purchase=Decimal('150000.00'),
            works_purchase=Decimal('80000.00'),
            sort_order=2
        )
        
        expected_sale = Decimal('450000.00')  # 150000 + 300000
        expected_purchase = Decimal('350000.00')  # 120000 + 230000
        
        self.assertEqual(tkp_section.total_sale, expected_sale)
        self.assertEqual(tkp_section.total_purchase, expected_purchase)


class TKPEstimateSubsectionTests(TestCase):
    """Тесты для модели TKPEstimateSubsection"""
    
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpass123')
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='ООО "Тест"',
            short_name='Тест',
            inn='1234567890',
            tax_system=self.tax_system,
            director=self.user
        )
        self.object = Object.objects.create(name='Объект', address='Адрес')
        self.tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        self.section = TKPEstimateSection.objects.create(
            tkp=self.tkp,
            name='Раздел',
            sort_order=1
        )
    
    def test_create_tkp_subsection(self):
        """Тест создания подраздела ТКП"""
        subsection = TKPEstimateSubsection.objects.create(
            section=self.section,
            name='Подраздел',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('200000.00'),
            materials_purchase=Decimal('80000.00'),
            works_purchase=Decimal('150000.00'),
            sort_order=1
        )
        
        self.assertEqual(TKPEstimateSubsection.objects.count(), 1)
        self.assertEqual(subsection.section, self.section)
        self.assertEqual(subsection.total_sale, Decimal('300000.00'))
        self.assertEqual(subsection.total_purchase, Decimal('230000.00'))


class TKPCharacteristicTests(TestCase):
    """Тесты для модели TKPCharacteristic"""
    
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpass123')
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='ООО "Тест"',
            short_name='Тест',
            inn='1234567890',
            tax_system=self.tax_system,
            director=self.user
        )
        self.object = Object.objects.create(name='Объект', address='Адрес')
        self.tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
    
    def test_create_tkp_characteristic(self):
        """Тест создания характеристики ТКП"""
        char = TKPCharacteristic.objects.create(
            tkp=self.tkp,
            name='Материалы',
            purchase_amount=Decimal('100000.00'),
            sale_amount=Decimal('150000.00'),
            sort_order=1
        )
        
        self.assertEqual(TKPCharacteristic.objects.count(), 1)
        self.assertEqual(char.tkp, self.tkp)
        self.assertEqual(char.name, 'Материалы')


class TKPFrontOfWorkTests(TestCase):
    """Тесты для модели TKPFrontOfWork"""
    
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpass123')
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='ООО "Тест"',
            short_name='Тест',
            inn='1234567890',
            tax_system=self.tax_system,
            director=self.user
        )
        self.object = Object.objects.create(name='Объект', address='Адрес')
        self.tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        self.front_item = FrontOfWorkItem.objects.create(
            name='Подвести электричество',
            category='Электрика'
        )
    
    def test_create_tkp_front_of_work(self):
        """Тест создания фронта работ в ТКП"""
        front = TKPFrontOfWork.objects.create(
            tkp=self.tkp,
            front_item=self.front_item,
            when_text='До начала работ',
            when_date=date.today() + timedelta(days=7),
            sort_order=1
        )
        
        self.assertEqual(TKPFrontOfWork.objects.count(), 1)
        self.assertEqual(front.tkp, self.tkp)
        self.assertEqual(front.front_item, self.front_item)
        self.assertEqual(front.when_text, 'До начала работ')
    
    def test_unique_together_constraint(self):
        """Тест уникальности комбинации tkp и front_item"""
        TKPFrontOfWork.objects.create(
            tkp=self.tkp,
            front_item=self.front_item,
            sort_order=1
        )
        
        # Нельзя создать второй раз тот же пункт для того же ТКП
        with self.assertRaises(Exception):
            TKPFrontOfWork.objects.create(
                tkp=self.tkp,
                front_item=self.front_item,
                sort_order=2
            )


class MountingProposalTests(TestCase):
    """Тесты для модели MountingProposal"""
    
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpass123')
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='ООО "Тест"',
            short_name='Тест',
            inn='1234567890',
            tax_system=self.tax_system,
            director=self.user
        )
        self.object = Object.objects.create(name='Объект', address='Адрес')
        self.counterparty = Counterparty.objects.create(
            name='Исполнитель ООО',
            short_name='Исполнитель',
            inn='9876543210',
            type=Counterparty.Type.VENDOR,
            vendor_subtype=Counterparty.VendorSubtype.EXECUTOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            number='210_15.01.25'
        )
    
    def test_create_mp(self):
        """Тест создания МП"""
        mp = MountingProposal.objects.create(
            name='МП на монтаж',
            date=date.today(),
            object=self.object,
            counterparty=self.counterparty,
            parent_tkp=self.tkp,
            total_amount=Decimal('500000.00'),
            man_hours=Decimal('200.00'),
            created_by=self.user
        )
        
        self.assertEqual(MountingProposal.objects.count(), 1)
        self.assertEqual(mp.name, 'МП на монтаж')
        self.assertEqual(mp.status, MountingProposal.Status.DRAFT)
        self.assertEqual(mp.version_number, 1)
        self.assertIsNotNone(mp.number)
        self.assertTrue(mp.number.startswith('210_15.01.25-'))
    
    def test_mp_number_generation_with_parent(self):
        """Тест генерации номера МП с родительским ТКП"""
        mp1 = MountingProposal.objects.create(
            name='МП 1',
            date=date.today(),
            object=self.object,
            parent_tkp=self.tkp,
            created_by=self.user
        )
        
        mp2 = MountingProposal.objects.create(
            name='МП 2',
            date=date.today(),
            object=self.object,
            parent_tkp=self.tkp,
            created_by=self.user
        )
        
        self.assertTrue(mp1.number.startswith('210_15.01.25-01'))
        self.assertTrue(mp2.number.startswith('210_15.01.25-02'))
    
    def test_mp_number_generation_without_parent(self):
        """Тест генерации номера МП без родительского ТКП"""
        mp = MountingProposal.objects.create(
            name='Автономное МП',
            date=date(2025, 12, 14),
            object=self.object,
            created_by=self.user
        )
        
        self.assertTrue(mp.number.startswith('МП-2025-'))
    
    def test_mp_validation(self):
        """Тест валидации МП (counterparty должен быть vendor)"""
        customer = Counterparty.objects.create(
            name='Заказчик',
            short_name='Заказчик',
            inn='1111111111',
            type=Counterparty.Type.CUSTOMER,
            legal_form=Counterparty.LegalForm.OOO
        )
        
        mp = MountingProposal(
            name='МП',
            date=date.today(),
            object=self.object,
            counterparty=customer,  # Заказчик - не подходит
            created_by=self.user
        )
        
        with self.assertRaises(ValidationError):
            mp.clean()
    
    def test_create_from_tkp(self):
        """Тест создания МП из ТКП"""
        mp = MountingProposal.create_from_tkp(self.tkp, self.user)
        
        self.assertEqual(mp.parent_tkp, self.tkp)
        self.assertEqual(mp.object, self.tkp.object)
        self.assertIn(self.tkp.name, mp.name)
        self.assertEqual(mp.created_by, self.user)
    
    def test_create_new_version(self):
        """Тест создания новой версии МП"""
        condition = MountingCondition.objects.create(name='Проживание')
        
        mp = MountingProposal.objects.create(
            name='МП',
            date=date.today(),
            object=self.object,
            counterparty=self.counterparty,
            parent_tkp=self.tkp,
            total_amount=Decimal('500000.00'),
            man_hours=Decimal('200.00'),
            notes='Примечания',
            created_by=self.user,
            version_number=1
        )
        mp.conditions.add(condition)
        
        new_version = mp.create_new_version()
        
        self.assertEqual(MountingProposal.objects.count(), 2)
        self.assertEqual(new_version.parent_version, mp)
        self.assertEqual(new_version.version_number, 2)
        self.assertEqual(new_version.status, MountingProposal.Status.DRAFT)
        self.assertEqual(new_version.name, mp.name)
        self.assertEqual(new_version.total_amount, mp.total_amount)
        self.assertEqual(new_version.man_hours, mp.man_hours)
        self.assertEqual(new_version.notes, mp.notes)
        self.assertEqual(new_version.conditions.count(), 1)
        self.assertEqual(new_version.conditions.first(), condition)
    
    def test_copy_from_mounting_estimate(self):
        """Тест копирования данных из монтажной сметы"""
        from estimates.models import MountingEstimate
        
        mounting_estimate = MountingEstimate.objects.create(
            number='МС-2025-001',
            name='Монтажная смета',
            object=self.object,
            total_amount=Decimal('600000.00'),
            man_hours=Decimal('250.00'),
            created_by=self.user
        )
        
        mp = MountingProposal.objects.create(
            name='МП',
            date=date.today(),
            object=self.object,
            mounting_estimate=mounting_estimate,
            created_by=self.user
        )
        
        mp.copy_from_mounting_estimate()
        
        self.assertEqual(mp.total_amount, Decimal('600000.00'))
        self.assertEqual(mp.man_hours, Decimal('250.00'))


class NumberGenerationTests(TestCase):
    """Тесты для функций генерации номеров"""
    
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpass123')
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='ООО "Тест"',
            short_name='Тест',
            inn='1234567890',
            tax_system=self.tax_system,
            director=self.user
        )
        self.object = Object.objects.create(name='Объект', address='Адрес')
    
    def test_generate_tkp_number(self):
        """Тест генерации номера ТКП"""
        proposal_date = date(2025, 12, 15)
        number = generate_tkp_number(proposal_date)
        
        self.assertRegex(number, r'^210_\d{2}\.\d{2}\.\d{2}$')
        self.assertIn('15.12.25', number)
    
    def test_generate_tkp_number_sequential(self):
        """Тест последовательной генерации номеров ТКП"""
        proposal_date = date(2025, 12, 15)
        
        # Создаем первый ТКП
        tkp1 = TechnicalProposal.objects.create(
            name='ТКП 1',
            date=proposal_date,
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        # Второй ТКП должен иметь следующий номер
        tkp2 = TechnicalProposal.objects.create(
            name='ТКП 2',
            date=proposal_date,
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        num1 = int(tkp1.number.split('_')[0])
        num2 = int(tkp2.number.split('_')[0])
        self.assertEqual(num2, num1 + 1)
    
    def test_generate_mp_number_with_parent(self):
        """Тест генерации номера МП с родительским ТКП"""
        tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date(2025, 12, 15),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            number='210_15.12.25'
        )
        
        mp1 = MountingProposal.objects.create(
            name='МП 1',
            date=date.today(),
            object=self.object,
            parent_tkp=tkp,
            created_by=self.user
        )
        
        mp2 = MountingProposal.objects.create(
            name='МП 2',
            date=date.today(),
            object=self.object,
            parent_tkp=tkp,
            created_by=self.user
        )
        
        self.assertEqual(mp1.number, '210_15.12.25-01')
        self.assertEqual(mp2.number, '210_15.12.25-02')
    
    def test_generate_mp_number_without_parent(self):
        """Тест генерации номера МП без родительского ТКП"""
        proposal_date = date(2025, 12, 14)
        number = generate_mp_number(None, proposal_date)
        
        self.assertRegex(number, r'^МП-2025-\d{3}$')
        
        # Второй МП должен иметь следующий номер
        mp1 = MountingProposal.objects.create(
            name='МП 1',
            date=proposal_date,
            object=self.object,
            created_by=self.user,
            number=number
        )
        
        mp2 = MountingProposal.objects.create(
            name='МП 2',
            date=proposal_date,
            object=self.object,
            created_by=self.user
        )
        
        num1 = int(mp1.number.split('-')[-1])
        num2 = int(mp2.number.split('-')[-1])
        self.assertEqual(num2, num1 + 1)


class TechnicalProposalVersionTests(TestCase):
    """Тесты для версионирования ТКП"""
    
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpass123')
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='ООО "Тест"',
            short_name='Тест',
            inn='1234567890',
            tax_system=self.tax_system,
            director=self.user
        )
        self.object = Object.objects.create(name='Объект', address='Адрес')
        
        # Создаем ТКП с данными
        self.tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            version_number=1
        )
        
        # Создаем фронт работ
        self.front_item = FrontOfWorkItem.objects.create(name='Электрика')
        TKPFrontOfWork.objects.create(
            tkp=self.tkp,
            front_item=self.front_item,
            when_text='До начала',
            sort_order=1
        )
    
    def test_version_copies_all_data(self):
        """Тест что версия копирует все данные"""
        # Создаем раздел и подраздел
        section = TKPEstimateSection.objects.create(
            tkp=self.tkp,
            name='Раздел',
            sort_order=1
        )
        TKPEstimateSubsection.objects.create(
            section=section,
            name='Подраздел',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('200000.00'),
            sort_order=1
        )
        
        # Создаем характеристику
        TKPCharacteristic.objects.create(
            tkp=self.tkp,
            name='Характеристика',
            purchase_amount=Decimal('50000.00'),
            sale_amount=Decimal('100000.00'),
            sort_order=1
        )
        
        new_version = self.tkp.create_new_version()
        
        # Проверяем копирование разделов
        self.assertEqual(new_version.estimate_sections.count(), 1)
        new_section = new_version.estimate_sections.first()
        self.assertEqual(new_section.name, 'Раздел')
        self.assertEqual(new_section.subsections.count(), 1)
        
        # Проверяем копирование характеристик
        self.assertEqual(new_version.characteristics.count(), 1)
        new_char = new_version.characteristics.first()
        self.assertEqual(new_char.name, 'Характеристика')
        
        # Проверяем копирование фронта работ
        self.assertEqual(new_version.front_of_work.count(), 1)
        new_front = new_version.front_of_work.first()
        self.assertEqual(new_front.front_item, self.front_item)
        self.assertEqual(new_front.when_text, 'До начала')
    
    def test_projects_property(self):
        """Тест свойства projects"""
        from estimates.models import Project
        from django.core.files.uploadedfile import SimpleUploadedFile
        
        # Создаем временный файл для проекта
        test_file = SimpleUploadedFile('test.zip', b'fake zip content')
        
        # Создаем проект
        project = Project.objects.create(
            cipher='П-001',
            name='Проект 1',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=test_file
        )
        
        # Создаем смету с проектом
        estimate = Estimate.objects.create(
            number='СМ-2025-001',
            name='Смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        estimate.projects.add(project)
        
        # Привязываем смету к ТКП
        self.tkp.estimates.add(estimate)
        
        # Проверяем projects
        projects = list(self.tkp.projects)
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0], project)
    
    def test_str_methods(self):
        """Тест всех __str__ методов"""
        # TKPEstimateSection
        section = TKPEstimateSection.objects.create(
            tkp=self.tkp,
            name='Раздел',
            sort_order=1
        )
        self.assertIn('Раздел', str(section))
        
        # TKPEstimateSubsection
        subsection = TKPEstimateSubsection.objects.create(
            section=section,
            name='Подраздел',
            sort_order=1
        )
        self.assertIn('Подраздел', str(subsection))
        
        # TKPCharacteristic
        char = TKPCharacteristic.objects.create(
            tkp=self.tkp,
            name='Характеристика',
            purchase_amount=Decimal('1000.00'),
            sale_amount=Decimal('2000.00'),
            sort_order=1
        )
        self.assertIn('Характеристика', str(char))
        
        # TKPFrontOfWork
        front_item = FrontOfWorkItem.objects.create(name='Электрика')
        front = TKPFrontOfWork.objects.create(
            tkp=self.tkp,
            front_item=front_item,
            sort_order=1
        )
        self.assertIn('Электрика', str(front))
        
        # MountingProposal
        counterparty = Counterparty.objects.create(
            name='Исполнитель',
            short_name='Исполнитель',
            inn='1111111111',
            type=Counterparty.Type.VENDOR,
            vendor_subtype=Counterparty.VendorSubtype.EXECUTOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        mp = MountingProposal.objects.create(
            name='МП',
            date=date.today(),
            object=self.object,
            counterparty=counterparty,
            created_by=self.user,
            number='МП-2025-001'
        )
        self.assertIn('МП-2025-001', str(mp))
        self.assertIn('МП', str(mp))
    
    def test_file_path_functions(self):
        """Тест функций генерации путей файлов"""
        from .models import tkp_file_path, mp_file_path
        
        # Создаем экземпляры для тестирования путей
        tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            number='210_15.12.25'
        )
        
        counterparty = Counterparty.objects.create(
            name='Исполнитель',
            short_name='Исп',
            inn='1111111111',
            type=Counterparty.Type.VENDOR,
            vendor_subtype=Counterparty.VendorSubtype.EXECUTOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        
        mp = MountingProposal.objects.create(
            name='МП',
            date=date.today(),
            object=self.object,
            counterparty=counterparty,
            created_by=self.user,
            number='210_15.12.25-01'
        )
        
        # Тестируем пути
        tkp_path = tkp_file_path(tkp, 'test.pdf')
        self.assertIn(f'proposals/tkp/{tkp.object.id}/{tkp.number}/', tkp_path)
        
        mp_path = mp_file_path(mp, 'test.pdf')
        self.assertIn(f'proposals/mp/{mp.object.id}/{mp.number}/', mp_path)
    
    def test_versions_with_multiple_parents(self):
        """Тест версий с несколькими уровнями родительских версий"""
        # Создаем цепочку версий: v1 -> v2 -> v3
        v1 = TechnicalProposal.objects.create(
            name='ТКП v1',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            version_number=1
        )
        
        v2 = v1.create_new_version()
        v3 = v2.create_new_version()
        
        # Проверяем цепочку
        self.assertEqual(v2.parent_version, v1)
        self.assertEqual(v3.parent_version, v2)
        self.assertEqual(v1.child_versions.count(), 1)
        self.assertEqual(v2.child_versions.count(), 1)
        
        # Проверяем номера версий
        self.assertEqual(v1.version_number, 1)
        self.assertEqual(v2.version_number, 2)
        self.assertEqual(v3.version_number, 3)
