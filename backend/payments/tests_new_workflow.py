"""
Тесты нового workflow платежей:
- Единая форма создания платежей
- Income → сразу paid
- Expense → pending + автоматически создаётся запись в реестре
- Синхронизация статусов Payment ↔ PaymentRegistry
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from datetime import date

from accounting.models import LegalEntity, Account, TaxSystem, Counterparty
from payments.models import PaymentRegistry, Payment, ExpenseCategory
from contracts.models import Contract
from objects.models import Object

User = get_user_model()


class PaymentCreationWorkflowTest(TestCase):
    """Тесты создания платежей через единую форму"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser', 
            password='password',
            first_name='Test',
            last_name='User'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Setup base models
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН', vat_rate=20)
        self.legal_entity = LegalEntity.objects.create(
            name='Test Company', 
            short_name='TC', 
            inn='1234567890', 
            tax_system=self.tax_system
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
        self.category_with_contract = ExpenseCategory.objects.create(
            name='Contract Work', 
            code='contract_work',
            requires_contract=True
        )
        
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
            name='Test Contract',
            contract_date='2024-01-01',
            counterparty=self.counterparty,
            legal_entity=self.legal_entity,
            object=self.object,
            total_amount=Decimal('50000.00')
        )
        
        # Mock PDF file
        self.mock_pdf = SimpleUploadedFile(
            "document.pdf",
            b"PDF file content",
            content_type="application/pdf"
        )

    def _get_payment_data(self, payment_type='income', **kwargs):
        """Helper to create payment data"""
        data = {
            'payment_type': payment_type,
            'account_id': self.account.id,
            'category_id': self.category.id,
            'payment_date': '2024-01-15',
            'amount': '10000.00',  # Обязательное поле
            'amount_gross': '10000.00',
            'amount_net': '8333.33',
            'vat_amount': '1666.67',
            'description': 'Test payment',
        }
        data.update(kwargs)
        return data

    def test_income_payment_created_with_paid_status(self):
        """Income платёж создаётся сразу со статусом paid"""
        data = self._get_payment_data(payment_type='income')
        data['scan_file'] = self.mock_pdf
        
        response = self.client.post('/api/v1/payments/', data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        payment = Payment.objects.get(id=response.data['id'])
        self.assertEqual(payment.status, Payment.Status.PAID)
        self.assertEqual(payment.payment_type, Payment.PaymentType.INCOME)
        
        # Для income не должна создаваться запись в реестре
        self.assertIsNone(payment.payment_registry)
        self.assertEqual(PaymentRegistry.objects.count(), 0)

    def test_expense_payment_created_with_pending_status(self):
        """Expense платёж создаётся со статусом pending"""
        # New mock file for this test
        mock_pdf = SimpleUploadedFile(
            "document.pdf",
            b"PDF file content",
            content_type="application/pdf"
        )
        data = self._get_payment_data(payment_type='expense')
        data['scan_file'] = mock_pdf
        
        response = self.client.post('/api/v1/payments/', data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        payment = Payment.objects.get(id=response.data['id'])
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(payment.payment_type, Payment.PaymentType.EXPENSE)

    def test_expense_payment_creates_registry_entry(self):
        """При создании expense платежа автоматически создаётся запись в реестре"""
        mock_pdf = SimpleUploadedFile(
            "document.pdf",
            b"PDF file content",
            content_type="application/pdf"
        )
        data = self._get_payment_data(payment_type='expense')
        data['scan_file'] = mock_pdf
        
        response = self.client.post('/api/v1/payments/', data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        payment = Payment.objects.get(id=response.data['id'])
        
        # Должна быть создана запись в реестре
        self.assertIsNotNone(payment.payment_registry)
        self.assertEqual(PaymentRegistry.objects.count(), 1)
        
        registry = payment.payment_registry
        self.assertEqual(registry.status, PaymentRegistry.Status.PLANNED)
        self.assertEqual(registry.amount, payment.amount_gross)
        self.assertEqual(registry.account, payment.account)
        self.assertEqual(registry.category, payment.category)
        self.assertEqual(registry.initiator, 'Test User')

    def test_scan_file_required_for_all_payments(self):
        """Документ обязателен для всех типов платежей"""
        # Попытка создать без файла
        data = self._get_payment_data(payment_type='income')
        # Не добавляем scan_file
        
        response = self.client.post('/api/v1/payments/', data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('scan_file', response.data)

    def test_category_requires_contract_validation(self):
        """Категория с requires_contract требует указания договора"""
        mock_pdf = SimpleUploadedFile(
            "document.pdf",
            b"PDF file content",
            content_type="application/pdf"
        )
        data = self._get_payment_data(payment_type='expense')
        data['category_id'] = self.category_with_contract.id
        data['scan_file'] = mock_pdf
        # Не указываем contract_id
        
        response = self.client.post('/api/v1/payments/', data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('contract_id', response.data)


class PaymentRegistryWorkflowTest(TestCase):
    """Тесты согласования в реестре и синхронизации статусов"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='findir', 
            password='password',
            first_name='Finance',
            last_name='Director'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Setup base models
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН', vat_rate=20)
        self.legal_entity = LegalEntity.objects.create(
            name='Test Company', 
            short_name='TC', 
            inn='1234567890', 
            tax_system=self.tax_system
        )
        self.account = Account.objects.create(
            legal_entity=self.legal_entity,
            name='Main Account',
            number='40702810000000000001',
            initial_balance=Decimal('100000.00')
        )
        
        self.category = ExpenseCategory.objects.create(name='Materials', code='materials')
        
        # Создаём expense платёж напрямую через модели для тестирования сигналов
        self.payment = Payment.objects.create(
            account=self.account,
            category=self.category,
            legal_entity=self.legal_entity,
            payment_type=Payment.PaymentType.EXPENSE,
            payment_date=date.today(),
            amount=Decimal('10000.00'),
            amount_gross=Decimal('10000.00'),
            status=Payment.Status.PENDING,
            description='Test expense',
            scan_file='payments/2024/1/test.pdf'
        )
        
        self.registry = PaymentRegistry.objects.create(
            account=self.account,
            category=self.category,
            planned_date=date.today(),
            amount=Decimal('10000.00'),
            status=PaymentRegistry.Status.PLANNED,
            initiator='Test User',
        )
        
        # Связываем платёж с записью в реестре
        self.payment.payment_registry = self.registry
        self.payment.save(update_fields=['payment_registry'])

    def test_registry_create_not_allowed_via_api(self):
        """Создание заявок напрямую через API запрещено"""
        data = {
            'account_id': self.account.id,
            'category_id': self.category.id,
            'planned_date': '2024-01-20',
            'amount': '5000.00',
        }
        
        response = self.client.post('/api/v1/payment-registry/', data)
        
        # POST должен быть запрещён (405 Method Not Allowed)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_approve_changes_registry_status(self):
        """Согласование меняет статус заявки на approved"""
        response = self.client.post(f'/api/v1/payment-registry/{self.registry.id}/approve/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.registry.refresh_from_db()
        self.assertEqual(self.registry.status, PaymentRegistry.Status.APPROVED)
        self.assertEqual(self.registry.approved_by, self.user)
        self.assertIsNotNone(self.registry.approved_at)

    def test_pay_syncs_payment_status(self):
        """Оплата заявки синхронизирует статус платежа"""
        # Сначала согласуем
        self.registry.status = PaymentRegistry.Status.APPROVED
        self.registry.save()
        
        # Теперь оплачиваем
        response = self.client.post(f'/api/v1/payment-registry/{self.registry.id}/pay/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.registry.refresh_from_db()
        self.payment.refresh_from_db()
        
        # Оба должны быть PAID
        self.assertEqual(self.registry.status, PaymentRegistry.Status.PAID)
        self.assertEqual(self.payment.status, Payment.Status.PAID)

    def test_cancel_syncs_payment_status(self):
        """Отмена заявки синхронизирует статус платежа"""
        response = self.client.post(f'/api/v1/payment-registry/{self.registry.id}/cancel/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.registry.refresh_from_db()
        self.payment.refresh_from_db()
        
        # Оба должны быть CANCELLED
        self.assertEqual(self.registry.status, PaymentRegistry.Status.CANCELLED)
        self.assertEqual(self.payment.status, Payment.Status.CANCELLED)

    def test_cannot_pay_without_approval(self):
        """Нельзя оплатить не согласованную заявку"""
        response = self.client.post(f'/api/v1/payment-registry/{self.registry.id}/pay/')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_cannot_cancel_paid_registry(self):
        """Нельзя отменить уже оплаченную заявку"""
        self.registry.status = PaymentRegistry.Status.PAID
        self.registry.save()
        
        response = self.client.post(f'/api/v1/payment-registry/{self.registry.id}/cancel/')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PaymentSignalSyncTest(TestCase):
    """Тесты синхронизации через сигналы"""
    
    def setUp(self):
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН', vat_rate=20)
        self.legal_entity = LegalEntity.objects.create(
            name='Test Company', 
            short_name='TC', 
            inn='1234567890', 
            tax_system=self.tax_system
        )
        self.account = Account.objects.create(
            legal_entity=self.legal_entity,
            name='Main Account',
            number='40702810000000000001',
            initial_balance=Decimal('100000.00')
        )
        self.category = ExpenseCategory.objects.create(name='Materials', code='materials')

    def test_registry_paid_triggers_payment_paid(self):
        """При переводе реестра в PAID платёж тоже становится PAID (через сигнал)"""
        # Создаём связанные записи
        registry = PaymentRegistry.objects.create(
            account=self.account,
            category=self.category,
            planned_date=date.today(),
            amount=Decimal('5000.00'),
            status=PaymentRegistry.Status.APPROVED,
        )
        
        payment = Payment.objects.create(
            account=self.account,
            category=self.category,
            legal_entity=self.legal_entity,
            payment_type=Payment.PaymentType.EXPENSE,
            payment_date=date.today(),
            amount=Decimal('5000.00'),
            amount_gross=Decimal('5000.00'),
            status=Payment.Status.PENDING,
            payment_registry=registry,
            scan_file='payments/2024/1/test.pdf'
        )
        
        # Меняем статус реестра на PAID
        registry.status = PaymentRegistry.Status.PAID
        registry.save()
        
        # Проверяем что сигнал обновил платёж
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PAID)

    def test_registry_cancelled_triggers_payment_cancelled(self):
        """При переводе реестра в CANCELLED платёж тоже отменяется (через сигнал)"""
        registry = PaymentRegistry.objects.create(
            account=self.account,
            category=self.category,
            planned_date=date.today(),
            amount=Decimal('5000.00'),
            status=PaymentRegistry.Status.PLANNED,
        )
        
        payment = Payment.objects.create(
            account=self.account,
            category=self.category,
            legal_entity=self.legal_entity,
            payment_type=Payment.PaymentType.EXPENSE,
            payment_date=date.today(),
            amount=Decimal('5000.00'),
            amount_gross=Decimal('5000.00'),
            status=Payment.Status.PENDING,
            payment_registry=registry,
            scan_file='payments/2024/1/test.pdf'
        )
        
        # Меняем статус реестра на CANCELLED
        registry.status = PaymentRegistry.Status.CANCELLED
        registry.save()
        
        # Проверяем что сигнал обновил платёж
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.CANCELLED)

    def test_payment_paid_triggers_registry_paid(self):
        """При переводе платежа в PAID реестр тоже обновляется (обратный сигнал)"""
        registry = PaymentRegistry.objects.create(
            account=self.account,
            category=self.category,
            planned_date=date.today(),
            amount=Decimal('5000.00'),
            status=PaymentRegistry.Status.APPROVED,
        )
        
        payment = Payment.objects.create(
            account=self.account,
            category=self.category,
            legal_entity=self.legal_entity,
            payment_type=Payment.PaymentType.EXPENSE,
            payment_date=date.today(),
            amount=Decimal('5000.00'),
            amount_gross=Decimal('5000.00'),
            status=Payment.Status.PENDING,
            payment_registry=registry,
            scan_file='payments/2024/1/test.pdf'
        )
        
        # Меняем статус платежа на PAID
        payment.status = Payment.Status.PAID
        payment.save()
        
        # Проверяем что сигнал обновил реестр
        registry.refresh_from_db()
        self.assertEqual(registry.status, PaymentRegistry.Status.PAID)
