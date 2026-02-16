from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from proposals.models import MountingCondition


class MountingConditionDefaultTest(APITestCase):
    """Тесты поля is_default для MountingCondition"""

    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client.force_authenticate(user=self.user)
        self.cond_default = MountingCondition.objects.create(
            name='Проживание',
            description='Предоставление проживания',
            is_default=True,
        )
        self.cond_non_default = MountingCondition.objects.create(
            name='Спецтехника',
            description='Аренда спецтехники',
            is_default=False,
        )

    def test_is_default_field_exists(self):
        """Поле is_default присутствует"""
        self.assertTrue(self.cond_default.is_default)
        self.assertFalse(self.cond_non_default.is_default)

    def test_default_value_is_false(self):
        """Значение по умолчанию — False"""
        cond = MountingCondition.objects.create(name='Без дефолта')
        self.assertFalse(cond.is_default)

    def test_api_filter_is_default(self):
        """API фильтрация по is_default"""
        response = self.client.get('/api/v1/mounting-conditions/?is_default=true')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Проживание')

    def test_api_create_with_is_default(self):
        """API создание с is_default=true"""
        data = {
            'name': 'Новое условие',
            'description': 'Описание',
            'is_default': True,
        }
        response = self.client.post('/api/v1/mounting-conditions/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['is_default'])

    def test_api_response_includes_is_default(self):
        """API ответ содержит поле is_default"""
        response = self.client.get('/api/v1/mounting-conditions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data:
            self.assertIn('is_default', item)
