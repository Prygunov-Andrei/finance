from django.test import TestCase
from catalog.models import Product, ProductAlias
from catalog.services import ProductMatcher


class ProductMatcherTest(TestCase):
    """Тесты сервиса ProductMatcher"""
    
    def setUp(self):
        # Очищаем все продукты перед тестом
        Product.objects.all().delete()
        ProductAlias.objects.all().delete()
        
        self.matcher = ProductMatcher()
        # Инвалидируем кэш перед каждым тестом
        self.matcher.invalidate_cache()
        
        # Создаём тестовые товары
        self.product1 = Product.objects.create(
            name='Вентилятор канальный ВКК-125',
            status=Product.Status.VERIFIED
        )
        self.product2 = Product.objects.create(
            name='Вентилятор радиальный ВР-80',
            status=Product.Status.VERIFIED
        )
        self.product3 = Product.objects.create(
            name='Гвозди строительные 50мм',
            status=Product.Status.NEW
        )
        
        # Инвалидируем кэш после создания товаров
        self.matcher.invalidate_cache()
    
    def test_find_similar_exact_match(self):
        """Поиск точного совпадения"""
        similar = self.matcher.find_similar(
            'Вентилятор канальный ВКК-125',
            threshold=0.9
        )
        self.assertTrue(len(similar) > 0)
        # Проверяем что нашелся правильный товар (по имени, не по ID)
        self.assertEqual(similar[0]['product_name'], self.product1.name)
        self.assertGreaterEqual(similar[0]['score'], 0.9)
    
    def test_find_similar_fuzzy_match(self):
        """Fuzzy-поиск похожих товаров"""
        similar = self.matcher.find_similar(
            'ВКК-125 вентилятор канальный',  # Другой порядок слов
            threshold=0.7
        )
        self.assertTrue(len(similar) > 0)
        # Первый результат должен содержать ВКК-125
        self.assertIn('ВКК-125', similar[0]['product_name'])
    
    def test_find_similar_no_match(self):
        """Нет совпадений"""
        similar = self.matcher.find_similar(
            'Совершенно уникальный товар XYZ-999',
            threshold=0.8
        )
        self.assertEqual(len(similar), 0)
    
    def test_find_similar_respects_threshold(self):
        """Порог схожести работает"""
        similar_high = self.matcher.find_similar('Вентилятор', threshold=0.9)
        similar_low = self.matcher.find_similar('Вентилятор', threshold=0.3)
        
        # При низком пороге должно быть больше результатов
        self.assertGreaterEqual(len(similar_low), len(similar_high))
    
    def test_find_or_create_existing(self):
        """Поиск существующего товара"""
        product, created = self.matcher.find_or_create_product(
            'Вентилятор канальный ВКК-125'
        )
        self.assertFalse(created)
        self.assertEqual(product.id, self.product1.id)
    
    def test_find_or_create_new(self):
        """Создание нового товара"""
        product, created = self.matcher.find_or_create_product(
            'Абсолютно новый уникальный товар XYZ'
        )
        self.assertTrue(created)
        self.assertEqual(product.status, Product.Status.NEW)
    
    def test_find_or_create_creates_alias(self):
        """Создание синонима при похожем совпадении"""
        # Создаём товар с немного другим названием
        product, created = self.matcher.find_or_create_product(
            'Канальный вентилятор ВКК 125'  # Похоже на product1
        )
        
        # Должен найти существующий и создать alias
        self.assertFalse(created)
        self.assertEqual(product.id, self.product1.id)
        
        # Проверяем что alias создан
        alias_exists = ProductAlias.objects.filter(
            product=self.product1,
            alias_name='Канальный вентилятор ВКК 125'
        ).exists()
        self.assertTrue(alias_exists)
    
    def test_find_duplicates(self):
        """Поиск дубликатов"""
        # Создаём потенциальный дубликат
        Product.objects.create(
            name='Гвозди строит. 50 мм',  # Похоже на product3
            status=Product.Status.NEW
        )
        
        duplicates = self.matcher.find_duplicates(threshold=0.7)
        
        # Должен найти группу дубликатов
        self.assertTrue(len(duplicates) > 0)
    
    def test_find_similar_by_alias(self):
        """Поиск по синониму"""
        # Создаём alias
        ProductAlias.objects.create(
            product=self.product1,
            alias_name='Канальник ВКК125'
        )
        
        product, created = self.matcher.find_or_create_product('Канальник ВКК125')
        
        self.assertFalse(created)
        self.assertEqual(product.id, self.product1.id)
