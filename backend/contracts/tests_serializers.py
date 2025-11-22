from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from objects.models import Object
from .models import Contract
from .serializers import ContractSerializer, ContractListSerializer


class ContractSerializerTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва, ул. Примерная, д. 1',
        )
        self.contract_data = {
            'object_id': self.object.id,
            'number': 'ДГ-001',
            'name': 'Монтаж инженерных систем',
            'contract_date': timezone.now().date(),
            'contractor': 'ООО "СтройИнжиниринг"',
            'total_amount': '1500000.00',
        }

    def test_contract_serializer_create(self) -> None:
        """Тест создания договора через сериализатор"""
        serializer = ContractSerializer(data=self.contract_data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        contract = serializer.save()
        self.assertEqual(contract.number, 'ДГ-001')
        self.assertEqual(contract.object, self.object)

    def test_contract_serializer_object_name(self) -> None:
        """Тест что object_name читается из связанного объекта"""
        contract = Contract.objects.create(
            object=self.object,
            **{k: v for k, v in self.contract_data.items() if k != 'object_id'}
        )
        serializer = ContractSerializer(contract)
        data = serializer.data
        self.assertEqual(data['object_name'], 'Объект А')

    def test_contract_list_serializer(self) -> None:
        """Тест упрощённого сериализатора для списка"""
        contract = Contract.objects.create(
            object=self.object,
            **{k: v for k, v in self.contract_data.items() if k != 'object_id'}
        )
        serializer = ContractListSerializer(contract)
        data = serializer.data
        self.assertIn('id', data)
        self.assertIn('number', data)
        self.assertNotIn('notes', data)  # Не должно быть в списке

