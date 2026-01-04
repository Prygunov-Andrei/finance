from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.utils import timezone
from decimal import Decimal
from contracts.models import Contract, Act, CommercialProposal
from payments.models import Payment, ExpenseCategory
from accounting.models import Counterparty, LegalEntity, TaxSystem
from objects.models import Object

User = get_user_model()

class AnalyticsTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        self.tax = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal = LegalEntity.objects.create(name='MyFirm', tax_system=self.tax, inn='123')
        self.client_cp = Counterparty.objects.create(
            name='Client', inn='456', type='customer', legal_form=Counterparty.LegalForm.OOO
        )
        self.vendor_cp = Counterparty.objects.create(
            name='Vendor', inn='789', type='vendor', legal_form=Counterparty.LegalForm.OOO
        )
        self.obj = Object.objects.create(name='Obj')
        self.cat = ExpenseCategory.objects.create(name='Cat', code='cat')

        # Fake approved CP for Income
        self.cp_in = CommercialProposal.objects.create(
            object=self.obj, counterparty=self.client_cp, proposal_type='income',
            number='KP-IN', date=timezone.now().date(), total_amount=1000, status='approved'
        )
        # Fake approved CP for Expense
        self.cp_out = CommercialProposal.objects.create(
            object=self.obj, counterparty=self.vendor_cp, proposal_type='expense',
            number='KP-OUT', date=timezone.now().date(), total_amount=1000, status='approved'
        )

        # Income contract
        self.contract_in = Contract.objects.create(
            object=self.obj, number='IN-1', name='Contract IN', contract_type='income',
            counterparty=self.client_cp, legal_entity=self.legal,
            contract_date=timezone.now().date(), total_amount=1000, status='active',
            commercial_proposal=self.cp_in
        )
        # Expense contract
        self.contract_out = Contract.objects.create(
            object=self.obj, number='OUT-1', name='Contract OUT', contract_type='expense',
            counterparty=self.vendor_cp, legal_entity=self.legal,
            contract_date=timezone.now().date(), total_amount=1000, status='active',
            commercial_proposal=self.cp_out
        )

    def test_debt_summary(self):
        # 1. Act for Income (Client owes us 1000)
        Act.objects.create(
            contract=self.contract_in, number='A1', date=timezone.now().date(),
            amount_gross=1000, amount_net=800, vat_amount=200, status='signed'
        )
        # 2. Payment for Expense (We paid 500)
        Payment.objects.create(
            contract=self.contract_out, category=self.cat, payment_type='expense',
            payment_date=timezone.now().date(), amount=500, status='paid'
        )
        # Act for Expense (Vendor did work for 1000) -> We owe 1000 - 500 = 500
        Act.objects.create(
            contract=self.contract_out, number='A2', date=timezone.now().date(),
            amount_gross=1000, amount_net=800, vat_amount=200, status='signed'
        )

        response = self.client.get('/api/v1/analytics/debt_summary/')
        self.assertEqual(response.status_code, 200)
        
        data = response.data
        # Receivables: Contract IN balance = 1000 (Act) - 0 (Payment) = 1000
        self.assertEqual(float(data['total_receivables']), 1000.0)
        
        # Payables: Contract OUT balance = 1000 (Act) - 500 (Payment) = 500
        self.assertEqual(float(data['total_payables']), 500.0)
