from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase

from accounting.models import Counterparty
from catalog.models import Category, Product, ProductAlias, ProductPriceHistory, ProductWorkMapping
from pricelists.models import WorkerGrade, WorkSection, WorkItem


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


class ProductWorkMappingModelTest(TestCase):
    """Тесты для модели ProductWorkMapping"""

    def setUp(self):
        self.section = WorkSection.objects.create(
            code='VENT',
            name='Вентиляция'
        )
        self.grade = WorkerGrade.objects.create(
            grade=2,
            name='Монтажник 2 разряда',
            default_hourly_rate=Decimal('650.00')
        )
        self.work_item = WorkItem.objects.create(
            article='V-001',
            section=self.section,
            name='Монтаж воздуховода',
            unit=WorkItem.Unit.PIECE,
            grade=self.grade
        )
        self.work_item_2 = WorkItem.objects.create(
            article='V-002',
            section=self.section,
            name='Демонтаж воздуховода',
            unit=WorkItem.Unit.PIECE,
            grade=self.grade
        )
        self.product = Product.objects.create(name='Воздуховод круглый 100мм')
        self.product_2 = Product.objects.create(name='Воздуховод прямоугольный 200мм')

    def test_create_product_work_mapping(self):
        """Тест создания сопоставления товар → работа"""
        mapping = ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item
        )
        self.assertEqual(mapping.product, self.product)
        self.assertEqual(mapping.work_item, self.work_item)
        self.assertEqual(mapping.confidence, 1.0)
        self.assertEqual(mapping.source, ProductWorkMapping.Source.MANUAL)
        self.assertEqual(mapping.usage_count, 1)

    def test_create_product_work_mapping_with_explicit_values(self):
        """Тест создания сопоставления с явными значениями"""
        mapping = ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item,
            confidence=0.85,
            source=ProductWorkMapping.Source.LLM,
            usage_count=5
        )
        self.assertEqual(mapping.confidence, 0.85)
        self.assertEqual(mapping.source, ProductWorkMapping.Source.LLM)
        self.assertEqual(mapping.usage_count, 5)

    def test_unique_together_constraint_enforcement(self):
        """Тест ограничения unique_together (product, work_item)"""
        ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item
        )
        with self.assertRaises(IntegrityError):
            ProductWorkMapping.objects.create(
                product=self.product,
                work_item=self.work_item
            )

    def test_unique_together_allows_different_product_same_work_item(self):
        """Тест: разные товары могут ссылаться на одну и ту же работу"""
        ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item
        )
        mapping_2 = ProductWorkMapping.objects.create(
            product=self.product_2,
            work_item=self.work_item
        )
        self.assertEqual(ProductWorkMapping.objects.count(), 2)
        self.assertEqual(mapping_2.product, self.product_2)
        self.assertEqual(mapping_2.work_item, self.work_item)

    def test_unique_together_allows_same_product_different_work_item(self):
        """Тест: один товар может быть сопоставлен с разными работами"""
        ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item
        )
        mapping_2 = ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item_2
        )
        self.assertEqual(ProductWorkMapping.objects.count(), 2)
        self.assertEqual(mapping_2.product, self.product)
        self.assertEqual(mapping_2.work_item, self.work_item_2)

    def test_ordering_by_usage_count_descending(self):
        """Тест сортировки по usage_count по убыванию"""
        ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item,
            usage_count=3
        )
        ProductWorkMapping.objects.create(
            product=self.product_2,
            work_item=self.work_item,
            usage_count=10
        )
        ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item_2,
            usage_count=5
        )
        ordered = list(ProductWorkMapping.objects.values_list('usage_count', flat=True))
        self.assertEqual(ordered, [10, 5, 3])

    def test_ordering_by_confidence_descending_when_usage_count_equal(self):
        """Тест сортировки по confidence по убыванию при равном usage_count"""
        ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item,
            usage_count=1,
            confidence=0.5
        )
        ProductWorkMapping.objects.create(
            product=self.product_2,
            work_item=self.work_item,
            usage_count=1,
            confidence=1.0
        )
        ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item_2,
            usage_count=1,
            confidence=0.8
        )
        ordered = list(ProductWorkMapping.objects.values_list('confidence', flat=True))
        self.assertEqual(ordered, [1.0, 0.8, 0.5])

    def test_source_choices_manual(self):
        """Тест выбора источника: manual"""
        mapping = ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item,
            source=ProductWorkMapping.Source.MANUAL
        )
        self.assertEqual(mapping.source, 'manual')

    def test_source_choices_rule(self):
        """Тест выбора источника: rule"""
        mapping = ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item,
            source=ProductWorkMapping.Source.RULE
        )
        self.assertEqual(mapping.source, 'rule')

    def test_source_choices_llm(self):
        """Тест выбора источника: llm"""
        mapping = ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item,
            source=ProductWorkMapping.Source.LLM
        )
        self.assertEqual(mapping.source, 'llm')

    def test_default_confidence(self):
        """Тест значения по умолчанию: confidence=1.0"""
        mapping = ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item
        )
        self.assertEqual(mapping.confidence, 1.0)

    def test_default_usage_count(self):
        """Тест значения по умолчанию: usage_count=1"""
        mapping = ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item
        )
        self.assertEqual(mapping.usage_count, 1)

    def test_default_source(self):
        """Тест значения по умолчанию: source=manual"""
        mapping = ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item
        )
        self.assertEqual(mapping.source, ProductWorkMapping.Source.MANUAL)

    def test_str_representation(self):
        """Тест строкового представления модели"""
        mapping = ProductWorkMapping.objects.create(
            product=self.product,
            work_item=self.work_item,
            usage_count=7
        )
        expected = f"{self.product.name} → {self.work_item.name} (7x)"
        self.assertEqual(str(mapping), expected)
