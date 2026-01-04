from django.test import TestCase
from decimal import Decimal
from datetime import date
from pydantic import ValidationError
from llm_services.schemas import (
    VendorInfo, BuyerInfo, InvoiceInfo, TotalsInfo,
    InvoiceItem, ParsedInvoice, FutureFields
)


class SchemasTest(TestCase):
    """Тесты Pydantic схем"""
    
    def test_vendor_info(self):
        """Создание VendorInfo"""
        vendor = VendorInfo(name='ООО Тест', inn='1234567890', kpp='123456789')
        self.assertEqual(vendor.name, 'ООО Тест')
        self.assertEqual(vendor.inn, '1234567890')
        self.assertEqual(vendor.kpp, '123456789')
    
    def test_vendor_info_without_kpp(self):
        """VendorInfo без KPP"""
        vendor = VendorInfo(name='ИП Иванов', inn='123456789012')
        self.assertIsNone(vendor.kpp)
    
    def test_buyer_info(self):
        """Создание BuyerInfo"""
        buyer = BuyerInfo(name='ООО Наша Компания', inn='0987654321')
        self.assertEqual(buyer.name, 'ООО Наша Компания')
        self.assertEqual(buyer.inn, '0987654321')
    
    def test_invoice_info(self):
        """Создание InvoiceInfo"""
        invoice = InvoiceInfo(number='СЧ-123', date=date(2024, 1, 15))
        self.assertEqual(invoice.number, 'СЧ-123')
        self.assertEqual(invoice.date, date(2024, 1, 15))
    
    def test_totals_info(self):
        """Создание TotalsInfo"""
        totals = TotalsInfo(
            amount_gross=Decimal('10000.00'),
            vat_amount=Decimal('1666.67')
        )
        self.assertEqual(totals.amount_gross, Decimal('10000.00'))
        self.assertEqual(totals.vat_amount, Decimal('1666.67'))
    
    def test_invoice_item(self):
        """Создание InvoiceItem"""
        item = InvoiceItem(
            name='Вентилятор ВКК-125',
            quantity=Decimal('10'),
            unit='шт',
            price_per_unit=Decimal('1500.00')
        )
        self.assertEqual(item.name, 'Вентилятор ВКК-125')
        self.assertEqual(item.quantity, Decimal('10'))
        self.assertEqual(item.unit, 'шт')
        self.assertEqual(item.price_per_unit, Decimal('1500.00'))
    
    def test_parsed_invoice(self):
        """Создание полной структуры ParsedInvoice"""
        invoice = ParsedInvoice(
            vendor=VendorInfo(name='ООО Тест', inn='1234567890'),
            buyer=BuyerInfo(name='ООО Наша', inn='0987654321'),
            invoice=InvoiceInfo(number='123', date=date(2024, 1, 15)),
            totals=TotalsInfo(
                amount_gross=Decimal('10000.00'),
                vat_amount=Decimal('1666.67')
            ),
            items=[
                InvoiceItem(
                    name='Товар 1',
                    quantity=Decimal('5'),
                    unit='шт',
                    price_per_unit=Decimal('2000.00')
                )
            ],
            confidence=0.95
        )
        
        self.assertEqual(invoice.vendor.name, 'ООО Тест')
        self.assertEqual(invoice.buyer.name, 'ООО Наша')
        self.assertEqual(len(invoice.items), 1)
        self.assertEqual(invoice.confidence, 0.95)
    
    def test_parsed_invoice_confidence_validation(self):
        """Валидация confidence (0.0-1.0)"""
        # Нормальные значения
        invoice1 = ParsedInvoice(
            vendor=VendorInfo(name='Тест', inn='123'),
            buyer=BuyerInfo(name='Наша', inn='456'),
            invoice=InvoiceInfo(number='1', date=date.today()),
            totals=TotalsInfo(amount_gross=Decimal('1000'), vat_amount=Decimal('200')),
            items=[],
            confidence=0.5
        )
        self.assertEqual(invoice1.confidence, 0.5)
        
        # Граничные значения
        invoice2 = ParsedInvoice(
            vendor=VendorInfo(name='Тест', inn='123'),
            buyer=BuyerInfo(name='Наша', inn='456'),
            invoice=InvoiceInfo(number='1', date=date.today()),
            totals=TotalsInfo(amount_gross=Decimal('1000'), vat_amount=Decimal('200')),
            items=[],
            confidence=1.0
        )
        self.assertEqual(invoice2.confidence, 1.0)
        
        # Ошибка при отрицательном значении
        with self.assertRaises(ValidationError):
            ParsedInvoice(
                vendor=VendorInfo(name='Тест', inn='123'),
                buyer=BuyerInfo(name='Наша', inn='456'),
                invoice=InvoiceInfo(number='1', date=date.today()),
                totals=TotalsInfo(amount_gross=Decimal('1000'), vat_amount=Decimal('200')),
                items=[],
                confidence=-0.1
            )
        
        # Ошибка при значении > 1.0
        with self.assertRaises(ValidationError):
            ParsedInvoice(
                vendor=VendorInfo(name='Тест', inn='123'),
                buyer=BuyerInfo(name='Наша', inn='456'),
                invoice=InvoiceInfo(number='1', date=date.today()),
                totals=TotalsInfo(amount_gross=Decimal('1000'), vat_amount=Decimal('200')),
                items=[],
                confidence=1.1
            )
    
    def test_parsed_invoice_json_serialization(self):
        """Сериализация в JSON"""
        invoice = ParsedInvoice(
            vendor=VendorInfo(name='ООО Тест', inn='1234567890'),
            buyer=BuyerInfo(name='ООО Наша', inn='0987654321'),
            invoice=InvoiceInfo(number='123', date=date(2024, 1, 15)),
            totals=TotalsInfo(
                amount_gross=Decimal('10000.00'),
                vat_amount=Decimal('1666.67')
            ),
            items=[],
            confidence=0.95
        )
        
        # Конвертация в dict (используется json_encoders)
        data = invoice.dict()
        self.assertIsInstance(data, dict)
        self.assertEqual(data['vendor']['name'], 'ООО Тест')
    
    def test_future_fields(self):
        """FutureFields опциональные поля"""
        future = FutureFields(
            contract_number='ДГ-123',
            manager_name='Иванов Иван',
            manager_phone='+79991234567',
            manager_email='ivan@test.ru',
            valid_until=date(2024, 12, 31),
            delivery_address='г. Москва, ул. Тестовая, д.1',
            shipping_terms='Самовывоз'
        )
        
        self.assertEqual(future.contract_number, 'ДГ-123')
        self.assertEqual(future.manager_name, 'Иванов Иван')
        self.assertIsNotNone(future.valid_until)
    
    def test_future_fields_all_none(self):
        """FutureFields все поля None"""
        future = FutureFields()
        self.assertIsNone(future.contract_number)
        self.assertIsNone(future.manager_name)
