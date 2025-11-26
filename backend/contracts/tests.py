from decimal import Decimal
from django.db import IntegrityError
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from datetime import date, timedelta

from objects.models import Object
from accounting.models import Counterparty, LegalEntity, TaxSystem
from payments.models import Payment, ExpenseCategory
from .models import Contract, ContractAmendment, WorkScheduleItem, Act, ActPaymentAllocation


class ContractModelTests(TestCase):
    def setUp(self) -> None:
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва, ул. Примерная, д. 1',
        )
        self.other_object = Object.objects.create(
            name='Объект Б',
            address='г. Санкт-Петербург',
        )
        
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='Наша Фирма', short_name='НФ', inn='111', tax_system=self.tax_system
        )
        self.counterparty = Counterparty.objects.create(
            name='Подрядчик', short_name='ПДР', inn='222', type=Counterparty.Type.VENDOR
        )

    def _create_contract(self, **kwargs) -> Contract:
        defaults = {
            'object': self.object,
            'legal_entity': self.legal_entity,
            'counterparty': self.counterparty,
            'contract_type': Contract.Type.EXPENSE,
            'number': 'ДГ-001',
            'name': 'Монтаж',
            'contract_date': date(2023, 1, 1),
            'start_date': date(2023, 1, 10),
            'end_date': date(2023, 12, 31),
            'total_amount': Decimal('100000.00'),
        }
        defaults.update(kwargs)
        return Contract.objects.create(**defaults)

    def test_create_contract(self) -> None:
        contract = self._create_contract()
        self.assertEqual(Contract.objects.count(), 1)
        self.assertEqual(contract.object, self.object)
        self.assertEqual(contract.contract_type, Contract.Type.EXPENSE)

    def test_unique_number_per_object(self) -> None:
        self._create_contract()
        with self.assertRaises(ValidationError):
            self._create_contract() # Same number, same object

    def test_amendment_updates_contract(self) -> None:
        """Тест обновления договора через Доп. соглашение"""
        contract = self._create_contract()
        
        amendment = ContractAmendment.objects.create(
            contract=contract,
            number='ДС-1',
            date=date(2023, 6, 1),
            reason='Продление',
            new_end_date=date(2024, 1, 31),
            new_total_amount=Decimal('120000.00')
        )
        
        contract.refresh_from_db()
        self.assertEqual(contract.end_date, date(2024, 1, 31))
        self.assertEqual(contract.total_amount, Decimal('120000.00'))

    def test_work_schedule_validation(self) -> None:
        """Тест валидации дат графика"""
        contract = self._create_contract(
            start_date=date(2023, 1, 1),
            end_date=date(2023, 1, 31)
        )
        
        # Задача вне сроков (раньше)
        with self.assertRaises(ValidationError):
            WorkScheduleItem.objects.create(
                contract=contract,
                name='Задача 1',
                start_date=date(2022, 12, 31),
                end_date=date(2023, 1, 10)
            )
            
        # Задача вне сроков (позже)
        with self.assertRaises(ValidationError):
            WorkScheduleItem.objects.create(
                contract=contract,
                name='Задача 2',
                start_date=date(2023, 1, 20),
                end_date=date(2023, 2, 1)
            )

        # Корректная задача
        item = WorkScheduleItem.objects.create(
            contract=contract,
            name='Задача ОК',
            start_date=date(2023, 1, 5),
            end_date=date(2023, 1, 25)
        )
        self.assertEqual(WorkScheduleItem.objects.count(), 1)

    def test_act_creation(self) -> None:
        """Тест создания Акта"""
        contract = self._create_contract()
        
        act = Act.objects.create(
            contract=contract,
            number='АКТ-1',
            date=date(2023, 2, 1),
            amount_gross=Decimal('50000.00'),
            amount_net=Decimal('40000.00'),
            vat_amount=Decimal('10000.00')
        )
        self.assertEqual(act.status, Act.Status.DRAFT)
        
    def test_contract_balance(self) -> None:
        """Тест расчета баланса договора (по актам и оплаченным платежам)"""
        contract = self._create_contract()
        
        category = ExpenseCategory.objects.create(name='Test Cat', code='test_cat')
        
        # Создаем подписанный акт на 50000
        Act.objects.create(
            contract=contract,
            number='1',
            date=date(2023, 2, 1),
            amount_gross=Decimal('50000.00'),
            amount_net=Decimal('40000.00'),
            vat_amount=Decimal('10000.00'),
            status=Act.Status.SIGNED
        )
        
        # Платеж проведенный (PAID) - уменьшает долг
        Payment.objects.create(
            contract=contract,
            category=category,
            amount=Decimal('20000.00'),
            payment_date=date(2023, 2, 5),
            payment_type='expense',
            status='paid'
        )
        
        # Платеж в обработке (PENDING) - не должен влиять
        Payment.objects.create(
            contract=contract,
            category=category,
            amount=Decimal('10000.00'),
            payment_date=date(2023, 2, 6),
            payment_type='expense',
            status='pending'
        )
        
        # Баланс = Акты (50000) - Оплаченные Платежи (20000) = 30000
        self.assertEqual(contract.get_balance(), Decimal('30000.00'))

    def test_contract_margin(self) -> None:
        """Тест расчета маржинальности (Доход - Расход по субподряду)"""
        # 1. Доходный договор
        income_contract = self._create_contract(
            contract_type=Contract.Type.INCOME,
            number='GEN-1',
            total_amount=Decimal('1000000.00')
        )
        # Акт на 100к (net)
        Act.objects.create(contract=income_contract, number='1', date=date(2023,1,1), 
                           amount_gross=Decimal('120000'), amount_net=Decimal('100000'), vat_amount=Decimal('20000'),
                           status=Act.Status.SIGNED)
                           
        # 2. Расходный договор (субподряд)
        expense_contract = self._create_contract(
            contract_type=Contract.Type.EXPENSE,
            parent_contract=income_contract,
            number='SUB-1',
            total_amount=Decimal('500000.00')
        )
        # Акт на 40к (net)
        Act.objects.create(contract=expense_contract, number='sub-1', date=date(2023,1,1), 
                           amount_gross=Decimal('48000'), amount_net=Decimal('40000'), vat_amount=Decimal('8000'),
                           status=Act.Status.SIGNED)

        # Маржа = 100000 - 40000 = 60000
        self.assertEqual(income_contract.get_margin(), Decimal('60000.00'))
