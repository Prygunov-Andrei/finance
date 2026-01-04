from django.test import TestCase
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from catalog.models import Category, Product, ProductAlias, ProductPriceHistory
from accounting.models import Counterparty
from datetime import date, timedelta
from decimal import Decimal


class CategoryModelTest(TestCase):
    """Тесты модели Category"""
    
    def test_create_root_category(self):
        """Создание корневой категории"""
        category = Category.objects.create(
            name='Оборудование',
            code='equipment'
        )
        self.assertEqual(category.level, 0)
        self.assertIsNone(category.parent)
        self.assertEqual(category.get_full_path(), 'Оборудование')
    
    def test_create_nested_category(self):
        """Создание вложенной категории"""
        root = Category.objects.create(name='Оборудование', code='equipment')
        child = Category.objects.create(
            name='Вентиляция',
            code='ventilation',
            parent=root
        )
        self.assertEqual(child.level, 1)
        self.assertEqual(child.get_full_path(), 'Оборудование → Вентиляция')
    
    def test_category_deep_nesting(self):
        """Глубокая вложенность категорий (3+ уровня)"""
        l1 = Category.objects.create(name='L1', code='l1')
        l2 = Category.objects.create(name='L2', code='l2', parent=l1)
        l3 = Category.objects.create(name='L3', code='l3', parent=l2)
        l4 = Category.objects.create(name='L4', code='l4', parent=l3)
        
        self.assertEqual(l4.level, 3)
        self.assertEqual(l4.get_full_path(), 'L1 → L2 → L3 → L4')
    
    def test_category_code_unique(self):
        """Уникальность кода категории"""
        Category.objects.create(name='Test', code='test')
        with self.assertRaises(IntegrityError):
            Category.objects.create(name='Test 2', code='test')
    
    def test_get_children(self):
        """Получение дочерних категорий"""
        parent = Category.objects.create(name='Parent', code='parent')
        child1 = Category.objects.create(name='Child 1', code='child1', parent=parent)
        child2 = Category.objects.create(name='Child 2', code='child2', parent=parent)
        
        children = parent.children.all()
        self.assertEqual(children.count(), 2)
        self.assertIn(child1, children)
        self.assertIn(child2, children)
    
    def test_category_cyclic_reference(self):
        """Проверка на циклическую ссылку"""
        cat1 = Category.objects.create(name='Cat1', code='cat1')
        cat2 = Category.objects.create(name='Cat2', code='cat2', parent=cat1)
        cat3 = Category.objects.create(name='Cat3', code='cat3', parent=cat2)
        
        # Попытка сделать cat1 родителем cat3 (цикл через cat2)
        # Но на самом деле это не цикл, нужно сделать cat3 родителем cat1
        cat1.parent = cat3
        with self.assertRaises(ValidationError):
            cat1.full_clean()


class ProductModelTest(TestCase):
    """Тесты модели Product"""
    
    def setUp(self):
        self.category = Category.objects.create(name='Test', code='test')
    
    def test_create_product(self):
        """Создание товара"""
        product = Product.objects.create(
            name='Вентилятор канальный ВКК-125',
            category=self.category
        )
        self.assertEqual(product.status, Product.Status.NEW)
        self.assertIsNotNone(product.normalized_name)
        self.assertIn('вентилятор', product.normalized_name)
    
    def test_normalize_name(self):
        """Нормализация названия товара"""
        name = 'Вентилятор ВКК-125 (220В)'
        normalized = Product.normalize_name(name)
        
        # Должен быть lowercase и без лишних символов
        self.assertEqual(normalized, normalized.lower())
        self.assertNotIn('(', normalized)
        self.assertNotIn(')', normalized)
    
    def test_auto_normalize_on_save(self):
        """Автоматическая нормализация при сохранении"""
        product = Product.objects.create(
            name='ВЕНТИЛЯТОР ВКК-125'
        )
        self.assertIsNotNone(product.normalized_name)
        self.assertEqual(product.normalized_name, product.normalized_name.lower())
    
    def test_product_is_service_flag(self):
        """Флаг услуги"""
        service = Product.objects.create(
            name='Монтажные работы',
            is_service=True
        )
        self.assertTrue(service.is_service)
    
    def test_product_status_transitions(self):
        """Переходы статусов товара"""
        product = Product.objects.create(name='Test')
        
        # new -> verified
        product.status = Product.Status.VERIFIED
        product.save()
        self.assertEqual(product.status, Product.Status.VERIFIED)
        
        # verified -> archived
        product.status = Product.Status.ARCHIVED
        product.save()
        self.assertEqual(product.status, Product.Status.ARCHIVED)
    
    def test_product_merge(self):
        """Объединение товаров"""
        target = Product.objects.create(name='Target Product')
        source = Product.objects.create(name='Source Product')
        
        source.status = Product.Status.MERGED
        source.merged_into = target
        source.save()
        
        self.assertEqual(source.status, Product.Status.MERGED)
        self.assertEqual(source.merged_into, target)


class ProductAliasModelTest(TestCase):
    """Тесты модели ProductAlias"""
    
    def setUp(self):
        self.product = Product.objects.create(name='Вентилятор ВКК-125')
    
    def test_create_alias(self):
        """Создание синонима"""
        alias = ProductAlias.objects.create(
            product=self.product,
            alias_name='ВКК 125 вентилятор'
        )
        self.assertIsNotNone(alias.normalized_alias)
        self.assertIn('вкк', alias.normalized_alias.lower())
    
    def test_alias_normalized(self):
        """Нормализация синонима"""
        alias = ProductAlias.objects.create(
            product=self.product,
            alias_name='ВЕНТИЛЯТОР ВКК-125 (Канальный)'
        )
        self.assertEqual(alias.normalized_alias, alias.normalized_alias.lower())
        self.assertNotIn('(', alias.normalized_alias)


class ProductPriceHistoryTest(TestCase):
    """Тесты модели ProductPriceHistory"""
    
    def setUp(self):
        self.product = Product.objects.create(name='Test Product')
        self.counterparty = Counterparty.objects.create(
            name='Тест Поставщик',
            inn='1234567890',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
    
    def test_create_price_history(self):
        """Создание записи истории цен"""
        price = ProductPriceHistory.objects.create(
            product=self.product,
            counterparty=self.counterparty,
            price=Decimal('1500.00'),
            unit='шт',
            invoice_date=date.today(),
            invoice_number='СЧ-001'
        )
        self.assertEqual(price.product, self.product)
        self.assertEqual(price.counterparty, self.counterparty)
        self.assertEqual(price.price, Decimal('1500.00'))
    
    def test_price_history_ordering(self):
        """Сортировка по дате (новые первые)"""
        old = ProductPriceHistory.objects.create(
            product=self.product,
            counterparty=self.counterparty,
            price=Decimal('1000.00'),
            unit='шт',
            invoice_date=date.today() - timedelta(days=30),
            invoice_number='СЧ-001'
        )
        new = ProductPriceHistory.objects.create(
            product=self.product,
            counterparty=self.counterparty,
            price=Decimal('1100.00'),
            unit='шт',
            invoice_date=date.today(),
            invoice_number='СЧ-002'
        )
        
        prices = list(ProductPriceHistory.objects.filter(product=self.product))
        self.assertEqual(prices[0], new)
        self.assertEqual(prices[1], old)
