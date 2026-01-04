"""
Legacy тест workflow платежей.
Обновлён для новой архитектуры: платежи создаются через форму, 
реестр используется только для согласования.

Основные тесты новой логики см. в tests_new_workflow.py
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from decimal import Decimal
from datetime import date
from accounting.models import LegalEntity, Account, TaxSystem
from payments.models import PaymentRegistry, Payment, ExpenseCategory
from contracts.models import Contract, Act
from objects.models import Object
from accounting.models import Counterparty

User = get_user_model()


class PaymentWorkflowTest(TestCase):
    """
    Тест полного цикла согласования расходного платежа.
    
    Новая архитектура:
    1. Платёж создаётся через форму (expense) → статус pending
    2. Автоматически создаётся запись в реестре → статус planned
    3. Согласование в реестре → статус approved  
    4. Оплата в реестре → статус paid (синхронизируется с платежом)
    """
    
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
            name='Test Company', short_name='TC', inn='1234567890', tax_system=self.tax_system
        )
        self.account = Account.objects.create(
            legal_entity=self.legal_entity,
            name='Main Account',
            number='40702810000000000001',
            initial_balance=Decimal('100000.00')
        )
        
        self.category = ExpenseCategory.objects.create(name='Materials', code='materials')
        
        self.counterparty = Counterparty.objects.create(
            name='Supplier', 
            inn='0987654321',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.object = Object.objects.create(name='Test Object')
        self.contract = Contract.objects.create(
            contract_type=Contract.Type.EXPENSE,
            number='C-001',
            name='Workflow Contract',
            contract_date='2023-01-01',
            counterparty=self.counterparty,
            legal_entity=self.legal_entity,
            object=self.object,
            total_amount=Decimal('50000.00')
        )
        
        self.act = Act.objects.create(
            contract=self.contract,
            number='A-001',
            date='2023-01-15',
            period_start='2023-01-01',
            period_end='2023-01-15',
            amount_gross=Decimal('10000.00'),
            amount_net=Decimal('8333.33'),
            vat_amount=Decimal('1666.67'),
            status=Act.Status.SIGNED
        )

    def test_expense_payment_approval_workflow(self):
        """
        Полный цикл согласования расходного платежа:
        Создание → Согласование → Оплата
        """
        # 1. Создаём expense платёж и запись в реестре напрямую через модели
        # (в реальности это делает сериализатор при POST /payments/)
        payment = Payment.objects.create(
            account=self.account,
            contract=self.contract,
            category=self.category,
            legal_entity=self.legal_entity,
            payment_type=Payment.PaymentType.EXPENSE,
            payment_date=date.today(),
            amount=Decimal('10000.00'),
            amount_gross=Decimal('10000.00'),
            status=Payment.Status.PENDING,
            description='Оплата по акту',
            scan_file='payments/2023/1/invoice.pdf'
        )
        
        registry = PaymentRegistry.objects.create(
            account=self.account,
            contract=self.contract,
            category=self.category,
            act=self.act,
            planned_date=date.today(),
            amount=Decimal('10000.00'),
            status=PaymentRegistry.Status.PLANNED,
            initiator='Test User',
        )
        
        # Связываем платёж с реестром
        payment.payment_registry = registry
        payment.save(update_fields=['payment_registry'])
        
        # Проверяем начальные статусы
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(registry.status, PaymentRegistry.Status.PLANNED)
        
        # 2. Согласование через API
        response = self.client.post(f'/api/v1/payment-registry/{registry.id}/approve/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], PaymentRegistry.Status.APPROVED)
        self.assertEqual(response.data['approved_by_name'], 'testuser')
        
        # 3. Оплата через API
        response = self.client.post(f'/api/v1/payment-registry/{registry.id}/pay/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], PaymentRegistry.Status.PAID)
        
        # 4. Проверяем синхронизацию статуса платежа
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PAID)
        
        # 5. Проверяем баланс счёта
        current_balance = self.account.get_current_balance()
        self.assertEqual(current_balance, Decimal('90000.00'))
