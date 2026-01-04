from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from datetime import date, timedelta

from accounting.models import Counterparty, LegalEntity, TaxSystem
from pricelists.models import PriceList
from .models import FrameworkContract, Contract
from objects.models import Object


class FrameworkContractModelTests(TestCase):
    """Тесты модели FrameworkContract"""
    
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
        self.customer = Counterparty.objects.create(
            name='Заказчик ООО',
            short_name='Заказчик',
            inn='3333333333',
            type=Counterparty.Type.CUSTOMER,
            legal_form=Counterparty.LegalForm.OOO
        )
    
    def test_create_framework_contract(self):
        """Тест создания рамочного договора"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор с ООО Монтаж',
            date=date(2024, 1, 1),
            valid_from=date(2024, 1, 1),
            valid_until=date(2024, 12, 31),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        self.assertEqual(FrameworkContract.objects.count(), 1)
        self.assertTrue(framework.number.startswith('РД-'))
        self.assertEqual(framework.status, FrameworkContract.Status.DRAFT)
        self.assertEqual(framework.counterparty, self.vendor)
    
    def test_auto_generate_number(self):
        """Тест автогенерации номера"""
        framework1 = FrameworkContract.objects.create(
            name='Рамочный договор 1',
            date=date(2024, 1, 1),
            valid_from=date(2024, 1, 1),
            valid_until=date(2024, 12, 31),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        framework2 = FrameworkContract.objects.create(
            name='Рамочный договор 2',
            date=date(2024, 1, 1),
            valid_from=date(2024, 1, 1),
            valid_until=date(2024, 12, 31),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        self.assertNotEqual(framework1.number, framework2.number)
        self.assertTrue(framework1.number.endswith('001'))
        self.assertTrue(framework2.number.endswith('002'))
    
    def test_counterparty_must_be_vendor(self):
        """Тест что контрагент должен быть Исполнителем"""
        with self.assertRaises(ValidationError):
            framework = FrameworkContract(
                name='Рамочный договор',
                date=date(2024, 1, 1),
                valid_from=date(2024, 1, 1),
                valid_until=date(2024, 12, 31),
                legal_entity=self.legal_entity,
                counterparty=self.customer,  # Заказчик, а не Исполнитель
                created_by=self.user
            )
            framework.full_clean()
    
    def test_valid_until_after_valid_from(self):
        """Тест валидации дат"""
        with self.assertRaises(ValidationError):
            framework = FrameworkContract(
                name='Рамочный договор',
                date=date(2024, 1, 1),
                valid_from=date(2024, 12, 31),
                valid_until=date(2024, 1, 1),  # Раньше valid_from
                legal_entity=self.legal_entity,
                counterparty=self.vendor,
                created_by=self.user
            )
            framework.full_clean()
    
    def test_is_expired_property(self):
        """Тест вычисляемого свойства is_expired"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date(2023, 1, 1),
            valid_from=date(2023, 1, 1),
            valid_until=date(2023, 12, 31),  # Прошлый год
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        self.assertTrue(framework.is_expired)
        
        framework_future = FrameworkContract.objects.create(
            name='Рамочный договор будущий',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        self.assertFalse(framework_future.is_expired)
    
    def test_is_active_property(self):
        """Тест вычисляемого свойства is_active"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today() - timedelta(days=10),
            valid_until=date.today() + timedelta(days=100),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        
        self.assertTrue(framework.is_active)
        
        # Неактивный статус
        framework.status = FrameworkContract.Status.DRAFT
        framework.save()
        self.assertFalse(framework.is_active)
        
        # Истекший срок
        framework.status = FrameworkContract.Status.ACTIVE
        framework.valid_until = date.today() - timedelta(days=1)
        framework.save()
        self.assertFalse(framework.is_active)
    
    def test_contracts_count(self):
        """Тест подсчёта связанных договоров"""
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
        
        self.assertEqual(framework.contracts_count, 0)
        
        # Создаём объект и договор
        obj = Object.objects.create(
            name='Объект А',
            address='г. Москва'
        )
        
        contract = Contract.objects.create(
            object=obj,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор под рамочный',
            contract_date=date.today(),
            total_amount=Decimal('100000.00'),
            framework_contract=framework
        )
        
        self.assertEqual(framework.contracts_count, 1)
        self.assertEqual(framework.total_contracts_amount, Decimal('100000.00'))
    
    def test_days_until_expiration(self):
        """Тест вычисляемого свойства days_until_expiration"""
        framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=50),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            created_by=self.user
        )
        
        self.assertEqual(framework.days_until_expiration, 50)
        
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
    
    def test_total_contracts_amount_multiple(self):
        """Тест total_contracts_amount с несколькими договорами"""
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
        
        obj = Object.objects.create(
            name='Объект А',
            address='г. Москва'
        )
        
        Contract.objects.create(
            object=obj,
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Договор 1',
            contract_date=date.today(),
            total_amount=Decimal('100000.00'),
            framework_contract=framework
        )
        Contract.objects.create(
            object=obj,
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
    
    def test_is_active_edge_cases(self):
        """Тест is_active для граничных случаев"""
        # Договор начинается сегодня
        framework1 = FrameworkContract.objects.create(
            name='Рамочный договор 1',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=100),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        self.assertTrue(framework1.is_active)
        
        # Договор начинается завтра
        framework2 = FrameworkContract.objects.create(
            name='Рамочный договор 2',
            date=date.today(),
            valid_from=date.today() + timedelta(days=1),
            valid_until=date.today() + timedelta(days=100),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        self.assertFalse(framework2.is_active)
        
        # Договор заканчивается вчера (не активен)
        framework3 = FrameworkContract.objects.create(
            name='Рамочный договор 3',
            date=date.today() - timedelta(days=100),
            valid_from=date.today() - timedelta(days=100),
            valid_until=date.today() - timedelta(days=1),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
        self.assertFalse(framework3.is_active)
    
    def test_framework_contract_with_both_type_counterparty(self):
        """Тест создания рамочного договора с контрагентом типа 'both'"""
        both_counterparty = Counterparty.objects.create(
            name='И Заказчик и Исполнитель',
            short_name='Оба',
            inn='4444444444',
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


class ContractFrameworkTests(TestCase):
    """Тесты связи Contract с FrameworkContract"""
    
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
        self.framework = FrameworkContract.objects.create(
            name='Рамочный договор',
            date=date.today(),
            valid_from=date.today(),
            valid_until=date.today() + timedelta(days=365),
            legal_entity=self.legal_entity,
            counterparty=self.vendor,
            status=FrameworkContract.Status.ACTIVE,
            created_by=self.user
        )
    
    def test_framework_only_for_expense(self):
        """Тест что рамочный только для расходных"""
        with self.assertRaises(ValidationError):
            contract = Contract(
                object=self.object,
                legal_entity=self.legal_entity,
                counterparty=self.vendor,
                contract_type=Contract.Type.INCOME,  # Доходный
                number='ДГ-001',
                name='Договор',
                contract_date=date.today(),
                total_amount=Decimal('100000.00'),
                framework_contract=self.framework
            )
            contract.full_clean()
    
    def test_counterparty_must_match(self):
        """Тест что Исполнитель должен совпадать"""
        other_vendor = Counterparty.objects.create(
            name='Другой Исполнитель',
            short_name='Другой',
            inn='4444444444',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        
        with self.assertRaises(ValidationError):
            contract = Contract(
                object=self.object,
                legal_entity=self.legal_entity,
                counterparty=other_vendor,  # Другой исполнитель
                contract_type=Contract.Type.EXPENSE,
                number='ДГ-001',
                name='Договор',
                contract_date=date.today(),
                total_amount=Decimal('100000.00'),
                framework_contract=self.framework
            )
            contract.full_clean()
    
    def test_framework_must_be_active(self):
        """Тест что рамочный должен быть активен"""
        self.framework.status = FrameworkContract.Status.DRAFT
        self.framework.save()
        
        with self.assertRaises(ValidationError):
            contract = Contract(
                object=self.object,
                legal_entity=self.legal_entity,
                counterparty=self.vendor,
                contract_type=Contract.Type.EXPENSE,
                number='ДГ-001',
                name='Договор',
                contract_date=date.today(),
                total_amount=Decimal('100000.00'),
                framework_contract=self.framework
            )
            contract.full_clean()
