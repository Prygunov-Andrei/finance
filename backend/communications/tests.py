from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from datetime import date
from .models import Correspondence
from accounting.models import Counterparty, LegalEntity, TaxSystem
from contracts.models import Contract
from objects.models import Object

User = get_user_model()

class CorrespondenceTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(name='Our Company', tax_system=self.tax_system, inn='111')
        self.counterparty = Counterparty.objects.create(name='Partner', inn='222', type=Counterparty.Type.CUSTOMER, legal_form=Counterparty.LegalForm.OOO)
        self.object = Object.objects.create(name='Test Object')
        self.contract = Contract.objects.create(
            object=self.object,
            contract_type=Contract.Type.INCOME,
            number='C-001',
            name='Test Contract',
            contract_date=date(2023, 1, 1),
            counterparty=self.counterparty,
            legal_entity=self.legal_entity,
            total_amount=100000
        )

    def test_create_correspondence(self):
        response = self.client.post('/api/v1/correspondence/', {
            'type': 'incoming',
            'category': 'letter',
            'contract': self.contract.id,
            'number': 'IN-123',
            'date': '2023-02-01',
            'subject': 'Important Letter',
            'description': 'Some text'
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Correspondence.objects.count(), 1)
        obj = Correspondence.objects.first()
        # Проверяем автозаполнение контрагента
        self.assertEqual(obj.counterparty, self.counterparty)

    def test_related_correspondence(self):
        # Create initial letter
        c1 = Correspondence.objects.create(
            type='incoming',
            contract=self.contract,
            number='1',
            date=date(2023, 1, 1),
            subject='Q1'
        )
        # Create response
        response = self.client.post('/api/v1/correspondence/', {
            'type': 'outgoing',
            'related_to': c1.id,
            'contract': self.contract.id,
            'number': 'OUT-1',
            'date': '2023-01-02',
            'subject': 'A1'
        })
        self.assertEqual(response.status_code, 201)
        c2 = Correspondence.objects.get(number='OUT-1')
        self.assertEqual(c2.related_to, c1)
