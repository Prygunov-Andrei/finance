"""
Тесты для модели PaymentItem и создания платежей с позициями
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from datetime import date

from accounting.models import LegalEntity, Account, TaxSystem, Counterparty
from payments.models import PaymentRegistry, Payment, ExpenseCategory, PaymentItem
from contracts.models import Contract
from objects.models import Object
from catalog.models import Product, ProductPriceHistory

User = get_user_model()


class PaymentItemModelTest(TestCase):
    """Тесты модели PaymentItem"""
    
    def setUp(self):
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН', vat_rate=20)
        self.legal_entity = LegalEntity.objects.create(
            name='Тест ООО',
            short_name='ТОО',
            inn='1234567890',
            tax_system=self.tax_system
        )
        self.counterparty = Counterparty.objects.create(
            name='Поставщик',
            inn='0987654321',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.category = ExpenseCategory.objects.create(
            name='Тест категория',
            code='test_category'
        )
        self.product = Product.objects.create(name='Тест товар', default_unit='шт')
        self.account = Account.objects.create(
            legal_entity=self.legal_entity,
            name='Тестовый счет',
            number='40702810000000000001',
            initial_balance=Decimal('100000.00')
        )
        self.object = Object.objects.create(name='Тест объект')
        self.contract = Contract.objects.create(
            contract_type=Contract.Type.EXPENSE,
            number='C-001',
            name='Тест договор',
            contract_date='2024-01-01',
            counterparty=self.counterparty,
            legal_entity=self.legal_entity,
            object=self.object,
            total_amount=Decimal('50000.00')
        )
        self.mock_pdf = SimpleUploadedFile(
            "document.pdf",
            b"PDF file content",
            content_type="application/pdf"
        )
        self.payment = Payment.objects.create(
            legal_entity=self.legal_entity,
            account=self.account,
            category=self.category,
            payment_type=Payment.PaymentType.EXPENSE,
            payment_date='2024-01-15',
            amount=Decimal('10000.00'),
            contract=self.contract,
            scan_file=self.mock_pdf
        )
    
    def test_payment_item_creation(self):
        """Создание позиции платежа"""
        item = PaymentItem.objects.create(
            payment=self.payment,
            product=self.product,
            raw_name='Гвозди 20 мм',
            quantity=Decimal('100.000'),
            unit='шт',
            price_per_unit=Decimal('5.00'),
            amount=Decimal('500.00'),
            vat_amount=Decimal('100.00')
        )
        
        self.assertEqual(item.payment, self.payment)
        self.assertEqual(item.product, self.product)
        self.assertEqual(item.raw_name, 'Гвозди 20 мм')
        self.assertEqual(item.quantity, Decimal('100.000'))
        self.assertEqual(item.unit, 'шт')
        self.assertEqual(item.price_per_unit, Decimal('5.00'))
        self.assertEqual(item.amount, Decimal('500.00'))
        self.assertEqual(item.vat_amount, Decimal('100.00'))
    
    def test_payment_item_auto_calculate_amount(self):
        """Автоматический расчёт суммы позиции"""
        item = PaymentItem(
            payment=self.payment,
            product=self.product,
            raw_name='Болты',
            quantity=Decimal('50.000'),
            unit='шт',
            price_per_unit=Decimal('10.00')
        )
        item.save()
        
        expected_amount = Decimal('50.000') * Decimal('10.00')
        self.assertEqual(item.amount, expected_amount)
    
    def test_payment_item_without_product(self):
        """Создание позиции без товара из каталога"""
        item = PaymentItem.objects.create(
            payment=self.payment,
            product=None,
            raw_name='Услуга консультации',
            quantity=Decimal('1.000'),
            unit='час',
            price_per_unit=Decimal('2000.00'),
            amount=Decimal('2000.00')
        )
        
        self.assertIsNone(item.product)
        self.assertEqual(item.raw_name, 'Услуга консультации')
    
    def test_payment_item_str(self):
        """Проверка строкового представления"""
        item = PaymentItem.objects.create(
            payment=self.payment,
            product=self.product,
            raw_name='Шурупы',
            quantity=Decimal('25.000'),
            unit='шт',
            price_per_unit=Decimal('8.00'),
            amount=Decimal('200.00')
        )
        
        self.assertIn('Шурупы', str(item))
        self.assertIn('25', str(item))


class PaymentItemCreationTest(TestCase):
    """Тесты создания платежей с позициями через API"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='password',
            first_name='Test',
            last_name='User'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН', vat_rate=20)
        self.legal_entity = LegalEntity.objects.create(
            name='Test Company',
            short_name='TC',
            inn='1234567890',
            tax_system=self.tax_system
        )
        self.counterparty = Counterparty.objects.create(
            name='Supplier',
            inn='0987654321',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.account = Account.objects.create(
            legal_entity=self.legal_entity,
            name='Main Account',
            number='40702810000000000001',
            initial_balance=Decimal('100000.00')
        )
        self.category = ExpenseCategory.objects.create(
            name='Materials',
            code='materials',
            requires_contract=False
        )
        self.object = Object.objects.create(name='Test Object')
        self.contract = Contract.objects.create(
            contract_type=Contract.Type.EXPENSE,
            number='C-001',
            name='Test Contract',
            contract_date='2024-01-01',
            counterparty=self.counterparty,
            legal_entity=self.legal_entity,
            object=self.object,
            total_amount=Decimal('50000.00')
        )
        self.mock_pdf = SimpleUploadedFile(
            "document.pdf",
            b"PDF file content",
            content_type="application/pdf"
        )
    
    def test_create_payment_with_items(self):
        """Создание платежа с позициями"""
        import json
        data = {
            'payment_type': 'expense',
            'account_id': self.account.id,
            'category_id': self.category.id,
            'payment_date': '2024-01-15',
            'amount': '5000.00',
            'amount_gross': '5000.00',
            'description': 'Test payment with items',
            'scan_file': self.mock_pdf,
            'items_input': json.dumps([
                {
                    'raw_name': 'Гвозди 20 мм',
                    'quantity': '100.000',
                    'unit': 'шт',
                    'price_per_unit': '5.00',
                    'vat_amount': '100.00'
                },
                {
                    'raw_name': 'Болты',
                    'quantity': '50.000',
                    'unit': 'шт',
                    'price_per_unit': '10.00',
                    'vat_amount': '100.00'
                }
            ])
        }
        
        response = self.client.post('/api/v1/payments/', data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        payment = Payment.objects.get(id=response.data['id'])
        self.assertEqual(payment.items.count(), 2)
        self.assertEqual(response.data['items_count'], 2)
        
        # Проверяем первую позицию
        item1 = payment.items.first()
        self.assertEqual(item1.raw_name, 'Гвозди 20 мм')
        self.assertEqual(item1.quantity, Decimal('100.000'))
        self.assertEqual(item1.price_per_unit, Decimal('5.00'))
        self.assertEqual(item1.amount, Decimal('500.00'))
    
    def test_create_payment_with_items_creates_products(self):
        """Создание платежа с позициями создаёт товары в каталоге"""
        import json
        data = {
            'payment_type': 'expense',
            'account_id': self.account.id,
            'category_id': self.category.id,
            'payment_date': '2024-01-15',
            'amount': '5000.00',
            'description': 'Test payment',
            'scan_file': self.mock_pdf,
            'items_input': json.dumps([
                {
                    'raw_name': 'Новый товар',
                    'quantity': '10.000',
                    'unit': 'шт',
                    'price_per_unit': '100.00'
                }
            ])
        }
        
        initial_product_count = Product.objects.count()
        
        response = self.client.post('/api/v1/payments/', data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Product.objects.count(), initial_product_count + 1)
        
        payment = Payment.objects.get(id=response.data['id'])
        item = payment.items.first()
        self.assertIsNotNone(item.product)
        self.assertEqual(item.product.name, 'Новый товар')
        self.assertEqual(item.product.status, Product.Status.NEW)
    
    def test_create_payment_with_items_creates_price_history(self):
        """Создание платежа с позициями создаёт историю цен"""
        import json
        data = {
            'payment_type': 'expense',
            'account_id': self.account.id,
            'category_id': self.category.id,
            'contract_id': self.contract.id,
            'payment_date': '2024-01-15',
            'amount': '5000.00',
            'description': 'INV-001',
            'scan_file': self.mock_pdf,
            'items_input': json.dumps([
                {
                    'raw_name': 'Товар с ценой',
                    'quantity': '10.000',
                    'unit': 'шт',
                    'price_per_unit': '100.00'
                }
            ])
        }
        
        response = self.client.post('/api/v1/payments/', data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        payment = Payment.objects.get(id=response.data['id'])
        item = payment.items.first()
        
        # Проверяем историю цен
        price_history = ProductPriceHistory.objects.filter(
            product=item.product,
            counterparty=self.counterparty
        ).first()
        
        self.assertIsNotNone(price_history)
        self.assertEqual(price_history.price, Decimal('100.00'))
        self.assertEqual(price_history.unit, 'шт')
        self.assertEqual(price_history.invoice_date, date(2024, 1, 15))
        self.assertEqual(price_history.invoice_number, 'INV-001')
        self.assertEqual(price_history.payment, payment)
    
    def test_create_payment_with_items_no_price_history_without_contract(self):
        """История цен не создаётся, если нет договора (контрагента)"""
        import json
        data = {
            'payment_type': 'expense',
            'account_id': self.account.id,
            'category_id': self.category.id,
            # Не указываем contract_id
            'payment_date': '2024-01-15',
            'amount': '5000.00',
            'description': 'Test payment',
            'scan_file': self.mock_pdf,
            'items_input': json.dumps([
                {
                    'raw_name': 'Товар без договора',
                    'quantity': '10.000',
                    'unit': 'шт',
                    'price_per_unit': '100.00'
                }
            ])
        }
        
        response = self.client.post('/api/v1/payments/', data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        payment = Payment.objects.get(id=response.data['id'])
        item = payment.items.first()
        
        # История цен не должна создаваться
        price_history_count = ProductPriceHistory.objects.filter(
            product=item.product,
            payment=payment
        ).count()
        
        self.assertEqual(price_history_count, 0)
    
    def test_payment_serializer_includes_items(self):
        """Сериализатор платежа включает позиции"""
        payment = Payment.objects.create(
            legal_entity=self.legal_entity,
            account=self.account,
            category=self.category,
            payment_type=Payment.PaymentType.EXPENSE,
            payment_date='2024-01-15',
            amount=Decimal('5000.00'),
            scan_file=self.mock_pdf
        )
        
        product = Product.objects.create(name='Тест товар', default_unit='шт')
        PaymentItem.objects.create(
            payment=payment,
            product=product,
            raw_name='Тест товар',
            quantity=Decimal('10.000'),
            unit='шт',
            price_per_unit=Decimal('100.00'),
            amount=Decimal('1000.00')
        )
        
        response = self.client.get(f'/api/v1/payments/{payment.id}/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('items', response.data)
        self.assertEqual(len(response.data['items']), 1)
        self.assertEqual(response.data['items_count'], 1)
        self.assertEqual(response.data['items'][0]['raw_name'], 'Тест товар')
        self.assertEqual(response.data['items'][0]['product_name'], 'Тест товар')
    
    def test_payment_serializer_items_read_only(self):
        """Позиции доступны только для чтения через items"""
        data = {
            'payment_type': 'expense',
            'account_id': self.account.id,
            'category_id': self.category.id,
            'payment_date': '2024-01-15',
            'amount': '5000.00',
            'description': 'Test payment',
            'scan_file': self.mock_pdf,
            'items': [  # Попытка передать items напрямую (не должно работать)
                {
                    'raw_name': 'Прямая передача',
                    'quantity': '10.000',
                    'unit': 'шт',
                    'price_per_unit': '100.00'
                }
            ]
        }
        
        # items_input должен использоваться для создания
        response = self.client.post('/api/v1/payments/', data, format='multipart')
        
        # Платёж создаётся, но items не должны создаваться через поле items
        payment = Payment.objects.get(id=response.data['id'])
        self.assertEqual(payment.items.count(), 0)
        
        # Правильный способ - через items_input
        import json
        data['items_input'] = json.dumps(data.pop('items'))
        mock_pdf2 = SimpleUploadedFile(
            "document2.pdf",
            b"PDF file content 2",
            content_type="application/pdf"
        )
        data['scan_file'] = mock_pdf2
        
        response = self.client.post('/api/v1/payments/', data, format='multipart')
        payment2 = Payment.objects.get(id=response.data['id'])
        self.assertEqual(payment2.items.count(), 1)
