from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import Object
from .serializers import ObjectSerializer, ObjectListSerializer


class ObjectSerializerTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.object_data = {
            'name': 'Объект А',
            'address': 'г. Москва, ул. Примерная, д. 1',
            'description': 'Тестовый объект',
        }

    def test_object_serializer_create(self) -> None:
        """Тест создания объекта через сериализатор"""
        serializer = ObjectSerializer(data=self.object_data)
        self.assertTrue(serializer.is_valid())
        obj = serializer.save()
        self.assertEqual(obj.name, 'Объект А')
        self.assertEqual(obj.address, 'г. Москва, ул. Примерная, д. 1')

    def test_object_serializer_read_only_fields(self) -> None:
        """Тест что read_only поля не изменяются"""
        obj = Object.objects.create(**self.object_data)
        serializer = ObjectSerializer(obj)
        data = serializer.data
        self.assertIn('id', data)
        self.assertIn('created_at', data)
        self.assertIn('updated_at', data)

    def test_object_list_serializer(self) -> None:
        """Тест упрощённого сериализатора для списка"""
        obj = Object.objects.create(**self.object_data)
        serializer = ObjectListSerializer(obj)
        data = serializer.data
        self.assertIn('id', data)
        self.assertIn('name', data)
        self.assertIn('address', data)
        self.assertNotIn('description', data)  # Не должно быть в списке

