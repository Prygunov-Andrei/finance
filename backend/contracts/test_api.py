from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from datetime import date, timedelta

from objects.models import Object
from accounting.models import Counterparty, LegalEntity, TaxSystem
from pricelists.models import PriceList
from payments.models import Payment, ExpenseCategory
from .models import (
    Contract, ContractAmendment, WorkScheduleItem, Act, 
    ActPaymentAllocation, FrameworkContract
)


class BaseAPITestCase(TestCase):
    """Базовый класс для API тестов"""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User'
        )
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='Наша Фирма ООО',
            short_name='НФ',
            inn='1111111111',
            tax_system=self.tax_system
        )
        self.vendor = Counterparty.objects.create(
            name='Исполнитель ООО',
            short_name='Исполнитель',
            inn='2222222222',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.customer = Counterparty.objects.create(
            name='Заказчик ООО',
            short_name='Заказчик',
            inn='3333333333',
            type=Counterparty.Type.CUSTOMER,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва'
        )


class ContractAPITests(BaseAPITestCase):
    """API тесты для ContractViewSet"""
    
    def setUp(self):
        super().setUp()
        self.contract_data = {
            'object_id': self.object.id,
            'number': 'ДГ-001',
            'name': 'Договор на монтаж',
            'contract_date': date.today().isoformat(),
            'counterparty': self.vendor.id,
            'legal_entity': self.legal_entity.id,
            'contract_type': Contract.Type.EXPENSE,
            'total_amount': '100000.00',
            'currency': Contract.Currency.RUB,
        }
    
    def test_list_contracts(self):
        """Тест получения списка договоров"""
        Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор 1',
            contract_date=date.today(),
            total_amount=Decimal('100000.00')
        )
        
        response = self.client.get('/api/v1/contracts/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
    
    def test_create_contract(self):
        """Тест создания договора"""
        response = self.client.post('/api/v1/contracts/', self.contract_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Contract.objects.count(), 1)
        self.assertEqual(response.data['number'], 'ДГ-001')
    
    def test_retrieve_contract(self):
        """Тест получения договора"""
        contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00')
        )
        
        response = self.client.get(f'/api/v1/contracts/{contract.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], contract.id)
    
    def test_update_contract(self):
        """Тест обновления договора"""
        contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00')
        )
        
        update_data = self.contract_data.copy()
        update_data['name'] = 'Обновленный договор'
        update_data['total_amount'] = '150000.00'
        
        response = self.client.patch(f'/api/v1/contracts/{contract.id}/', update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        contract.refresh_from_db()
        self.assertEqual(contract.name, 'Обновленный договор')
        self.assertEqual(contract.total_amount, Decimal('150000.00'))
    
    def test_delete_contract(self):
        """Тест удаления договора"""
        contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00')
        )
        
        response = self.client.delete(f'/api/v1/contracts/{contract.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Contract.objects.count(), 0)
    
    def test_filter_contracts_by_status(self):
        """Тест фильтрации договоров по статусу"""
        Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор 1',
            contract_date=date.today(),
            total_amount=Decimal('100000.00'),
            status=Contract.Status.PLANNED
        )
        Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-002',
            name='Договор 2',
            contract_date=date.today(),
            total_amount=Decimal('200000.00'),
            status=Contract.Status.COMPLETED
        )
        
        response = self.client.get('/api/v1/contracts/?status=planned')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['status'], 'planned')
    
    def test_filter_contracts_by_framework_contract(self):
        """Тест фильтрации договоров по рамочному договору"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        
        contract1 = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор 1',
            contract_date=date.today(),
            total_amount=Decimal('100000.00'),
            framework_contract=framework
        )
        Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-002',
            name='Договор 2',
            contract_date=date.today(),
            total_amount=Decimal('200000.00')
        )
        
        response = self.client.get(f'/api/v1/contracts/?framework_contract={framework.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], contract1.id)
    
    def test_filter_contracts_by_responsible_manager(self):
        """Тест фильтрации договоров по начальнику участка"""
        manager = User.objects.create_user(
            username='manager',
            password='testpass123'
        )
        
        contract1 = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор 1',
            contract_date=date.today(),
            total_amount=Decimal('100000.00'),
            responsible_manager=manager
        )
        Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-002',
            name='Договор 2',
            contract_date=date.today(),
            total_amount=Decimal('200000.00')
        )
        
        response = self.client.get(f'/api/v1/contracts/?responsible_manager={manager.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], contract1.id)
    
    def test_search_contracts(self):
        """Тест поиска договоров"""
        Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Монтаж систем',
            contract_date=date.today(),
            total_amount=Decimal('100000.00')
        )
        Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-002',
            name='Демонтаж',
            contract_date=date.today(),
            total_amount=Decimal('200000.00')
        )
        
        response = self.client.get('/api/v1/contracts/?search=Монтаж')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertIn('Монтаж', response.data['results'][0]['name'])
    
    def test_contract_balance_action(self):
        """Тест получения баланса договора"""
        contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00')
        )
        
        category = ExpenseCategory.objects.create(name='Test', code='test')
        
        Act.objects.create(
            contract=contract,
            number='АКТ-1',
            date=date.today(),
            amount_gross=Decimal('50000.00'),
            amount_net=Decimal('40000.00'),
            vat_amount=Decimal('10000.00'),
            status=Act.Status.SIGNED
        )
        
        Payment.objects.create(
            contract=contract,
            category=category,
            amount=Decimal('20000.00'),
            payment_date=date.today(),
            payment_type='expense',
            status='paid'
        )
        
        response = self.client.get(f'/api/v1/contracts/{contract.id}/balance/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(response.data['balance'])), Decimal('30000.00'))
        self.assertEqual(response.data['currency'], 'RUB')
    
    def test_create_contract_with_framework(self):
        """Тест создания договора с рамочным договором"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        
        contract_data = self.contract_data.copy()
        contract_data['framework_contract'] = framework.id
        
        response = self.client.post('/api/v1/contracts/', contract_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        contract = Contract.objects.get(id=response.data['id'])
        self.assertEqual(contract.framework_contract, framework)
    
    def test_create_contract_with_responsible_persons(self):
        """Тест создания договора с ответственными лицами"""
        manager = User.objects.create_user(
            username='manager',
            password='testpass123'
        )
        engineer = User.objects.create_user(
            username='engineer',
            password='testpass123'
        )
        
        contract_data = self.contract_data.copy()
        contract_data['responsible_manager'] = manager.id
        contract_data['responsible_engineer'] = engineer.id
        
        response = self.client.post('/api/v1/contracts/', contract_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        contract = Contract.objects.get(id=response.data['id'])
        self.assertEqual(contract.responsible_manager, manager)
        self.assertEqual(contract.responsible_engineer, engineer)


class FrameworkContractAPITests(BaseAPITestCase):
    """API тесты для FrameworkContractViewSet"""
    
    def setUp(self):
        super().setUp()
        self.framework_data = {
            'name': 'Рамочный договор с ООО Монтаж',
            'date': date.today().isoformat(),
            'valid_from': date.today().isoformat(),
            'valid_until': (date.today() + timedelta(days=365)).isoformat(),
            'legal_entity': self.legal_entity.id,
            'counterparty': self.vendor.id,
            'status': FrameworkContract.Status.DRAFT,
        }
    
    def test_list_framework_contracts(self):
        """Тест получения списка рамочных договоров"""
        FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        response = self.client.get('/api/v1/framework-contracts/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
    
    def test_create_framework_contract(self):
        """Тест создания рамочного договора"""
        response = self.client.post('/api/v1/framework-contracts/', self.framework_data, format='json')
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Response status: {response.status_code}")
            print(f"Response data: {response.data}")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(FrameworkContract.objects.count(), 1)
        framework = FrameworkContract.objects.first()
        self.assertEqual(framework.created_by, self.user)
        self.assertTrue(framework.number.startswith('РД-'))
    
    def test_retrieve_framework_contract(self):
        """Тест получения рамочного договора"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        response = self.client.get(f'/api/v1/framework-contracts/{framework.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], framework.id)
        self.assertIn('is_active', response.data)
        self.assertIn('is_expired', response.data)
        self.assertIn('contracts_count', response.data)
    
    def test_update_framework_contract(self):
        """Тест обновления рамочного договора"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        update_data = self.framework_data.copy()
        update_data['name'] = 'Обновленный рамочный договор'
        
        response = self.client.patch(f'/api/v1/framework-contracts/{framework.id}/', update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        framework.refresh_from_db()
        self.assertEqual(framework.name, 'Обновленный рамочный договор')
    
    def test_delete_framework_contract_without_contracts(self):
        """Тест удаления рамочного договора без связанных договоров"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        response = self.client.delete(f'/api/v1/framework-contracts/{framework.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(FrameworkContract.objects.count(), 0)
    
    def test_delete_framework_contract_with_contracts(self):
        """Тест что нельзя удалить рамочный договор с договорами"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        
        Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00'),
            framework_contract=framework
        )
        
        response = self.client.delete(f'/api/v1/framework-contracts/{framework.id}/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)
    
    def test_activate_framework_contract(self):
        """Тест активации рамочного договора"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.DRAFT,
            created_by=self.user
        )
        
        response = self.client.post(f'/api/v1/framework-contracts/{framework.id}/activate/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        framework.refresh_from_db()
        self.assertEqual(framework.status, FrameworkContract.Status.ACTIVE)
    
    def test_activate_framework_contract_not_draft(self):
        """Тест что нельзя активировать не черновик"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        
        response = self.client.post(f'/api/v1/framework-contracts/{framework.id}/activate/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_terminate_framework_contract(self):
        """Тест расторжения рамочного договора"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        
        response = self.client.post(f'/api/v1/framework-contracts/{framework.id}/terminate/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        framework.refresh_from_db()
        self.assertEqual(framework.status, FrameworkContract.Status.TERMINATED)
    
    def test_add_price_lists(self):
        """Тест добавления прайс-листов"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        price_list = PriceList.objects.create(
            number='ПЛ-001',
            name='Прайс-лист',
            date=date.today()
        )
        
        response = self.client.post(
            f'/api/v1/framework-contracts/{framework.id}/add_price_lists/',
            {'price_list_ids': [price_list.id]},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        framework.refresh_from_db()
        self.assertIn(price_list, framework.price_lists.all())
    
    def test_remove_price_lists(self):
        """Тест удаления прайс-листов"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        price_list = PriceList.objects.create(
            number='ПЛ-001',
            name='Прайс-лист',
            date=date.today()
        )
        framework.price_lists.add(price_list)
        
        response = self.client.post(
            f'/api/v1/framework-contracts/{framework.id}/remove_price_lists/',
            {'price_list_ids': [price_list.id]},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        framework.refresh_from_db()
        self.assertNotIn(price_list, framework.price_lists.all())
    
    def test_framework_contracts_list_action(self):
        """Тест получения списка договоров под рамочный"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        
        contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00'),
            framework_contract=framework
        )
        
        response = self.client.get(f'/api/v1/framework-contracts/{framework.id}/contracts/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], contract.id)
    
    def test_filter_framework_contracts_by_status(self):
        """Тест фильтрации рамочных договоров по статусу"""
        FrameworkContract.objects.create(
            name='Рамочный договор 1',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        FrameworkContract.objects.create(
            name='Рамочный договор 2',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.DRAFT,
            created_by=self.user
        )
        
        response = self.client.get('/api/v1/framework-contracts/?status=active')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['status'], 'active')
    
    def test_search_framework_contracts(self):
        """Тест поиска рамочных договоров"""
        FrameworkContract.objects.create(
            name='Рамочный договор с Монтаж',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        FrameworkContract.objects.create(
            name='Рамочный договор с Демонтаж',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        response = self.client.get('/api/v1/framework-contracts/?search=Монтаж')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertIn('Монтаж', response.data['results'][0]['name'])


class ActAPITests(BaseAPITestCase):
    """API тесты для ActViewSet"""
    
    def setUp(self):
        super().setUp()
        self.contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00')
        )
        self.act_data = {
            'contract': self.contract.id,
            'number': 'АКТ-1',
            'date': date.today().isoformat(),
            'amount_gross': '50000.00',
            'amount_net': '40000.00',
            'vat_amount': '10000.00',
            'status': Act.Status.DRAFT,
        }
    
    def test_list_acts(self):
        """Тест получения списка актов"""
        Act.objects.create(
            contract=self.contract,
            number='АКТ-1',
            date=date.today(),
            amount_gross=Decimal('50000.00'),
            amount_net=Decimal('40000.00'),
            vat_amount=Decimal('10000.00')
        )
        
        response = self.client.get('/api/v1/acts/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
    
    def test_create_act(self):
        """Тест создания акта"""
        response = self.client.post('/api/v1/acts/', self.act_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Act.objects.count(), 1)
    
    def test_sign_act(self):
        """Тест подписания акта"""
        act = Act.objects.create(
            contract=self.contract,
            number='АКТ-1',
            date=date.today(),
            amount_gross=Decimal('50000.00'),
            amount_net=Decimal('40000.00'),
            vat_amount=Decimal('10000.00'),
            status=Act.Status.DRAFT
        )
        
        response = self.client.post(f'/api/v1/acts/{act.id}/sign/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        act.refresh_from_db()
        self.assertEqual(act.status, Act.Status.SIGNED)
    
    def test_sign_act_not_draft(self):
        """Тест что нельзя подписать не черновик"""
        act = Act.objects.create(
            contract=self.contract,
            number='АКТ-1',
            date=date.today(),
            amount_gross=Decimal('50000.00'),
            amount_net=Decimal('40000.00'),
            vat_amount=Decimal('10000.00'),
            status=Act.Status.SIGNED
        )
        
        response = self.client.post(f'/api/v1/acts/{act.id}/sign/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_filter_acts_by_contract(self):
        """Тест фильтрации актов по договору"""
        contract2 = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-002',
            name='Договор 2',
            contract_date=date.today(),
            total_amount=Decimal('200000.00')
        )
        
        act1 = Act.objects.create(
            contract=self.contract,
            number='АКТ-1',
            date=date.today(),
            amount_gross=Decimal('50000.00'),
            amount_net=Decimal('40000.00'),
            vat_amount=Decimal('10000.00')
        )
        Act.objects.create(
            contract=contract2,
            number='АКТ-2',
            date=date.today(),
            amount_gross=Decimal('60000.00'),
            amount_net=Decimal('50000.00'),
            vat_amount=Decimal('10000.00')
        )
        
        response = self.client.get(f'/api/v1/acts/?contract={self.contract.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], act1.id)


class ContractAmendmentAPITests(BaseAPITestCase):
    """API тесты для ContractAmendmentViewSet"""
    
    def setUp(self):
        super().setUp()
        self.contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00')
        )
        self.amendment_data = {
            'contract': self.contract.id,
            'number': 'ДС-1',
            'date': date.today().isoformat(),
            'reason': 'Продление срока',
            'new_end_date': (date.today() + timedelta(days=30)).isoformat(),
            'new_total_amount': '120000.00',
        }
    
    def test_list_amendments(self):
        """Тест получения списка доп. соглашений"""
        ContractAmendment.objects.create(
            contract=self.contract,
            number='ДС-1',
            date=date.today(),
            reason='Продление'
        )
        
        response = self.client.get('/api/v1/contract-amendments/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
    
    def test_create_amendment(self):
        """Тест создания доп. соглашения"""
        response = self.client.post('/api/v1/contract-amendments/', self.amendment_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ContractAmendment.objects.count(), 1)
        
        # Проверяем что договор обновился
        self.contract.refresh_from_db()
        self.assertEqual(self.contract.total_amount, Decimal('120000.00'))
    
    def test_filter_amendments_by_contract(self):
        """Тест фильтрации доп. соглашений по договору"""
        contract2 = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-002',
            name='Договор 2',
            contract_date=date.today(),
            total_amount=Decimal('200000.00')
        )
        
        amendment1 = ContractAmendment.objects.create(
            contract=self.contract,
            number='ДС-1',
            date=date.today(),
            reason='Продление'
        )
        ContractAmendment.objects.create(
            contract=contract2,
            number='ДС-2',
            date=date.today(),
            reason='Изменение суммы'
        )
        
        response = self.client.get(f'/api/v1/contract-amendments/?contract={self.contract.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], amendment1.id)


class WorkScheduleItemAPITests(BaseAPITestCase):
    """API тесты для WorkScheduleItemViewSet"""
    
    def setUp(self):
        super().setUp()
        self.contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            total_amount=Decimal('100000.00')
        )
        self.schedule_data = {
            'contract': self.contract.id,
            'name': 'Монтаж систем',
            'start_date': date.today().isoformat(),
            'end_date': (date.today() + timedelta(days=10)).isoformat(),
            'workers_count': 5,
            'status': WorkScheduleItem.Status.PENDING,
        }
    
    def test_list_schedule_items(self):
        """Тест получения списка задач графика"""
        WorkScheduleItem.objects.create(
            contract=self.contract,
            name='Задача 1',
            start_date=date.today(),
            end_date=date.today() + timedelta(days=5)
        )
        
        response = self.client.get('/api/v1/work-schedule/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
    
    def test_create_schedule_item(self):
        """Тест создания задачи графика"""
        response = self.client.post('/api/v1/work-schedule/', self.schedule_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(WorkScheduleItem.objects.count(), 1)
    
    def test_filter_schedule_items_by_contract(self):
        """Тест фильтрации задач по договору"""
        contract2 = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-002',
            name='Договор 2',
            contract_date=date.today(),
            total_amount=Decimal('200000.00')
        )
        
        item1 = WorkScheduleItem.objects.create(
            contract=self.contract,
            name='Задача 1',
            start_date=date.today(),
            end_date=date.today() + timedelta(days=5)
        )
        WorkScheduleItem.objects.create(
            contract=contract2,
            name='Задача 2',
            start_date=date.today(),
            end_date=date.today() + timedelta(days=5)
        )
        
        response = self.client.get(f'/api/v1/work-schedule/?contract={self.contract.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], item1.id)
