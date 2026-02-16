from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from accounting.models import Counterparty


class PotentialCustomerModelTest(APITestCase):
    """Тесты модели Counterparty с типом potential_customer"""

    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client.force_authenticate(user=self.user)

    def test_create_potential_customer(self):
        """Создание контрагента типа potential_customer"""
        cp = Counterparty.objects.create(
            name='ООО "Потенциальный клиент"',
            short_name='ПК',
            type=Counterparty.Type.POTENTIAL_CUSTOMER,
            legal_form=Counterparty.LegalForm.OOO,
            inn='1234567890',
        )
        self.assertEqual(cp.type, 'potential_customer')
        self.assertEqual(cp.get_type_display(), 'Потенциальный Заказчик')

    def test_potential_customer_type_in_choices(self):
        """Тип potential_customer присутствует в TextChoices"""
        types = [choice[0] for choice in Counterparty.Type.choices]
        self.assertIn('potential_customer', types)

    def test_api_create_potential_customer(self):
        """API создание potential_customer"""
        data = {
            'name': 'ООО "Тест Потенциальный"',
            'short_name': 'ТП',
            'type': 'potential_customer',
            'legal_form': 'ooo',
            'inn': '9876543210',
        }
        response = self.client.post('/api/v1/counterparties/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['type'], 'potential_customer')

    def test_api_filter_by_potential_customer(self):
        """API фильтрация по типу potential_customer"""
        Counterparty.objects.create(
            name='ООО "Обычный"', short_name='О', type='customer',
            legal_form='ooo', inn='1111111111',
        )
        Counterparty.objects.create(
            name='ООО "Потенциал"', short_name='П', type='potential_customer',
            legal_form='ooo', inn='2222222222',
        )
        response = self.client.get('/api/v1/counterparties/?type=potential_customer')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['type'], 'potential_customer')
