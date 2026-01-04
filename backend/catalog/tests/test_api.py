from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from catalog.models import Category, Product, ProductAlias


User = get_user_model()


class CategoryAPITest(APITestCase):
    """Тесты API категорий"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        
        self.category = Category.objects.create(
            name='Оборудование',
            code='equipment'
        )
    
    def test_list_categories(self):
        """GET /api/v1/catalog/categories/"""
        url = reverse('category-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)
    
    def test_create_category(self):
        """POST /api/v1/catalog/categories/"""
        url = reverse('category-list')
        data = {
            'name': 'Материалы',
            'code': 'materials'
        }
        response = self.client.post(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Материалы')
    
    def test_create_nested_category(self):
        """Создание вложенной категории"""
        url = reverse('category-list')
        data = {
            'name': 'Вентиляция',
            'code': 'ventilation',
            'parent': self.category.id
        }
        response = self.client.post(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['level'], 1)
    
    def test_get_category_tree(self):
        """GET /api/v1/catalog/categories/tree/"""
        # Создаём вложенную структуру
        child = Category.objects.create(
            name='Вентиляция',
            code='vent',
            parent=self.category
        )
        
        url = reverse('category-tree')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Проверяем что есть дети
        root = response.data[0]
        self.assertTrue(len(root.get('children', [])) > 0)
    
    def test_update_category(self):
        """PATCH /api/v1/catalog/categories/{id}/"""
        url = reverse('category-detail', args=[self.category.id])
        data = {'name': 'Оборудование обновлённое'}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Оборудование обновлённое')
    
    def test_delete_category(self):
        """DELETE /api/v1/catalog/categories/{id}/"""
        url = reverse('category-detail', args=[self.category.id])
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


class ProductAPITest(APITestCase):
    """Тесты API товаров"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        
        self.category = Category.objects.create(name='Test', code='test')
        self.product = Product.objects.create(
            name='Тестовый товар',
            category=self.category,
            status=Product.Status.NEW
        )
    
    def test_list_products(self):
        """GET /api/v1/catalog/products/"""
        url = reverse('product-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_filter_products_by_status(self):
        """Фильтрация по статусу"""
        url = reverse('product-list')
        response = self.client.get(url, {'status': 'new'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Проверяем что все товары имеют статус new
        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        for product in results:
            self.assertEqual(product['status'], 'new')
    
    def test_filter_products_by_category(self):
        """Фильтрация по категории"""
        url = reverse('product-list')
        response = self.client.get(url, {'category': self.category.id})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_search_products(self):
        """Поиск товаров"""
        url = reverse('product-list')
        response = self.client.get(url, {'search': 'Тестовый'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)
    
    def test_get_product_detail(self):
        """GET /api/v1/catalog/products/{id}/"""
        url = reverse('product-detail', args=[self.product.id])
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Тестовый товар')
    
    def test_create_product(self):
        """POST /api/v1/catalog/products/ - создание товара"""
        url = reverse('product-list')
        data = {
            'name': 'Новый товар',
            'category': self.category.id,
            'default_unit': 'шт',
            'is_service': False
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Новый товар')
        self.assertEqual(response.data['category'], self.category.id)
        self.assertEqual(response.data['default_unit'], 'шт')
        self.assertEqual(response.data['is_service'], False)
        self.assertEqual(response.data['status'], 'new')
        
        # Проверяем, что товар создан в БД
        product = Product.objects.get(id=response.data['id'])
        self.assertEqual(product.name, 'Новый товар')
        self.assertEqual(product.normalized_name, Product.normalize_name('Новый товар'))
    
    def test_create_product_without_category(self):
        """Создание товара без категории (допустимо)"""
        url = reverse('product-list')
        data = {
            'name': 'Товар без категории',
            'default_unit': 'м'
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data['category'])
        self.assertEqual(response.data['name'], 'Товар без категории')
    
    def test_create_service(self):
        """Создание услуги (is_service=True)"""
        url = reverse('product-list')
        data = {
            'name': 'Услуга по монтажу',
            'category': self.category.id,
            'is_service': True,
            'default_unit': 'усл'
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['is_service'], True)
        self.assertEqual(response.data['default_unit'], 'усл')
    
    def test_update_product_put(self):
        """PUT /api/v1/catalog/products/{id}/ - полное обновление товара"""
        url = reverse('product-detail', args=[self.product.id])
        data = {
            'name': 'Обновлённый товар',
            'category': self.category.id,
            'default_unit': 'кг',
            'is_service': False
        }
        response = self.client.put(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Обновлённый товар')
        self.assertEqual(response.data['default_unit'], 'кг')
        
        # Проверяем в БД
        self.product.refresh_from_db()
        self.assertEqual(self.product.name, 'Обновлённый товар')
        self.assertEqual(self.product.default_unit, 'кг')
        self.assertEqual(self.product.normalized_name, Product.normalize_name('Обновлённый товар'))
    
    def test_update_product_patch(self):
        """PATCH /api/v1/catalog/products/{id}/ - частичное обновление товара"""
        url = reverse('product-detail', args=[self.product.id])
        original_name = self.product.name
        
        # Обновляем только название
        data = {'name': 'Частично обновлённый товар'}
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Частично обновлённый товар')
        
        # Проверяем, что другие поля не изменились
        self.product.refresh_from_db()
        self.assertEqual(self.product.name, 'Частично обновлённый товар')
        self.assertEqual(self.product.category_id, self.category.id)  # Категория не изменилась
    
    def test_update_product_change_category(self):
        """Обновление категории товара"""
        new_category = Category.objects.create(name='Новая категория', code='new_cat')
        url = reverse('product-detail', args=[self.product.id])
        
        data = {'category': new_category.id}
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['category'], new_category.id)
        self.assertEqual(response.data['category_name'], 'Новая категория')
        
        self.product.refresh_from_db()
        self.assertEqual(self.product.category_id, new_category.id)
    
    def test_update_product_remove_category(self):
        """Удаление категории у товара (установка в null)"""
        url = reverse('product-detail', args=[self.product.id])
        self.assertEqual(self.product.category_id, self.category.id)  # Проверяем начальное состояние
        
        data = {'category': None}
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['category'])
        
        self.product.refresh_from_db()
        self.assertIsNone(self.product.category)
    
    def test_update_product_change_unit(self):
        """Обновление единицы измерения"""
        url = reverse('product-detail', args=[self.product.id])
        data = {'default_unit': 'м²'}
        response = self.client.patch(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['default_unit'], 'м²')
        
        self.product.refresh_from_db()
        self.assertEqual(self.product.default_unit, 'м²')
    
    def test_delete_product(self):
        """DELETE /api/v1/catalog/products/{id}/ - удаление товара"""
        product_id = self.product.id
        url = reverse('product-detail', args=[product_id])
        
        # Проверяем, что товар существует
        self.assertTrue(Product.objects.filter(id=product_id).exists())
        
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Проверяем, что товар удалён
        self.assertFalse(Product.objects.filter(id=product_id).exists())
    
    def test_delete_product_with_aliases(self):
        """Удаление товара с алиасами (проверка каскадного удаления)"""
        # Создаём алиас для товара
        alias = ProductAlias.objects.create(
            product=self.product,
            alias_name='Альтернативное название'
        )
        
        product_id = self.product.id
        alias_id = alias.id
        
        url = reverse('product-detail', args=[product_id])
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Проверяем каскадное удаление алиасов
        self.assertFalse(Product.objects.filter(id=product_id).exists())
        self.assertFalse(ProductAlias.objects.filter(id=alias_id).exists())
    
    def test_delete_nonexistent_product(self):
        """Удаление несуществующего товара"""
        url = reverse('product-detail', args=[99999])
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_verify_product(self):
        """POST /api/v1/catalog/products/{id}/verify/"""
        url = reverse('product-verify', args=[self.product.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'verified')
    
    def test_archive_product(self):
        """POST /api/v1/catalog/products/{id}/archive/"""
        url = reverse('product-archive', args=[self.product.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'archived')
    
    def test_get_product_prices(self):
        """GET /api/v1/catalog/products/{id}/prices/"""
        url = reverse('product-prices', args=[self.product.id])
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
    
    def test_find_duplicates(self):
        """GET /api/v1/catalog/products/duplicates/"""
        # Создаём похожие товары
        Product.objects.create(name='Тестовый товар 1')
        Product.objects.create(name='Тестовый товар 2')
        
        url = reverse('product-duplicates')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_merge_products(self):
        """POST /api/v1/catalog/products/merge/"""
        source = Product.objects.create(name='Source Product')
        
        url = reverse('product-merge')
        data = {
            'source_ids': [source.id],
            'target_id': self.product.id
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        source.refresh_from_db()
        self.assertEqual(source.status, Product.Status.MERGED)
        self.assertEqual(source.merged_into_id, self.product.id)
    
    def test_merge_products_invalid_target(self):
        """Объединение с несуществующим target"""
        source = Product.objects.create(name='Source')
        
        url = reverse('product-merge')
        data = {
            'source_ids': [source.id],
            'target_id': 99999
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ProductAliasAPITest(APITestCase):
    """Тесты API синонимов"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        self.product = Product.objects.create(name='Test Product')
    
    def test_product_includes_aliases(self):
        """Товар включает список синонимов"""
        ProductAlias.objects.create(
            product=self.product,
            alias_name='Alias 1'
        )
        
        url = reverse('product-detail', args=[self.product.id])
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data['aliases']) > 0)
