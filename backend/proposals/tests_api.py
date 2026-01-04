from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

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


class BaseAPITestCase(TestCase):
    """Базовый класс для API тестов"""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123',
            email='test@example.com'
        )
        self.client.force_authenticate(user=self.user)
        
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


class FrontOfWorkItemAPITests(BaseAPITestCase):
    """Тесты API для FrontOfWorkItem"""
    
    def setUp(self):
        super().setUp()
        self.item = FrontOfWorkItem.objects.create(
            name='Подвести электричество',
            category='Электрика',
            is_active=True,
            sort_order=1
        )
    
    def test_list_front_of_work_items(self):
        """Тест получения списка пунктов фронта работ"""
        url = reverse('front-of-work-item-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['name'], 'Подвести электричество')
    
    def test_create_front_of_work_item(self):
        """Тест создания пункта фронта работ"""
        url = reverse('front-of-work-item-list')
        data = {
            'name': 'Новый пункт',
            'category': 'Строительство',
            'is_active': True,
            'sort_order': 2
        }
        response = self.client.post(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(FrontOfWorkItem.objects.count(), 2)
        self.assertEqual(response.data['name'], 'Новый пункт')
    
    def test_retrieve_front_of_work_item(self):
        """Тест получения детальной информации"""
        url = reverse('front-of-work-item-detail', kwargs={'pk': self.item.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Подвести электричество')
    
    def test_update_front_of_work_item(self):
        """Тест обновления пункта"""
        url = reverse('front-of-work-item-detail', kwargs={'pk': self.item.pk})
        data = {'name': 'Обновленное название'}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.item.refresh_from_db()
        self.assertEqual(self.item.name, 'Обновленное название')
    
    def test_delete_front_of_work_item(self):
        """Тест удаления пункта"""
        url = reverse('front-of-work-item-detail', kwargs={'pk': self.item.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(FrontOfWorkItem.objects.count(), 0)
    
    def test_filter_by_category(self):
        """Тест фильтрации по категории"""
        FrontOfWorkItem.objects.create(
            name='Другой пункт',
            category='Строительство',
            is_active=True
        )
        
        url = reverse('front-of-work-item-list')
        response = self.client.get(url, {'category': 'Электрика'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['category'], 'Электрика')


class MountingConditionAPITests(BaseAPITestCase):
    """Тесты API для MountingCondition"""
    
    def setUp(self):
        super().setUp()
        self.condition = MountingCondition.objects.create(
            name='Проживание',
            description='Обеспечиваем проживание',
            is_active=True,
            sort_order=1
        )
    
    def test_list_mounting_conditions(self):
        """Тест получения списка условий"""
        url = reverse('mounting-condition-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
    
    def test_create_mounting_condition(self):
        """Тест создания условия"""
        url = reverse('mounting-condition-list')
        data = {
            'name': 'Питание',
            'description': 'Организация питания',
            'is_active': True
        }
        response = self.client.post(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(MountingCondition.objects.count(), 2)
    
    def test_retrieve_mounting_condition(self):
        """Тест получения детальной информации"""
        url = reverse('mounting-condition-detail', kwargs={'pk': self.condition.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Проживание')


class TechnicalProposalAPITests(BaseAPITestCase):
    """Тесты API для TechnicalProposal"""
    
    def setUp(self):
        super().setUp()
        self.tkp = TechnicalProposal.objects.create(
            name='ТКП на монтаж',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            number='210_15.12.25'
        )
        
        self.estimate = Estimate.objects.create(
            number='СМ-2025-001',
            name='Смета 1',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
    
    def test_list_technical_proposals(self):
        """Тест получения списка ТКП"""
        url = reverse('technical-proposal-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['name'], 'ТКП на монтаж')
    
    def test_create_technical_proposal(self):
        """Тест создания ТКП"""
        url = reverse('technical-proposal-list')
        data = {
            'name': 'Новое ТКП',
            'date': '2025-12-20',
            'object': self.object.id,
            'legal_entity': self.legal_entity.id,
            'validity_days': 30,
            'status': 'draft'
        }
        response = self.client.post(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TechnicalProposal.objects.count(), 2)
        self.assertIsNotNone(response.data['number'])
    
    def test_retrieve_technical_proposal(self):
        """Тест получения детальной информации ТКП"""
        url = reverse('technical-proposal-detail', kwargs={'pk': self.tkp.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'ТКП на монтаж')
        self.assertIn('estimate_sections', response.data)
        self.assertIn('characteristics', response.data)
        self.assertIn('front_of_work', response.data)
    
    def test_update_technical_proposal(self):
        """Тест обновления ТКП"""
        url = reverse('technical-proposal-detail', kwargs={'pk': self.tkp.pk})
        data = {
            'name': 'Обновленное ТКП',
            'status': 'in_progress'
        }
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.tkp.refresh_from_db()
        self.assertEqual(self.tkp.name, 'Обновленное ТКП')
        self.assertEqual(self.tkp.status, 'in_progress')
    
    def test_add_estimates(self):
        """Тест добавления смет к ТКП"""
        url = reverse('technical-proposal-add-estimates', kwargs={'pk': self.tkp.pk})
        data = {
            'estimate_ids': [self.estimate.id],
            'copy_data': True
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.tkp.refresh_from_db()
        self.assertEqual(self.tkp.estimates.count(), 1)
        self.assertIn('message', response.data)
    
    def test_remove_estimates(self):
        """Тест удаления смет из ТКП"""
        self.tkp.estimates.add(self.estimate)
        
        url = reverse('technical-proposal-remove-estimates', kwargs={'pk': self.tkp.pk})
        data = {
            'estimate_ids': [self.estimate.id]
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.tkp.refresh_from_db()
        self.assertEqual(self.tkp.estimates.count(), 0)
    
    def test_copy_from_estimates(self):
        """Тест копирования данных из смет"""
        self.tkp.estimates.add(self.estimate)
        
        # Создаем раздел в смете
        section = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Раздел',
            sort_order=1
        )
        EstimateSubsection.objects.create(
            section=section,
            name='Подраздел',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('200000.00'),
            sort_order=1
        )
        
        url = reverse('technical-proposal-copy-from-estimates', kwargs={'pk': self.tkp.pk})
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.tkp.estimate_sections.count(), 1)
    
    def test_create_version(self):
        """Тест создания новой версии ТКП"""
        url = reverse('technical-proposal-create-version', kwargs={'pk': self.tkp.pk})
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TechnicalProposal.objects.count(), 2)
        new_version = TechnicalProposal.objects.get(id=response.data['id'])
        self.assertEqual(new_version.parent_version, self.tkp)
        self.assertEqual(new_version.version_number, 2)
    
    def test_create_mp_from_tkp(self):
        """Тест создания МП из ТКП"""
        url = reverse('technical-proposal-create-mp', kwargs={'pk': self.tkp.pk})
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(MountingProposal.objects.count(), 1)
        mp = MountingProposal.objects.first()
        self.assertEqual(mp.parent_tkp, self.tkp)
        self.assertIn(self.tkp.name, mp.name)
    
    def test_get_versions(self):
        """Тест получения истории версий"""
        new_version = self.tkp.create_new_version()
        
        url = reverse('technical-proposal-versions', kwargs={'pk': self.tkp.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
    
    def test_get_versions_with_chain(self):
        """Тест получения истории версий с цепочкой"""
        # Создаем цепочку: v1 -> v2 -> v3
        v2 = self.tkp.create_new_version()
        v3 = v2.create_new_version()
        
        url = reverse('technical-proposal-versions', kwargs={'pk': v2.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Должно вернуть все 3 версии
        self.assertEqual(len(response.data), 3)
        
        # Проверяем порядок (предки должны быть первыми)
        self.assertEqual(response.data[0]['id'], self.tkp.id)
        self.assertEqual(response.data[1]['id'], v2.id)
        self.assertEqual(response.data[2]['id'], v3.id)
    
    def test_filter_by_status(self):
        """Тест фильтрации по статусу"""
        TechnicalProposal.objects.create(
            name='Другое ТКП',
            date=date.today(),
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            status='approved'
        )
        
        url = reverse('technical-proposal-list')
        response = self.client.get(url, {'status': 'draft'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['status'], 'draft')
    
    def test_search_by_number(self):
        """Тест поиска по номеру"""
        url = reverse('technical-proposal-list')
        response = self.client.get(url, {'search': '210'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)


class MountingProposalAPITests(BaseAPITestCase):
    """Тесты API для MountingProposal"""
    
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
    
    def test_list_mounting_proposals(self):
        """Тест получения списка МП"""
        url = reverse('mounting-proposal-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['name'], 'МП на монтаж')
    
    def test_create_mounting_proposal(self):
        """Тест создания МП"""
        url = reverse('mounting-proposal-list')
        data = {
            'name': 'Новое МП',
            'date': '2025-12-20',
            'object': self.object.id,
            'counterparty': self.counterparty.id,
            'parent_tkp': self.tkp.id,
            'total_amount': '600000.00',
            'man_hours': '250.00',
            'status': 'draft'
        }
        response = self.client.post(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(MountingProposal.objects.count(), 2)
        self.assertIsNotNone(response.data['number'])
    
    def test_retrieve_mounting_proposal(self):
        """Тест получения детальной информации МП"""
        url = reverse('mounting-proposal-detail', kwargs={'pk': self.mp.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'МП на монтаж')
        self.assertIn('conditions', response.data)
    
    def test_update_mounting_proposal(self):
        """Тест обновления МП"""
        url = reverse('mounting-proposal-detail', kwargs={'pk': self.mp.pk})
        data = {
            'name': 'Обновленное МП',
            'status': 'published',
            'conditions_ids': [self.condition.id]
        }
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mp.refresh_from_db()
        self.assertEqual(self.mp.name, 'Обновленное МП')
        self.assertEqual(self.mp.conditions.count(), 1)
    
    def test_create_version(self):
        """Тест создания новой версии МП"""
        url = reverse('mounting-proposal-create-version', kwargs={'pk': self.mp.pk})
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(MountingProposal.objects.count(), 2)
        new_version = MountingProposal.objects.get(id=response.data['id'])
        self.assertEqual(new_version.parent_version, self.mp)
        self.assertEqual(new_version.version_number, 2)
    
    def test_mark_telegram_published(self):
        """Тест отметки публикации в Telegram"""
        url = reverse('mounting-proposal-mark-telegram-published', kwargs={'pk': self.mp.pk})
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mp.refresh_from_db()
        self.assertTrue(self.mp.telegram_published)
        self.assertIsNotNone(self.mp.telegram_published_at)
    
    def test_get_versions(self):
        """Тест получения истории версий"""
        new_version = self.mp.create_new_version()
        
        url = reverse('mounting-proposal-versions', kwargs={'pk': self.mp.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
    
    def test_get_versions_with_chain(self):
        """Тест получения истории версий МП с цепочкой"""
        # Создаем цепочку: v1 -> v2 -> v3
        v2 = self.mp.create_new_version()
        v3 = v2.create_new_version()
        
        url = reverse('mounting-proposal-versions', kwargs={'pk': v2.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Должно вернуть все 3 версии
        self.assertEqual(len(response.data), 3)
    
    def test_filter_by_parent_tkp(self):
        """Тест фильтрации по родительскому ТКП"""
        url = reverse('mounting-proposal-list')
        response = self.client.get(url, {'parent_tkp': self.tkp.id})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)


class TKPEstimateSectionAPITests(BaseAPITestCase):
    """Тесты API для TKPEstimateSection"""
    
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
            name='Раздел ТКП',
            sort_order=1
        )
    
    def test_list_tkp_sections(self):
        """Тест получения списка разделов"""
        url = reverse('tkp-section-list')
        response = self.client.get(url, {'tkp': self.tkp.id})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
    
    def test_update_tkp_section(self):
        """Тест обновления раздела"""
        url = reverse('tkp-section-detail', kwargs={'pk': self.section.pk})
        data = {'name': 'Обновленный раздел'}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.section.refresh_from_db()
        self.assertEqual(self.section.name, 'Обновленный раздел')


class TKPEstimateSubsectionAPITests(BaseAPITestCase):
    """Тесты API для TKPEstimateSubsection"""
    
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
            sort_order=1
        )
    
    def test_list_tkp_subsections(self):
        """Тест получения списка подразделов"""
        url = reverse('tkp-subsection-list')
        response = self.client.get(url, {'section': self.section.id})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
    
    def test_update_tkp_subsection(self):
        """Тест обновления подраздела"""
        url = reverse('tkp-subsection-detail', kwargs={'pk': self.subsection.pk})
        data = {
            'materials_sale': '150000.00',
            'works_sale': '250000.00'
        }
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.subsection.refresh_from_db()
        self.assertEqual(self.subsection.materials_sale, Decimal('150000.00'))


class TKPCharacteristicAPITests(BaseAPITestCase):
    """Тесты API для TKPCharacteristic"""
    
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
    
    def test_list_tkp_characteristics(self):
        """Тест получения списка характеристик"""
        url = reverse('tkp-characteristic-list')
        response = self.client.get(url, {'tkp': self.tkp.id})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
    
    def test_create_tkp_characteristic(self):
        """Тест создания характеристики"""
        url = reverse('tkp-characteristic-list')
        data = {
            'tkp': self.tkp.id,
            'name': 'Работы',
            'purchase_amount': '80000.00',
            'sale_amount': '120000.00',
            'sort_order': 2
        }
        response = self.client.post(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TKPCharacteristic.objects.count(), 2)
    
    def test_update_tkp_characteristic(self):
        """Тест обновления характеристики"""
        url = reverse('tkp-characteristic-detail', kwargs={'pk': self.characteristic.pk})
        data = {'sale_amount': '180000.00'}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.characteristic.refresh_from_db()
        self.assertEqual(self.characteristic.sale_amount, Decimal('180000.00'))


class TKPFrontOfWorkAPITests(BaseAPITestCase):
    """Тесты API для TKPFrontOfWork"""
    
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
    
    def test_list_tkp_front_of_work(self):
        """Тест получения списка фронта работ"""
        url = reverse('tkp-front-of-work-list')
        response = self.client.get(url, {'tkp': self.tkp.id})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
    
    def test_create_tkp_front_of_work(self):
        """Тест создания фронта работ"""
        new_item = FrontOfWorkItem.objects.create(name='Строительство')
        url = reverse('tkp-front-of-work-list')
        data = {
            'tkp': self.tkp.id,
            'front_item': new_item.id,
            'when_text': 'В процессе работ',
            'sort_order': 2
        }
        response = self.client.post(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TKPFrontOfWork.objects.count(), 2)
    
    def test_update_tkp_front_of_work(self):
        """Тест обновления фронта работ"""
        url = reverse('tkp-front-of-work-detail', kwargs={'pk': self.tkp_front.pk})
        data = {'when_text': 'После начала работ'}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.tkp_front.refresh_from_db()
        self.assertEqual(self.tkp_front.when_text, 'После начала работ')
