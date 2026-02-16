from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from proposals.models import FrontOfWorkItem


class FrontOfWorkItemDefaultTest(APITestCase):
    """Тесты поля is_default для FrontOfWorkItem"""

    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client.force_authenticate(user=self.user)
        self.item_default = FrontOfWorkItem.objects.create(
            name='Подвести электропитание',
            category='Электрика',
            is_default=True,
        )
        self.item_non_default = FrontOfWorkItem.objects.create(
            name='Специальный фундамент',
            category='Строительство',
            is_default=False,
        )

    def test_is_default_field_exists(self):
        """Поле is_default присутствует"""
        self.assertTrue(self.item_default.is_default)
        self.assertFalse(self.item_non_default.is_default)

    def test_default_value_is_false(self):
        """Значение по умолчанию — False"""
        item = FrontOfWorkItem.objects.create(name='Без дефолта', category='Тест')
        self.assertFalse(item.is_default)

    def test_api_filter_is_default(self):
        """API фильтрация по is_default"""
        response = self.client.get('/api/v1/front-of-work-items/?is_default=true')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Подвести электропитание')

    def test_api_filter_is_default_false(self):
        """API фильтрация по is_default=false"""
        response = self.client.get('/api/v1/front-of-work-items/?is_default=false')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Специальный фундамент')

    def test_api_create_with_is_default(self):
        """API создание с is_default=true"""
        data = {
            'name': 'Новый пункт',
            'category': 'Тест',
            'is_default': True,
        }
        response = self.client.post('/api/v1/front-of-work-items/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['is_default'])

    def test_api_response_includes_is_default(self):
        """API ответ содержит поле is_default"""
        response = self.client.get('/api/v1/front-of-work-items/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data:
            self.assertIn('is_default', item)
