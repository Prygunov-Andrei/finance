from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from objects.models import Object
from contracts.models import Contract
from .serializers import ContractSerializer, ContractListSerializer
from accounting.models import Counterparty, LegalEntity, TaxSystem


class ContractSerializerTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва, ул. Примерная, д. 1',
        )
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(name='Our Company', tax_system=self.tax_system, inn='111')
        self.counterparty = Counterparty.objects.create(name='Partner', inn='222', type=Counterparty.Type.CUSTOMER, legal_form=Counterparty.LegalForm.OOO)
        
        self.contract_data = {
            'object_id': self.object.id,
            'number': 'ДГ-001',
            'name': 'Монтаж инженерных систем',
            'contract_date': timezone.now().date(),
            'counterparty': self.counterparty.id, # Pass ID for serializer
            'legal_entity': self.legal_entity.id, # Pass ID for serializer
            'total_amount': '1500000.00',
            'contract_type': 'income'
        }

    def test_contract_serializer_create(self) -> None:
        """Тест создания договора через сериализатор"""
        serializer = ContractSerializer(data=self.contract_data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        contract = serializer.save()
        self.assertEqual(contract.number, 'ДГ-001')
        self.assertEqual(contract.object, self.object)
        self.assertEqual(contract.counterparty, self.counterparty)

    def test_contract_serializer_object_name(self) -> None:
        """Тест что object_name читается из связанного объекта"""
        # Prepare kwargs for create: exclude *_id and pass instances
        create_kwargs = {k: v for k, v in self.contract_data.items() if k not in ['object_id', 'counterparty', 'legal_entity']}
        create_kwargs['counterparty'] = self.counterparty
        create_kwargs['legal_entity'] = self.legal_entity
        
        contract = Contract.objects.create(
            object=self.object,
            **create_kwargs
        )
        serializer = ContractSerializer(contract)
        data = serializer.data
        self.assertEqual(data['object_name'], 'Объект А')

    def test_contract_list_serializer(self) -> None:
        """Тест упрощённого сериализатора для списка"""
        create_kwargs = {k: v for k, v in self.contract_data.items() if k not in ['object_id', 'counterparty', 'legal_entity']}
        create_kwargs['counterparty'] = self.counterparty
        create_kwargs['legal_entity'] = self.legal_entity
        
        contract = Contract.objects.create(
            object=self.object,
            **create_kwargs
        )
        serializer = ContractListSerializer(contract)
        data = serializer.data
        self.assertIn('id', data)
        self.assertIn('number', data)
        self.assertNotIn('notes', data)  # Не должно быть в списке
