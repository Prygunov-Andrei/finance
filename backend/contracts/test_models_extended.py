from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from datetime import date, timedelta

from objects.models import Object
from accounting.models import Counterparty, LegalEntity, TaxSystem
from payments.models import Payment, ExpenseCategory
from .models import (
    Contract, ContractAmendment, WorkScheduleItem, Act, 
    ActPaymentAllocation, FrameworkContract
)


class ActModelTests(TestCase):
    """Расширенные тесты модели Act"""
    
    def setUp(self):
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='Наша Фирма',
            short_name='НФ',
            inn='1111111111',
            tax_system=self.tax_system
        )
        self.counterparty = Counterparty.objects.create(
            name='Подрядчик',
            short_name='ПДР',
            inn='2222222222',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва'
        )
        self.contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00'),
            vat_rate=Decimal('20.00')
        )
    
    def test_act_auto_calculate_vat(self):
        """Тест авторасчета НДС при создании акта"""
        act = Act.objects.create(
            contract=self.contract,
            number='АКТ-1',
            date=date.today(),
            amount_gross=Decimal('120000.00')
        )
        
        # Проверяем что НДС рассчитался автоматически
        self.assertIsNotNone(act.amount_net)
        self.assertIsNotNone(act.vat_amount)
        # 120000 / 1.2 = 100000 (net), 20000 (vat)
        self.assertEqual(act.amount_net, Decimal('100000.00'))
        self.assertEqual(act.vat_amount, Decimal('20000.00'))
    
    def test_act_with_existing_vat(self):
        """Тест создания акта с уже указанным НДС"""
        act = Act.objects.create(
            contract=self.contract,
            number='АКТ-1',
            date=date.today(),
            amount_gross=Decimal('120000.00'),
            amount_net=Decimal('100000.00'),
            vat_amount=Decimal('20000.00')
        )
        
        # Значения не должны пересчитаться
        self.assertEqual(act.amount_net, Decimal('100000.00'))
        self.assertEqual(act.vat_amount, Decimal('20000.00'))
    
    def test_act_status_choices(self):
        """Тест статусов акта"""
        act = Act.objects.create(
            contract=self.contract,
            number='АКТ-1',
            date=date.today(),
            amount_gross=Decimal('50000.00')
        )
        
        self.assertEqual(act.status, Act.Status.DRAFT)
        
        act.status = Act.Status.SIGNED
        act.save()
        self.assertEqual(act.status, Act.Status.SIGNED)
        
        act.status = Act.Status.CANCELLED
        act.save()
        self.assertEqual(act.status, Act.Status.CANCELLED)


class ContractAmendmentModelTests(TestCase):
    """Расширенные тесты модели ContractAmendment"""
    
    def setUp(self):
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='Наша Фирма',
            short_name='НФ',
            inn='1111111111',
            tax_system=self.tax_system
        )
        self.counterparty = Counterparty.objects.create(
            name='Подрядчик',
            short_name='ПДР',
            inn='2222222222',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва'
        )
        self.contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            start_date=date(2023, 1, 1),
            end_date=date(2023, 12, 31),
            total_amount=Decimal('100000.00')
        )
    
    def test_amendment_updates_start_date(self):
        """Тест обновления даты начала через доп. соглашение"""
        amendment = ContractAmendment.objects.create(
            contract=self.contract,
            number='ДС-1',
            date=date(2023, 6, 1),
            reason='Перенос начала',
            new_start_date=date(2023, 2, 1)
        )
        
        self.contract.refresh_from_db()
        self.assertEqual(self.contract.start_date, date(2023, 2, 1))
    
    def test_amendment_updates_end_date(self):
        """Тест обновления даты окончания через доп. соглашение"""
        amendment = ContractAmendment.objects.create(
            contract=self.contract,
            number='ДС-1',
            date=date(2023, 6, 1),
            reason='Продление',
            new_end_date=date(2024, 1, 31)
        )
        
        self.contract.refresh_from_db()
        self.assertEqual(self.contract.end_date, date(2024, 1, 31))
    
    def test_amendment_updates_all_fields(self):
        """Тест обновления всех полей через доп. соглашение"""
        amendment = ContractAmendment.objects.create(
            contract=self.contract,
            number='ДС-1',
            date=date(2023, 6, 1),
            reason='Комплексное изменение',
            new_start_date=date(2023, 2, 1),
            new_end_date=date(2024, 1, 31),
            new_total_amount=Decimal('150000.00')
        )
        
        self.contract.refresh_from_db()
        self.assertEqual(self.contract.start_date, date(2023, 2, 1))
        self.assertEqual(self.contract.end_date, date(2024, 1, 31))
        self.assertEqual(self.contract.total_amount, Decimal('150000.00'))
    
    def test_amendment_unique_number_per_contract(self):
        """Тест уникальности номера доп. соглашения в рамках договора"""
        ContractAmendment.objects.create(
            contract=self.contract,
            number='ДС-1',
            date=date.today(),
            reason='Первое'
        )
        
        # Можно создать с тем же номером для другого договора
        contract2 = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-002',
            name='Договор 2',
            contract_date=date.today(),
            total_amount=Decimal('200000.00')
        )
        
        ContractAmendment.objects.create(
            contract=contract2,
            number='ДС-1',
            date=date.today(),
            reason='Второе'
        )
        
        # Но нельзя с тем же номером для того же договора
        with self.assertRaises(ValidationError):
            amendment = ContractAmendment(
                contract=self.contract,
                number='ДС-1',
                date=date.today(),
                reason='Дубликат'
            )
            amendment.full_clean()
            amendment.save()


class WorkScheduleItemModelTests(TestCase):
    """Расширенные тесты модели WorkScheduleItem"""
    
    def setUp(self):
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='Наша Фирма',
            short_name='НФ',
            inn='1111111111',
            tax_system=self.tax_system
        )
        self.counterparty = Counterparty.objects.create(
            name='Подрядчик',
            short_name='ПДР',
            inn='2222222222',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва'
        )
        self.contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            start_date=date(2023, 1, 1),
            end_date=date(2023, 12, 31),
            total_amount=Decimal('100000.00')
        )
    
    def test_schedule_item_validation_start_after_end(self):
        """Тест валидации что дата начала не позже даты окончания"""
        with self.assertRaises(ValidationError):
            item = WorkScheduleItem(
                contract=self.contract,
                name='Задача',
                start_date=date(2023, 1, 20),
                end_date=date(2023, 1, 10)  # Раньше начала
            )
            item.full_clean()
    
    def test_schedule_item_status_choices(self):
        """Тест статусов задачи графика"""
        item = WorkScheduleItem.objects.create(
            contract=self.contract,
            name='Задача',
            start_date=date(2023, 1, 5),
            end_date=date(2023, 1, 15)
        )
        
        self.assertEqual(item.status, WorkScheduleItem.Status.PENDING)
        
        item.status = WorkScheduleItem.Status.IN_PROGRESS
        item.save()
        self.assertEqual(item.status, WorkScheduleItem.Status.IN_PROGRESS)
        
        item.status = WorkScheduleItem.Status.DONE
        item.save()
        self.assertEqual(item.status, WorkScheduleItem.Status.DONE)
    
    def test_schedule_item_workers_count(self):
        """Тест поля количества рабочих"""
        item = WorkScheduleItem.objects.create(
            contract=self.contract,
            name='Задача',
            start_date=date(2023, 1, 5),
            end_date=date(2023, 1, 15),
            workers_count=10
        )
        
        self.assertEqual(item.workers_count, 10)


class ActPaymentAllocationModelTests(TestCase):
    """Тесты модели ActPaymentAllocation"""
    
    def setUp(self):
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='Наша Фирма',
            short_name='НФ',
            inn='1111111111',
            tax_system=self.tax_system
        )
        self.counterparty = Counterparty.objects.create(
            name='Подрядчик',
            short_name='ПДР',
            inn='2222222222',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва'
        )
        self.contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00')
        )
        self.category = ExpenseCategory.objects.create(
            name='Категория',
            code='cat1'
        )
        self.act = Act.objects.create(
            contract=self.contract,
            number='АКТ-1',
            date=date.today(),
            amount_gross=Decimal('50000.00'),
            amount_net=Decimal('40000.00'),
            vat_amount=Decimal('10000.00')
        )
        self.payment = Payment.objects.create(
            contract=self.contract,
            category=self.category,
            amount=Decimal('30000.00'),
            payment_date=date.today(),
            payment_type='expense',
            status='paid'
        )
    
    def test_create_allocation(self):
        """Тест создания распределения оплаты"""
        allocation = ActPaymentAllocation.objects.create(
            act=self.act,
            payment=self.payment,
            amount=Decimal('30000.00')
        )
        
        self.assertEqual(ActPaymentAllocation.objects.count(), 1)
        self.assertEqual(allocation.act, self.act)
        self.assertEqual(allocation.payment, self.payment)
        self.assertEqual(allocation.amount, Decimal('30000.00'))
    
    def test_allocation_created_at(self):
        """Тест что created_at устанавливается автоматически"""
        allocation = ActPaymentAllocation.objects.create(
            act=self.act,
            payment=self.payment,
            amount=Decimal('30000.00')
        )
        
        self.assertIsNotNone(allocation.created_at)


class FrameworkContractExtendedTests(TestCase):
    """Расширенные тесты FrameworkContract"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='Наша Фирма ООО',
            short_name='НФ',
            inn='1111111111',
            tax_system=self.tax_system
        )
        self.vendor = Counterparty.objects.create(
            name='Исполнитель ООО',
            short_name='Исполнитель',
            inn='2222222222',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва'
        )
    
    def test_days_until_expiration(self):
        """Тест вычисляемого свойства days_until_expiration"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=100),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        self.assertEqual(framework.days_until_expiration, 100)
        
        # Создаем новый договор с прошлой датой для теста отрицательного значения
        framework2 = FrameworkContract.objects.create(
            name='Рамочный договор 2',
            date=date.today() - timedelta(days=10),
            valid_from=date.today() - timedelta(days=10),
            valid_until=date.today() - timedelta(days=5),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        self.assertEqual(framework2.days_until_expiration, -5)
    
    def test_total_contracts_amount(self):
        """Тест вычисляемого свойства total_contracts_amount"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        
        self.assertEqual(framework.total_contracts_amount, Decimal('0'))
        
        contract1 = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор 1',
            contract_date=date.today(),
            total_amount=Decimal('100000.00'),
            framework_contract=framework
        )
        contract2 = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-002',
            name='Договор 2',
            contract_date=date.today(),
            total_amount=Decimal('200000.00'),
            framework_contract=framework
        )
        
        self.assertEqual(framework.total_contracts_amount, Decimal('300000.00'))
    
    def test_is_active_with_valid_from_future(self):
        """Тест is_active когда valid_from в будущем"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today() + timedelta(days=10),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        
        self.assertFalse(framework.is_active)
    
    def test_is_active_with_valid_until_past(self):
        """Тест is_active когда valid_until в прошлом"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today() - timedelta(days=100),
            valid_until=date.today() - timedelta(days=10),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        
        self.assertFalse(framework.is_active)
    
    def test_framework_contract_with_both_counterparty(self):
        """Тест что рамочный договор можно создать с контрагентом типа 'both'"""
        both_counterparty = Counterparty.objects.create(
            name='И Заказчик и Исполнитель',
            short_name='Оба',
            inn='5555555555',
            type=Counterparty.Type.BOTH,
            legal_form=Counterparty.LegalForm.OOO
        )
        
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=both_counterparty,
            created_by=self.user
        )
        
        framework.full_clean()  # Не должно быть ошибки
        self.assertEqual(framework.counterparty, both_counterparty)


class ContractExtendedTests(TestCase):
    """Расширенные тесты модели Contract"""
    
    def setUp(self):
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='Наша Фирма',
            short_name='НФ',
            inn='1111111111',
            tax_system=self.tax_system
        )
        self.counterparty = Counterparty.objects.create(
            name='Подрядчик',
            short_name='ПДР',
            inn='2222222222',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва'
        )
        self.manager = User.objects.create_user(
            username='manager',
            password='testpass123'
        )
        self.engineer = User.objects.create_user(
            username='engineer',
            password='testpass123'
        )
    
    def test_contract_with_responsible_persons(self):
        """Тест создания договора с ответственными лицами"""
        contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00'),
            responsible_manager=self.manager,
            responsible_engineer=self.engineer
        )
        
        self.assertEqual(contract.responsible_manager, self.manager)
        self.assertEqual(contract.responsible_engineer, self.engineer)
    
    def test_contract_get_margin_for_expense(self):
        """Тест что маржа для расходного договора равна 0"""
        contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00')
        )
        
        self.assertEqual(contract.get_margin(), Decimal('0'))
    
    def test_contract_get_balance_without_acts(self):
        """Тест баланса договора без актов"""
        contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00')
        )
        
        self.assertEqual(contract.get_balance(), Decimal('0'))
    
    def test_contract_get_balance_without_payments(self):
        """Тест баланса договора без платежей"""
        contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00')
        )
        
        Act.objects.create(
            contract=contract,
            number='АКТ-1',
            date=date.today(),
            amount_gross=Decimal('50000.00'),
            amount_net=Decimal('40000.00'),
            vat_amount=Decimal('10000.00'),
            status=Act.Status.SIGNED
        )
        
        self.assertEqual(contract.get_balance(), Decimal('50000.00'))
