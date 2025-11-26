from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from decimal import Decimal
from datetime import date

from objects.models import Object
from accounting.models import Counterparty, LegalEntity, TaxSystem
from contracts.models import Contract, CommercialProposal

User = get_user_model()

class CommercialProposalTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client.force_authenticate(user=self.user)

        # Создаем базовые сущности
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН', vat_rate=20)
        self.legal_entity = LegalEntity.objects.create(
            name='My Company', inn='1234567890', tax_system=self.tax_system
        )
        self.counterparty = Counterparty.objects.create(
            name='Customer A', type='customer', inn='0987654321'
        )
        self.object = Object.objects.create(
            name='Building A', address='Address A'
        )

    def test_workflow(self):
        """Полный цикл: Создание -> Согласование -> Договор"""
        
        # 1. Создание КП
        url_create = '/api/v1/commercial-proposals/'
        data = {
            'object': self.object.id,
            'counterparty': self.counterparty.id,
            'proposal_type': CommercialProposal.Type.INCOME,
            'number': 'KP-100',
            'date': '2023-10-01',
            'total_amount': '500000.00',
            'description': 'Test proposal workflow'
        }
        response = self.client.post(url_create, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        proposal_id = response.data['id']
        
        # 2. Попытка создать договор по черновику (должна быть ошибка)
        url_create_contract = f'/api/v1/commercial-proposals/{proposal_id}/create_contract/'
        response = self.client.post(url_create_contract)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Согласование КП
        url_approve = f'/api/v1/commercial-proposals/{proposal_id}/approve/'
        response = self.client.post(url_approve)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(CommercialProposal.objects.get(id=proposal_id).status, CommercialProposal.Status.APPROVED)

        # 4. Создание договора
        response = self.client.post(url_create_contract)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        contract_id = response.data['id']
        
        contract = Contract.objects.get(id=contract_id)
        self.assertEqual(contract.commercial_proposal.id, proposal_id)
        self.assertEqual(contract.contract_type, Contract.Type.INCOME)
        self.assertEqual(contract.status, Contract.Status.PLANNED)

        # 5. Попытка перевести договор в ACTIVE (успешно, т.к. КП согласовано)
        url_contract = f'/api/v1/contracts/{contract_id}/'
        # Для active нужны dates (если валидация требует, но в модели dates optional в clean() не проверяются, но проверим)
        # В модели start_date/end_date optional.
        update_data = {
            'status': Contract.Status.ACTIVE
        }
        response = self.client.patch(url_contract, update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_contract_validation_without_proposal(self):
        """Проверка невозможности активировать договор без КП"""
        contract = Contract.objects.create(
            object=self.object,
            counterparty=self.counterparty,
            contract_type=Contract.Type.INCOME,
            number="DIRECT-001",
            name="Direct Contract",
            contract_date=date.today(),
            total_amount=Decimal('10000.00'),
            status=Contract.Status.PLANNED
        )
        
        url = f'/api/v1/contracts/{contract.id}/'
        data = {'status': Contract.Status.ACTIVE}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Проверяем текст ошибки (DRF возвращает dict или list)
        # Ошибка в clean: raise ValidationError({'status': '...'}) -> DRF: {'status': ['...']}
        self.assertIn('status', response.data)
