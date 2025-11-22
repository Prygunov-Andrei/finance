from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from objects.models import Object
from contracts.models import Contract
from payments.models import Payment
from core.cashflow import CashFlowCalculator


class CashFlowCalculatorTests(TestCase):
    def setUp(self) -> None:
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва, ул. Примерная, д. 1',
        )
        self.contract = Contract.objects.create(
            object=self.object,
            number='ДГ-001',
            name='Монтаж инженерных систем',
            contract_date=timezone.now().date(),
            contractor='ООО "СтройИнжиниринг"',
            total_amount='1500000.00',
        )
        
        # Создаём платежи
        today = timezone.now().date()
        Payment.objects.create(
            contract=self.contract,
            payment_type=Payment.PaymentType.INCOME,
            payment_date=today - timedelta(days=10),
            amount=Decimal('500000.00'),
        )
        Payment.objects.create(
            contract=self.contract,
            payment_type=Payment.PaymentType.EXPENSE,
            payment_date=today - timedelta(days=5),
            amount=Decimal('200000.00'),
        )
        Payment.objects.create(
            contract=self.contract,
            payment_type=Payment.PaymentType.INCOME,
            payment_date=today - timedelta(days=2),
            amount=Decimal('300000.00'),
        )

    def test_calculate_for_contract(self) -> None:
        """Тест расчёта cash-flow для договора"""
        result = CashFlowCalculator.calculate_for_contract(self.contract.id)
        
        self.assertEqual(result['income'], Decimal('800000.00'))
        self.assertEqual(result['expense'], Decimal('200000.00'))
        self.assertEqual(result['cash_flow'], Decimal('600000.00'))

    def test_calculate_for_contract_with_period(self) -> None:
        """Тест расчёта cash-flow для договора за период"""
        today = timezone.now().date()
        start_date = today - timedelta(days=7)
        end_date = today
        
        result = CashFlowCalculator.calculate_for_contract(
            self.contract.id,
            start_date=start_date,
            end_date=end_date
        )
        
        # За последние 7 дней: только один income (300000) и один expense (200000)
        self.assertEqual(result['income'], Decimal('300000.00'))
        self.assertEqual(result['expense'], Decimal('200000.00'))
        self.assertEqual(result['cash_flow'], Decimal('100000.00'))

    def test_calculate_for_object(self) -> None:
        """Тест расчёта cash-flow для объекта"""
        result = CashFlowCalculator.calculate_for_object(self.object.id)
        
        self.assertEqual(result['income'], Decimal('800000.00'))
        self.assertEqual(result['expense'], Decimal('200000.00'))
        self.assertEqual(result['cash_flow'], Decimal('600000.00'))

    def test_calculate_for_all_objects(self) -> None:
        """Тест расчёта cash-flow для всех объектов"""
        # Создаём второй объект с платежами
        object2 = Object.objects.create(
            name='Объект Б',
            address='г. Санкт-Петербург, Невский проспект, д. 10',
        )
        contract2 = Contract.objects.create(
            object=object2,
            number='ДГ-002',
            name='Отделочные работы',
            contract_date=timezone.now().date(),
            contractor='ООО "РемСтрой"',
            total_amount='2000000.00',
        )
        Payment.objects.create(
            contract=contract2,
            payment_type=Payment.PaymentType.INCOME,
            payment_date=timezone.now().date(),
            amount=Decimal('100000.00'),
        )
        
        result = CashFlowCalculator.calculate_for_all_objects()
        
        # Общий доход: 800000 + 100000 = 900000
        # Общий расход: 200000
        self.assertEqual(result['income'], Decimal('900000.00'))
        self.assertEqual(result['expense'], Decimal('200000.00'))
        self.assertEqual(result['cash_flow'], Decimal('700000.00'))

    def test_calculate_by_periods_month(self) -> None:
        """Тест расчёта cash-flow по месяцам"""
        # Создаём платежи в разных месяцах
        today = timezone.now().date()
        Payment.objects.create(
            contract=self.contract,
            payment_type=Payment.PaymentType.INCOME,
            payment_date=today.replace(day=1) - timedelta(days=30),
            amount=Decimal('100000.00'),
        )
        
        result = CashFlowCalculator.calculate_by_periods(
            contract_id=self.contract.id,
            period_type='month'
        )
        
        self.assertGreater(len(result), 0)
        self.assertIn('period', result[0])
        self.assertIn('income', result[0])
        self.assertIn('expense', result[0])
        self.assertIn('cash_flow', result[0])

    def test_calculate_by_periods_week(self) -> None:
        """Тест расчёта cash-flow по неделям"""
        result = CashFlowCalculator.calculate_by_periods(
            contract_id=self.contract.id,
            period_type='week'
        )
        
        self.assertGreater(len(result), 0)
        self.assertIn('period', result[0])
        self.assertIn('income', result[0])
        self.assertIn('expense', result[0])
        self.assertIn('cash_flow', result[0])

    def test_calculate_by_periods_day(self) -> None:
        """Тест расчёта cash-flow по дням"""
        result = CashFlowCalculator.calculate_by_periods(
            contract_id=self.contract.id,
            period_type='day'
        )
        
        self.assertGreater(len(result), 0)
        self.assertIn('period', result[0])
        self.assertIn('income', result[0])
        self.assertIn('expense', result[0])
        self.assertIn('cash_flow', result[0])

    def test_calculate_empty_contract(self) -> None:
        """Тест расчёта cash-flow для договора без платежей"""
        empty_contract = Contract.objects.create(
            object=self.object,
            number='ДГ-003',
            name='Пустой договор',
            contract_date=timezone.now().date(),
            contractor='ООО "Тест"',
            total_amount='1000000.00',
        )
        
        result = CashFlowCalculator.calculate_for_contract(empty_contract.id)
        
        self.assertEqual(result['income'], Decimal('0'))
        self.assertEqual(result['expense'], Decimal('0'))
        self.assertEqual(result['cash_flow'], Decimal('0'))


class ModelCashFlowMethodsTests(TestCase):
    """Тесты методов cash-flow в моделях"""
    
    def setUp(self) -> None:
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва, ул. Примерная, д. 1',
        )
        self.contract = Contract.objects.create(
            object=self.object,
            number='ДГ-001',
            name='Монтаж инженерных систем',
            contract_date=timezone.now().date(),
            contractor='ООО "СтройИнжиниринг"',
            total_amount='1500000.00',
        )
        Payment.objects.create(
            contract=self.contract,
            payment_type=Payment.PaymentType.INCOME,
            payment_date=timezone.now().date(),
            amount=Decimal('500000.00'),
        )
        Payment.objects.create(
            contract=self.contract,
            payment_type=Payment.PaymentType.EXPENSE,
            payment_date=timezone.now().date(),
            amount=Decimal('200000.00'),
        )

    def test_object_get_cash_flow(self) -> None:
        """Тест метода get_cash_flow объекта"""
        result = self.object.get_cash_flow()
        
        self.assertIn('income', result)
        self.assertIn('expense', result)
        self.assertIn('cash_flow', result)
        self.assertEqual(result['income'], Decimal('500000.00'))
        self.assertEqual(result['expense'], Decimal('200000.00'))

    def test_object_get_cash_flow_by_periods(self) -> None:
        """Тест метода get_cash_flow_by_periods объекта"""
        result = self.object.get_cash_flow_by_periods(period_type='month')
        
        self.assertIsInstance(result, list)
        if result:
            self.assertIn('period', result[0])
            self.assertIn('income', result[0])

    def test_contract_get_cash_flow(self) -> None:
        """Тест метода get_cash_flow договора"""
        result = self.contract.get_cash_flow()
        
        self.assertIn('income', result)
        self.assertIn('expense', result)
        self.assertIn('cash_flow', result)
        self.assertEqual(result['income'], Decimal('500000.00'))
        self.assertEqual(result['expense'], Decimal('200000.00'))

    def test_contract_get_cash_flow_by_periods(self) -> None:
        """Тест метода get_cash_flow_by_periods договора"""
        result = self.contract.get_cash_flow_by_periods(period_type='month')
        
        self.assertIsInstance(result, list)
        if result:
            self.assertIn('period', result[0])
            self.assertIn('income', result[0])

