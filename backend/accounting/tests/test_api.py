from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from accounting.models import TaxSystem, LegalEntity, Counterparty

class AccountingAPITest(APITestCase):
    
    def setUp(self):
        # Создаем пользователя
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client.force_authenticate(user=self.user)

        # Данные
        self.tax_system = TaxSystem.objects.filter(code='osn_vat_20').first()
        if not self.tax_system:
             self.tax_system = TaxSystem.objects.create(code='osn_vat_20', name='ОСН', vat_rate=20)

    def test_list_tax_systems(self):
        """Получение списка налоговых систем"""
        response = self.client.get('/api/v1/tax-systems/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)

    def test_create_legal_entity(self):
        """Создание юрлица через API"""
        data = {
            'name': 'ООО "Тест"',
            'short_name': 'Тест',
            'inn': '1112223334',
            'tax_system': self.tax_system.id,
            'is_active': True
        }
        response = self.client.post('/api/v1/legal-entities/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(LegalEntity.objects.count(), 1)
        self.assertEqual(LegalEntity.objects.first().inn, '1112223334')

    def test_create_counterparty(self):
        """Создание контрагента через API"""
        data = {
            'name': 'АО "Заказчик"',
            'short_name': 'Заказчик',
            'type': 'customer',
            'legal_form': 'ooo',
            'inn': '5556667778'
        }
        response = self.client.post('/api/v1/counterparties/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Counterparty.objects.count(), 1)

    def test_unauthorized_access(self):
        """Проверка доступа без авторизации"""
        self.client.logout()
        response = self.client.get('/api/v1/legal-entities/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

