from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIRequestFactory

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
from .serializers import (
    FrontOfWorkItemSerializer,
    MountingConditionSerializer,
    TechnicalProposalListSerializer,
    TechnicalProposalDetailSerializer,
    TKPEstimateSectionSerializer,
    TKPEstimateSubsectionSerializer,
    TKPCharacteristicSerializer,
    TKPFrontOfWorkSerializer,
    MountingProposalListSerializer,
    MountingProposalDetailSerializer,
    TechnicalProposalAddEstimatesSerializer,
    TechnicalProposalRemoveEstimatesSerializer,
)


class BaseSerializerTestCase(TestCase):
    """Базовый класс для тестов сериализаторов"""
    
    def setUp(self):
        self.factory = APIRequestFactory()
        self.request = self.factory.get('/')
        
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123',
            first_name='Иван',
            last_name='Иванов'
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
        
        self.counterparty = Counterparty.objects.create(
            name='Исполнитель ООО',
            short_name='Исполнитель',
            inn='9876543210',
            type=Counterparty.Type.VENDOR,
            vendor_subtype=Counterparty.VendorSubtype.EXECUTOR,
            legal_form=Counterparty.LegalForm.OOO
        )


class FrontOfWorkItemSerializerTests(BaseSerializerTestCase):
    """Тесты для FrontOfWorkItemSerializer"""
    
    def test_serialize(self):
        """Тест сериализации"""
        item = FrontOfWorkItem.objects.create(
            name='Электрика',
            category='Электрика',
            is_active=True,
            sort_order=1
        )
        serializer = FrontOfWorkItemSerializer(item)
        
        self.assertEqual(serializer.data['name'], 'Электрика')
        self.assertEqual(serializer.data['category'], 'Электрика')
        self.assertTrue(serializer.data['is_active'])
    
    def test_deserialize(self):
        """Тест десериализации"""
        data = {
            'name': 'Новый пункт',
            'category': 'Строительство',
            'is_active': True,
            'sort_order': 2
        }
        serializer = FrontOfWorkItemSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        
        item = serializer.save()
        self.assertEqual(item.name, 'Новый пункт')
        self.assertEqual(item.category, 'Строительство')


class MountingConditionSerializerTests(BaseSerializerTestCase):
    """Тесты для MountingConditionSerializer"""
    
    def test_serialize(self):
        """Тест сериализации"""
        condition = MountingCondition.objects.create(
            name='Проживание',
            description='Описание',
            is_active=True
        )
        serializer = MountingConditionSerializer(condition)
        
        self.assertEqual(serializer.data['name'], 'Проживание')
        self.assertEqual(serializer.data['description'], 'Описание')
    
    def test_deserialize(self):
        """Тест десериализации"""
        data = {
            'name': 'Питание',
            'description': 'Организация питания',
            'is_active': True
        }
        serializer = MountingConditionSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        
        condition = serializer.save()
        self.assertEqual(condition.name, 'Питание')


class TechnicalProposalSerializerTests(BaseSerializerTestCase):
    """Тесты для TechnicalProposal сериализаторов"""
    
    def setUp(self):
        super().setUp()
        self.tkp = TechnicalProposal.objects.create(
            name='ТКП на монтаж',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            number='210_15.12.25',
            object_area=500,
            validity_days=30
        )
        
        self.estimate = Estimate.objects.create(
            number='СМ-2025-001',
            name='Смета 1',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            with_vat=True,
            vat_rate=Decimal('20.00'),
            man_hours=Decimal('100.00')
        )
    
    def test_list_serializer(self):
        """Тест сериализатора списка"""
        serializer = TechnicalProposalListSerializer(
            self.tkp,
            context={'request': self.request}
        )
        data = serializer.data
        
        self.assertEqual(data['name'], 'ТКП на монтаж')
        self.assertEqual(data['object_name'], 'Тестовый объект')
        self.assertEqual(data['object_address'], 'г. Москва, ул. Тестовая, д. 1')
        self.assertEqual(data['legal_entity_name'], 'ТестКом')
        self.assertIn('total_amount', data)
        self.assertIn('validity_date', data)
    
    def test_detail_serializer(self):
        """Тест детального сериализатора"""
        # Добавляем смету и копируем данные
        self.tkp.estimates.add(self.estimate)
        self.tkp.copy_data_from_estimates()
        
        serializer = TechnicalProposalDetailSerializer(
            self.tkp,
            context={'request': self.request}
        )
        data = serializer.data
        
        self.assertEqual(data['name'], 'ТКП на монтаж')
        self.assertIn('estimate_sections', data)
        self.assertIn('characteristics', data)
        self.assertIn('front_of_work', data)
        self.assertEqual(data['signatory_name'], 'Иванов Иван Иванович')
        self.assertEqual(data['signatory_position'], 'Генеральный директор')
        self.assertIn('total_amount', data)
        self.assertIn('total_with_vat', data)
        self.assertIn('total_profit', data)
        self.assertIn('profit_percent', data)
        self.assertIn('total_man_hours', data)
        self.assertIn('currency_rates', data)
        self.assertIn('versions_count', data)
    
    def test_detail_serializer_with_approvals(self):
        """Тест сериализатора с утверждениями"""
        approver = User.objects.create_user(
            username='approver',
            first_name='Петр',
            last_name='Петров'
        )
        self.tkp.checked_by = self.user
        self.tkp.approved_by = approver
        self.tkp.approved_at = timezone.now()
        self.tkp.save()
        
        serializer = TechnicalProposalDetailSerializer(
            self.tkp,
            context={'request': self.request}
        )
        data = serializer.data
        
        self.assertIsNotNone(data['checked_by_name'])
        self.assertIsNotNone(data['approved_by_name'])
        self.assertIsNotNone(data['approved_at'])


class TKPEstimateSectionSerializerTests(BaseSerializerTestCase):
    """Тесты для TKPEstimateSectionSerializer"""
    
    def setUp(self):
        super().setUp()
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
        
        # Создаем подразделы
        TKPEstimateSubsection.objects.create(
            section=self.section,
            name='Подраздел 1',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('200000.00'),
            materials_purchase=Decimal('80000.00'),
            works_purchase=Decimal('150000.00'),
            sort_order=1
        )
    
    def test_serialize_with_subsections(self):
        """Тест сериализации раздела с подразделами"""
        serializer = TKPEstimateSectionSerializer(self.section)
        data = serializer.data
        
        self.assertEqual(data['name'], 'Раздел')
        self.assertIn('subsections', data)
        self.assertEqual(len(data['subsections']), 1)
        self.assertIn('total_sale', data)
        self.assertIn('total_purchase', data)
        # DRF сериализует Decimal в строку
        self.assertEqual(Decimal(data['total_sale']), Decimal('300000.00'))


class TKPEstimateSubsectionSerializerTests(BaseSerializerTestCase):
    """Тесты для TKPEstimateSubsectionSerializer"""
    
    def setUp(self):
        super().setUp()
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
        self.subsection = TKPEstimateSubsection.objects.create(
            section=self.section,
            name='Подраздел',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('200000.00'),
            materials_purchase=Decimal('80000.00'),
            works_purchase=Decimal('150000.00'),
            sort_order=1
        )
    
    def test_serialize_with_totals(self):
        """Тест сериализации с вычисляемыми полями"""
        serializer = TKPEstimateSubsectionSerializer(self.subsection)
        data = serializer.data
        
        self.assertEqual(data['name'], 'Подраздел')
        self.assertIn('total_sale', data)
        self.assertIn('total_purchase', data)
        # DRF сериализует Decimal в строку
        self.assertEqual(Decimal(data['total_sale']), Decimal('300000.00'))
        self.assertEqual(Decimal(data['total_purchase']), Decimal('230000.00'))


class TKPCharacteristicSerializerTests(BaseSerializerTestCase):
    """Тесты для TKPCharacteristicSerializer"""
    
    def setUp(self):
        super().setUp()
        self.tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        self.characteristic = TKPCharacteristic.objects.create(
            tkp=self.tkp,
            name='Материалы',
            purchase_amount=Decimal('100000.00'),
            sale_amount=Decimal('150000.00'),
            sort_order=1
        )
    
    def test_serialize(self):
        """Тест сериализации"""
        serializer = TKPCharacteristicSerializer(self.characteristic)
        data = serializer.data
        
        self.assertEqual(data['name'], 'Материалы')
        self.assertEqual(data['purchase_amount'], '100000.00')
        self.assertEqual(data['sale_amount'], '150000.00')
    
    def test_deserialize(self):
        """Тест десериализации"""
        data = {
            'tkp': self.tkp.id,
            'name': 'Работы',
            'purchase_amount': '80000.00',
            'sale_amount': '120000.00',
            'sort_order': 2
        }
        serializer = TKPCharacteristicSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        
        char = serializer.save()
        self.assertEqual(char.name, 'Работы')
        self.assertEqual(char.purchase_amount, Decimal('80000.00'))


class TKPFrontOfWorkSerializerTests(BaseSerializerTestCase):
    """Тесты для TKPFrontOfWorkSerializer"""
    
    def setUp(self):
        super().setUp()
        self.tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        self.front_item = FrontOfWorkItem.objects.create(
            name='Электрика',
            category='Электрика'
        )
        self.tkp_front = TKPFrontOfWork.objects.create(
            tkp=self.tkp,
            front_item=self.front_item,
            when_text='До начала работ',
            when_date=date.today() + timedelta(days=7),
            sort_order=1
        )
    
    def test_serialize(self):
        """Тест сериализации"""
        serializer = TKPFrontOfWorkSerializer(self.tkp_front)
        data = serializer.data
        
        self.assertEqual(data['front_item_name'], 'Электрика')
        self.assertEqual(data['front_item_category'], 'Электрика')
        self.assertEqual(data['when_text'], 'До начала работ')
        self.assertIn('when_date', data)


class MountingProposalSerializerTests(BaseSerializerTestCase):
    """Тесты для MountingProposal сериализаторов"""
    
    def setUp(self):
        super().setUp()
        self.tkp = TechnicalProposal.objects.create(
            name='ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            number='210_15.12.25'
        )
        
        self.mp = MountingProposal.objects.create(
            name='МП на монтаж',
            date=date.today(),
            object=self.object,
            counterparty=self.counterparty,
            parent_tkp=self.tkp,
            total_amount=Decimal('500000.00'),
            man_hours=Decimal('200.00'),
            created_by=self.user,
            number='210_15.12.25-01'
        )
        
        self.condition = MountingCondition.objects.create(name='Проживание')
        self.mp.conditions.add(self.condition)
    
    def test_list_serializer(self):
        """Тест сериализатора списка"""
        serializer = MountingProposalListSerializer(
            self.mp,
            context={'request': self.request}
        )
        data = serializer.data
        
        self.assertEqual(data['name'], 'МП на монтаж')
        self.assertEqual(data['object_name'], 'Тестовый объект')
        self.assertEqual(data['counterparty_name'], 'Исполнитель')
        self.assertEqual(data['parent_tkp_number'], '210_15.12.25')
        self.assertIn('created_by_name', data)
    
    def test_detail_serializer(self):
        """Тест детального сериализатора"""
        serializer = MountingProposalDetailSerializer(
            self.mp,
            context={'request': self.request}
        )
        data = serializer.data
        
        self.assertEqual(data['name'], 'МП на монтаж')
        self.assertIn('conditions', data)
        self.assertEqual(len(data['conditions']), 1)
        self.assertEqual(data['conditions'][0]['name'], 'Проживание')
        self.assertIn('versions_count', data)
    
    def test_file_url_without_request(self):
        """Тест file_url без request в контексте"""
        # Создаем ТКП без файла
        serializer = TechnicalProposalDetailSerializer(self.tkp)
        data = serializer.data
        self.assertIsNone(data['file_url'])
        
        # Тест для МП
        mp_serializer = MountingProposalDetailSerializer(self.mp)
        mp_data = mp_serializer.data
        self.assertIsNone(mp_data['file_url'])
    
    def test_detail_serializer_with_conditions(self):
        """Тест сериализатора с условиями через conditions_ids"""
        data = {
            'name': 'МП',
            'date': '2025-12-20',
            'object': self.object.id,
            'counterparty': self.counterparty.id,
            'total_amount': '600000.00',
            'conditions_ids': [self.condition.id]
        }
        serializer = MountingProposalDetailSerializer(data=data)
        # Валидация должна пройти
        self.assertTrue(serializer.is_valid())


class TechnicalProposalActionSerializerTests(BaseSerializerTestCase):
    """Тесты для сериализаторов действий ТКП"""
    
    def test_add_estimates_serializer(self):
        """Тест сериализатора добавления смет"""
        data = {
            'estimate_ids': [1, 2, 3],
            'copy_data': True
        }
        serializer = TechnicalProposalAddEstimatesSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['estimate_ids'], [1, 2, 3])
        self.assertTrue(serializer.validated_data['copy_data'])
    
    def test_add_estimates_serializer_default_copy_data(self):
        """Тест дефолтного значения copy_data"""
        data = {
            'estimate_ids': [1, 2]
        }
        serializer = TechnicalProposalAddEstimatesSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        self.assertTrue(serializer.validated_data['copy_data'])
    
    def test_remove_estimates_serializer(self):
        """Тест сериализатора удаления смет"""
        data = {
            'estimate_ids': [1, 2]
        }
        serializer = TechnicalProposalRemoveEstimatesSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['estimate_ids'], [1, 2])
