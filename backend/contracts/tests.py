from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone

from objects.models import Object

from .models import Contract


class ContractModelTests(TestCase):
    def setUp(self) -> None:
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва, ул. Примерная, д. 1',
            description='Тестовый строительный объект',
        )
        self.other_object = Object.objects.create(
            name='Объект Б',
            address='г. Санкт-Петербург, Невский проспект, д. 10',
            description='Второй объект',
        )

    def _create_contract(self, **kwargs) -> Contract:
        defaults = {
            'object': self.object,
            'number': 'ДГ-001',
            'name': 'Монтаж инженерных систем',
            'contract_date': timezone.now().date(),
            'contractor': 'ООО "СтройИнжиниринг"',
            'total_amount': '1500000.00',
        }
        defaults.update(kwargs)
        return Contract.objects.create(**defaults)

    def test_create_contract(self) -> None:
        contract = self._create_contract()
        self.assertEqual(Contract.objects.count(), 1)
        self.assertEqual(contract.object, self.object)
        self.assertEqual(contract.status, Contract.Status.PLANNED)

    def test_unique_number_per_object(self) -> None:
        self._create_contract()
        with self.assertRaises(IntegrityError):
            self._create_contract()

    def test_same_number_allowed_for_different_objects(self) -> None:
        self._create_contract()
        contract_other = self._create_contract(object=self.other_object)
        self.assertEqual(Contract.objects.count(), 2)
        self.assertEqual(contract_other.object, self.other_object)
