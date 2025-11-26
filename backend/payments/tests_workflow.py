from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from decimal import Decimal
from datetime import date
from accounting.models import LegalEntity, Account, TaxSystem
from payments.models import PaymentRegistry, Payment, ExpenseCategory
from contracts.models import Contract, Act, ActPaymentAllocation
from objects.models import Object
from accounting.models import Counterparty

User = get_user_model()

class PaymentWorkflowTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
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

    def test_payment_workflow_full_cycle(self):
        # 1. Create Payment Registry
        response = self.client.post('/api/v1/payment-registry/', {
            'contract_id': self.contract.id,
            'category_id': self.category.id,
            'account_id': self.account.id,
            'act_id': self.act.id,
            'planned_date': '2023-01-20',
            'amount': '10000.00',
            'initiator': 'Manager'
        })
        self.assertEqual(response.status_code, 201)
        registry_id = response.data['id']
        
        # 2. Approve
        response = self.client.post(f'/api/v1/payment-registry/{registry_id}/approve/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], PaymentRegistry.Status.APPROVED)
        # В ответе API approved_by_name, а не id, так как это read_only поле сериализатора
        self.assertEqual(response.data['approved_by_name'], 'testuser')
        
        # 3. Pay
        response = self.client.post(f'/api/v1/payment-registry/{registry_id}/pay/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], PaymentRegistry.Status.PAID)
        
        # 4. Verify Payment Creation
        payment = Payment.objects.get(payment_registry_id=registry_id)
        self.assertEqual(payment.amount, Decimal('10000.00'))
        self.assertEqual(payment.status, Payment.Status.PAID)
        self.assertEqual(payment.account, self.account)
        self.assertEqual(payment.contract, self.contract)
        
        # 5. Verify Allocation
        allocation = ActPaymentAllocation.objects.get(payment=payment, act=self.act)
        self.assertEqual(allocation.amount, Decimal('10000.00'))
        
        # 6. Verify Account Balance
        # Initial 100000 - 10000 = 90000
        current_balance = self.account.get_current_balance()
        self.assertEqual(current_balance, Decimal('90000.00'))
