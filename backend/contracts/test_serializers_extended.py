from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from datetime import date, timedelta

from objects.models import Object
from accounting.models import Counterparty, LegalEntity, TaxSystem
from pricelists.models import PriceList
from .models import (
    Contract, ContractAmendment, WorkScheduleItem, Act, 
    FrameworkContract
)
from .serializers import (
    FrameworkContractSerializer, FrameworkContractListSerializer,
    ContractSerializer, ContractListSerializer,
    ActSerializer, ContractAmendmentSerializer,
    WorkScheduleItemSerializer
)


class FrameworkContractSerializerTests(TestCase):
    """Тесты сериализаторов FrameworkContract"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User'
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
    
    def test_framework_contract_serializer_read(self):
        """Тест чтения рамочного договора через сериализатор"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        serializer = FrameworkContractSerializer(framework)
        data = serializer.data
        
        self.assertIn('id', data)
        self.assertIn('number', data)
        self.assertIn('name', data)
        self.assertIn('legal_entity_details', data)
        self.assertIn('counterparty_details', data)
        self.assertIn('is_active', data)
        self.assertIn('is_expired', data)
        self.assertIn('days_until_expiration', data)
        self.assertIn('contracts_count', data)
        self.assertIn('total_contracts_amount', data)
        self.assertIn('created_by_name', data)
        self.assertEqual(data['created_by_name'], 'Test User')
    
    def test_framework_contract_serializer_with_price_lists(self):
        """Тест сериализатора с прайс-листами"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        price_list = PriceList.objects.create(
            number='ПЛ-001',
            name='Прайс-лист',
            date=date.today()
        )
        framework.price_lists.add(price_list)
        
        serializer = FrameworkContractSerializer(framework)
        data = serializer.data
        
        self.assertIn('price_lists', data)
        self.assertIn('price_lists_details', data)
        self.assertEqual(len(data['price_lists_details']), 1)
    
    def test_framework_contract_list_serializer(self):
        """Тест упрощенного сериализатора для списка"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        serializer = FrameworkContractListSerializer(framework)
        data = serializer.data
        
        self.assertIn('id', data)
        self.assertIn('number', data)
        self.assertIn('counterparty_name', data)
        self.assertIn('legal_entity_name', data)
        self.assertIn('is_active', data)
        self.assertIn('contracts_count', data)
        self.assertNotIn('price_lists_details', data)  # Не должно быть в списке
        self.assertNotIn('created_by_name', data)
    
    def test_framework_contract_serializer_create(self):
        """Тест создания рамочного договора через сериализатор"""
        data = {
            'name': 'Рамочный договор',
            'date': date.today().isoformat(),
            'valid_from': date.today().isoformat(),
            'valid_until': (date.today() + timedelta(days=365)).isoformat(),
            'legal_entity': self.legal_entity.id,
            'counterparty': self.vendor.id,
            'status': FrameworkContract.Status.DRAFT,
        }
        
        serializer = FrameworkContractSerializer(data=data)
        is_valid = serializer.is_valid()
        if not is_valid:
            print(f"Serializer errors: {serializer.errors}")
        self.assertTrue(is_valid, serializer.errors)
        framework = serializer.save(created_by=self.user)
        
        self.assertEqual(framework.name, 'Рамочный договор')
        self.assertEqual(framework.created_by, self.user)


class ContractSerializerExtendedTests(TestCase):
    """Расширенные тесты сериализаторов Contract"""
    
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
            password='testpass123',
            first_name='Manager',
            last_name='User'
        )
        self.engineer = User.objects.create_user(
            username='engineer',
            password='testpass123',
            first_name='Engineer',
            last_name='User'
        )
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
    
    def test_contract_serializer_with_framework_contract(self):
        """Тест сериализатора с рамочным договором"""
        contract = Contract.objects.create(
            object=self.object,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор',
            contract_date=date.today(),
            total_amount=Decimal('100000.00'),
            framework_contract=self.framework
        )
        
        serializer = ContractSerializer(contract)
        data = serializer.data
        
        self.assertIn('framework_contract', data)
        self.assertIn('framework_contract_details', data)
        self.assertEqual(data['framework_contract'], self.framework.id)
        self.assertIsNotNone(data['framework_contract_details'])
    
    def test_contract_serializer_with_responsible_persons(self):
        """Тест сериализатора с ответственными лицами"""
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
        
        serializer = ContractSerializer(contract)
        data = serializer.data
        
        self.assertIn('responsible_manager', data)
        self.assertIn('responsible_manager_name', data)
        self.assertIn('responsible_engineer', data)
        self.assertIn('responsible_engineer_name', data)
        self.assertEqual(data['responsible_manager_name'], 'Manager User')
        self.assertEqual(data['responsible_engineer_name'], 'Engineer User')
    
    def test_contract_list_serializer_fields(self):
        """Тест полей упрощенного сериализатора"""
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
        
        serializer = ContractListSerializer(contract)
        data = serializer.data
        
        self.assertIn('id', data)
        self.assertIn('object_name', data)
        self.assertIn('number', data)
        self.assertIn('name', data)
        self.assertIn('contract_type', data)
        self.assertIn('counterparty_name', data)
        self.assertIn('legal_entity_name', data)
        self.assertIn('total_amount', data)
        self.assertIn('currency', data)
        self.assertIn('status', data)
        self.assertIn('contract_date', data)
        # Не должно быть детальных полей
        self.assertNotIn('notes', data)
        self.assertNotIn('framework_contract_details', data)


class ActSerializerTests(TestCase):
    """Тесты сериализатора Act"""
    
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
    
    def test_act_serializer_read(self):
        """Тест чтения акта через сериализатор"""
        act = Act.objects.create(
            contract=self.contract,
            number='АКТ-1',
            date=date.today(),
            amount_gross=Decimal('50000.00'),
            amount_net=Decimal('40000.00'),
            vat_amount=Decimal('10000.00')
        )
        
        serializer = ActSerializer(act)
        data = serializer.data
        
        self.assertIn('id', data)
        self.assertIn('contract', data)
        self.assertIn('contract_number', data)
        self.assertIn('number', data)
        self.assertIn('date', data)
        self.assertIn('amount_gross', data)
        self.assertIn('amount_net', data)
        self.assertIn('vat_amount', data)
        self.assertIn('status', data)
        self.assertIn('unpaid_amount', data)
        self.assertEqual(data['contract_number'], 'ДГ-001')
    
    def test_act_serializer_unpaid_amount(self):
        """Тест вычисления неоплаченной суммы"""
        from payments.models import Payment, ExpenseCategory
        
        act = Act.objects.create(
            contract=self.contract,
            number='АКТ-1',
            date=date.today(),
            amount_gross=Decimal('50000.00'),
            amount_net=Decimal('40000.00'),
            vat_amount=Decimal('10000.00')
        )
        
        category = ExpenseCategory.objects.create(name='Test', code='test')
        payment = Payment.objects.create(
            contract=self.contract,
            category=category,
            amount=Decimal('20000.00'),
            payment_date=date.today(),
            payment_type='expense',
            status='paid'
        )
        
        from .models import ActPaymentAllocation
        ActPaymentAllocation.objects.create(
            act=act,
            payment=payment,
            amount=Decimal('20000.00')
        )
        
        serializer = ActSerializer(act)
        data = serializer.data
        
        # Неоплаченная сумма = 50000 - 20000 = 30000
        self.assertEqual(Decimal(str(data['unpaid_amount'])), Decimal('30000.00'))


class ContractAmendmentSerializerTests(TestCase):
    """Тесты сериализатора ContractAmendment"""
    
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
    
    def test_amendment_serializer(self):
        """Тест сериализатора доп. соглашения"""
        amendment = ContractAmendment.objects.create(
            contract=self.contract,
            number='ДС-1',
            date=date.today(),
            reason='Продление',
            new_total_amount=Decimal('120000.00')
        )
        
        serializer = ContractAmendmentSerializer(amendment)
        data = serializer.data
        
        self.assertIn('id', data)
        self.assertIn('contract', data)
        self.assertIn('number', data)
        self.assertIn('date', data)
        self.assertIn('reason', data)
        self.assertIn('new_total_amount', data)


class WorkScheduleItemSerializerTests(TestCase):
    """Тесты сериализатора WorkScheduleItem"""
    
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
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            total_amount=Decimal('100000.00')
        )
    
    def test_schedule_item_serializer(self):
        """Тест сериализатора задачи графика"""
        item = WorkScheduleItem.objects.create(
            contract=self.contract,
            name='Монтаж систем',
            start_date=date.today(),
            end_date=date.today() + timedelta(days=10),
            workers_count=5,
            status=WorkScheduleItem.Status.PENDING
        )
        
        serializer = WorkScheduleItemSerializer(item)
        data = serializer.data
        
        self.assertIn('id', data)
        self.assertIn('contract', data)
        self.assertIn('name', data)
        self.assertIn('start_date', data)
        self.assertIn('end_date', data)
        self.assertIn('workers_count', data)
        self.assertIn('status', data)
