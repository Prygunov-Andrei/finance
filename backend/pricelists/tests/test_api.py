from django.test import TestCase
from django.urls import reverse
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from datetime import date
from pricelists.models import (
    WorkerGrade, WorkSection, WorkerGradeSkills,
    WorkItem, PriceList, PriceListItem, PriceListAgreement
)
from accounting.models import Counterparty


class BaseAPITestCase(TestCase):
    """Базовый класс для API тестов"""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        
        # Создаём базовые данные
        self.grade = WorkerGrade.objects.create(
            grade=2,
            name='Монтажник 2 разряда',
            default_hourly_rate=Decimal('650.00')
        )
        self.section = WorkSection.objects.create(
            code='VENT',
            name='Вентиляция'
        )


class WorkerGradeAPITests(BaseAPITestCase):
    """Тесты API для разрядов рабочих"""
    
    def test_list_worker_grades(self):
        """Тест получения списка разрядов"""
        response = self.client.get('/api/v1/worker-grades/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)

    def test_create_worker_grade(self):
        """Тест создания разряда"""
        data = {
            'grade': 3,
            'name': 'Монтажник 3 разряда',
            'default_hourly_rate': '800.00'
        }
        response = self.client.post('/api/v1/worker-grades/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['grade'], 3)

    def test_update_worker_grade(self):
        """Тест обновления разряда"""
        response = self.client.patch(
            f'/api/v1/worker-grades/{self.grade.id}/',
            {'default_hourly_rate': '700.00'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['default_hourly_rate'], '700.00')


class WorkSectionAPITests(BaseAPITestCase):
    """Тесты API для разделов работ"""
    
    def test_list_work_sections(self):
        """Тест получения списка разделов"""
        response = self.client.get('/api/v1/work-sections/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_work_section(self):
        """Тест создания раздела"""
        data = {
            'code': 'COND',
            'name': 'Кондиционирование',
            'sort_order': 2
        }
        response = self.client.post('/api/v1/work-sections/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['code'], 'COND')

    def test_tree_view(self):
        """Тест древовидного представления"""
        # Создаём дочерний раздел
        WorkSection.objects.create(
            code='VENT-SUPPLY',
            name='Приточная вентиляция',
            parent=self.section
        )
        
        response = self.client.get('/api/v1/work-sections/?tree=true')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Должен вернуться только корневой раздел
        for section in response.data['results']:
            self.assertIsNone(section.get('parent'))


class WorkItemAPITests(BaseAPITestCase):
    """Тесты API для работ"""
    
    def setUp(self):
        super().setUp()
        self.work_item = WorkItem.objects.create(
            article='V-001',
            section=self.section,
            name='Монтаж воздуховода',
            unit='м.п.',
            hours=Decimal('2.00'),
            grade=self.grade
        )

    def test_list_work_items(self):
        """Тест получения списка работ"""
        response = self.client.get('/api/v1/work-items/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_work_item(self):
        """Тест создания работы"""
        data = {
            'section': self.section.id,
            'name': 'Монтаж вентилятора',
            'unit': 'шт',
            'hours': '4.00',
            'grade': self.grade.id
        }
        response = self.client.post('/api/v1/work-items/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Артикул должен быть сгенерирован автоматически
        self.assertIn('article', response.data)

    def test_update_work_item_creates_version(self):
        """Тест: обновление работы создаёт новую версию"""
        response = self.client.patch(
            f'/api/v1/work-items/{self.work_item.id}/',
            {'hours': '3.00'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Должна быть создана новая версия
        self.assertEqual(response.data['version_number'], 2)
        self.assertTrue(response.data['is_current'])

    def test_get_versions(self):
        """Тест получения истории версий"""
        # Создаём новую версию
        new_version = self.work_item.create_new_version()
        
        # Запрашиваем версии от новой версии (т.к. старая уже is_current=False)
        response = self.client.get(f'/api/v1/work-items/{new_version.id}/versions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_filter_by_section(self):
        """Тест фильтрации по разделу"""
        response = self.client.get(f'/api/v1/work-items/?section={self.section.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data['results']:
            self.assertEqual(item['section'], self.section.id)

    def test_search_by_name(self):
        """Тест поиска по названию"""
        response = self.client.get('/api/v1/work-items/?search=воздуховод')
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class PriceListAPITests(BaseAPITestCase):
    """Тесты API для прайс-листов"""
    
    def setUp(self):
        super().setUp()
        self.work_item = WorkItem.objects.create(
            article='V-001',
            section=self.section,
            name='Монтаж воздуховода',
            unit='м.п.',
            hours=Decimal('2.00'),
            grade=self.grade
        )

    def test_list_price_lists(self):
        """Тест получения списка прайс-листов"""
        PriceList.objects.create(
            number='PL-001',
            date=date.today()
        )
        response = self.client.get('/api/v1/price-lists/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_price_list(self):
        """Тест создания прайс-листа"""
        data = {
            'number': 'PL-001',
            'name': 'Тестовый прайс-лист',
            'date': str(date.today()),
            'work_items': [self.work_item.id],
            'populate_rates': True
        }
        response = self.client.post('/api/v1/price-lists/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_create_price_list_with_items(self):
        """Тест создания прайс-листа с работами"""
        data = {
            'number': 'PL-001',
            'date': str(date.today()),
            'work_items': [self.work_item.id]
        }
        response = self.client.post('/api/v1/price-lists/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Проверяем, что работа добавлена
        price_list = PriceList.objects.get(id=response.data['id'])
        self.assertEqual(price_list.items.count(), 1)

    def test_add_items_to_price_list(self):
        """Тест добавления работ в прайс-лист"""
        price_list = PriceList.objects.create(
            number='PL-001',
            date=date.today()
        )
        
        response = self.client.post(
            f'/api/v1/price-lists/{price_list.id}/add-items/',
            {'work_item_ids': [self.work_item.id]},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)

    def test_remove_items_from_price_list(self):
        """Тест удаления работ из прайс-листа"""
        price_list = PriceList.objects.create(
            number='PL-001',
            date=date.today()
        )
        PriceListItem.objects.create(
            price_list=price_list,
            work_item=self.work_item
        )
        
        response = self.client.post(
            f'/api/v1/price-lists/{price_list.id}/remove-items/',
            {'work_item_ids': [self.work_item.id]},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(price_list.items.count(), 0)

    def test_create_price_list_version(self):
        """Тест создания новой версии прайс-листа"""
        price_list = PriceList.objects.create(
            number='PL-001',
            date=date.today(),
            status=PriceList.Status.ACTIVE
        )
        
        response = self.client.post(f'/api/v1/price-lists/{price_list.id}/create-version/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['version_number'], 2)

    def test_export_price_list(self):
        """Тест экспорта прайс-листа в Excel"""
        price_list = PriceList.objects.create(
            number='PL-001',
            date=date.today(),
            grade_2_rate=Decimal('650.00')
        )
        PriceListItem.objects.create(
            price_list=price_list,
            work_item=self.work_item
        )
        
        response = self.client.get(f'/api/v1/price-lists/{price_list.id}/export/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

    def test_filter_by_status(self):
        """Тест фильтрации по статусу"""
        PriceList.objects.create(
            number='PL-001',
            date=date.today(),
            status=PriceList.Status.DRAFT
        )
        PriceList.objects.create(
            number='PL-002',
            date=date.today(),
            status=PriceList.Status.ACTIVE
        )
        
        response = self.client.get('/api/v1/price-lists/?status=draft')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data['results']:
            self.assertEqual(item['status'], 'draft')

    def test_filter_by_date_range(self):
        """Тест фильтрации по диапазону дат"""
        today = date.today()
        PriceList.objects.create(
            number='PL-001',
            date=today
        )
        
        response = self.client.get(f'/api/v1/price-lists/?date_from={today}&date_to={today}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class PriceListItemAPITests(BaseAPITestCase):
    """Тесты API для позиций прайс-листа"""
    
    def setUp(self):
        super().setUp()
        self.work_item = WorkItem.objects.create(
            article='V-001',
            section=self.section,
            name='Монтаж воздуховода',
            unit='м.п.',
            hours=Decimal('2.00'),
            grade=self.grade
        )
        self.price_list = PriceList.objects.create(
            number='PL-001',
            date=date.today(),
            grade_2_rate=Decimal('650.00')
        )
        self.item = PriceListItem.objects.create(
            price_list=self.price_list,
            work_item=self.work_item
        )

    def test_list_price_list_items(self):
        """Тест получения списка позиций"""
        response = self.client.get('/api/v1/price-list-items/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_update_price_list_item(self):
        """Тест обновления позиции (переопределения)"""
        response = self.client.patch(
            f'/api/v1/price-list-items/{self.item.id}/',
            {'hours_override': '3.00'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['hours_override'], '3.00')
        self.assertEqual(response.data['effective_hours'], '3.00')


class PriceListAgreementAPITests(BaseAPITestCase):
    """Тесты API для согласований прайс-листов"""
    
    def setUp(self):
        super().setUp()
        self.price_list = PriceList.objects.create(
            number='PL-001',
            date=date.today()
        )
        self.vendor = Counterparty.objects.create(
            name='ООО Исполнитель',
            type='vendor',
            legal_form='ooo',
            inn='1234567890'
        )

    def test_list_agreements(self):
        """Тест получения списка согласований"""
        response = self.client.get('/api/v1/price-list-agreements/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_agreement(self):
        """Тест создания согласования"""
        data = {
            'price_list': self.price_list.id,
            'counterparty': self.vendor.id,
            'agreed_date': str(date.today())
        }
        response = self.client.post('/api/v1/price-list-agreements/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_delete_agreement(self):
        """Тест удаления согласования"""
        agreement = PriceListAgreement.objects.create(
            price_list=self.price_list,
            counterparty=self.vendor,
            agreed_date=date.today()
        )
        
        response = self.client.delete(f'/api/v1/price-list-agreements/{agreement.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
