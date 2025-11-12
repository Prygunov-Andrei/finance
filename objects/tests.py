from django.test import TestCase
from django.core.exceptions import ValidationError

from .models import Object


class ObjectModelTests(TestCase):
    def test_create_object(self) -> None:
        """Тест создания объекта"""
        obj = Object.objects.create(
            name='Объект А',
            address='г. Москва, ул. Примерная, д. 1',
            description='Тестовый строительный объект',
        )
        self.assertEqual(Object.objects.count(), 1)
        self.assertEqual(obj.name, 'Объект А')
        self.assertEqual(obj.address, 'г. Москва, ул. Примерная, д. 1')

    def test_unique_name(self) -> None:
        """Тест уникальности названия объекта"""
        Object.objects.create(
            name='Объект А',
            address='г. Москва, ул. Примерная, д. 1',
        )
        with self.assertRaises(Exception):  # IntegrityError или ValidationError
            Object.objects.create(
                name='Объект А',
                address='г. Санкт-Петербург, Невский проспект, д. 10',
            )

    def test_str_representation(self) -> None:
        """Тест строкового представления объекта"""
        obj = Object.objects.create(
            name='Объект Б',
            address='г. Санкт-Петербург, Невский проспект, д. 10',
        )
        self.assertEqual(str(obj), 'Объект Б')

    def test_timestamps(self) -> None:
        """Тест автоматического заполнения временных меток"""
        obj = Object.objects.create(
            name='Объект В',
            address='г. Казань, ул. Баумана, д. 5',
        )
        self.assertIsNotNone(obj.created_at)
        self.assertIsNotNone(obj.updated_at)
