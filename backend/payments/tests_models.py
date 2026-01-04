from decimal import Decimal
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone

from objects.models import Object
from contracts.models import Contract
from accounting.models import Counterparty, LegalEntity, TaxSystem
from .models import Payment, PaymentRegistry, ExpenseCategory


class PaymentModelTests(TestCase):
    def setUp(self) -> None:
        self.category = ExpenseCategory.objects.create(
            name='Тест Категория',
            code='test_cat',
            requires_contract=True
        )
        self.object = Object.objects.create(
            name='Объект А',
            address='г. Москва, ул. Примерная, д. 1',
            description='Тестовый строительный объект',
        )
        
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН', vat_rate=20)
        self.legal_entity = LegalEntity.objects.create(
            name='Our Company', short_name='OC', inn='111', tax_system=self.tax_system
        )
        self.counterparty = Counterparty.objects.create(
            name='Contractor', inn='222', type=Counterparty.Type.VENDOR, legal_form=Counterparty.LegalForm.OOO
        )
        
        self.contract = Contract.objects.create(
            object=self.object,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-001',
            name='Контракт 1',
            contract_date=timezone.now().date(),
            counterparty=self.counterparty,
            legal_entity=self.legal_entity,
            total_amount=Decimal('1500000.00'),
        )

    def _create_payment(self, **kwargs) -> Payment:
        from django.core.files.uploadedfile import SimpleUploadedFile
        defaults = {
            'category': self.category,
            'contract': self.contract,
            'payment_type': Payment.PaymentType.EXPENSE,
            'payment_date': timezone.now().date(),
            'amount': Decimal('100000.00'),
            'amount_gross': Decimal('100000.00'),
            'description': 'Оплата материалов',
            'scan_file': SimpleUploadedFile(
                "test.pdf",
                b"PDF file content",
                content_type="application/pdf"
            ),
        }
        defaults.update(kwargs)
        return Payment.objects.create(**defaults)

    def test_create_payment(self) -> None:
        """Тест создания платежа"""
        payment = self._create_payment()
        self.assertEqual(Payment.objects.count(), 1)
        self.assertEqual(payment.contract, self.contract)
        self.assertEqual(payment.payment_type, Payment.PaymentType.EXPENSE)
        self.assertEqual(payment.amount, Decimal('100000.00'))

    def test_payment_types(self) -> None:
        """Тест типов платежей"""
        expense = self._create_payment(payment_type=Payment.PaymentType.EXPENSE)
        income = self._create_payment(payment_type=Payment.PaymentType.INCOME)
        
        self.assertEqual(expense.payment_type, Payment.PaymentType.EXPENSE)
        self.assertEqual(income.payment_type, Payment.PaymentType.INCOME)
        self.assertEqual(Payment.objects.count(), 2)

    def test_payment_str_representation(self) -> None:
        """Тест строкового представления платежа"""
        payment = self._create_payment()
        str_repr = str(payment)
        self.assertIn('Расход', str_repr)
        self.assertIn('100000.00', str_repr)

    def test_payment_timestamps(self) -> None:
        """Тест автоматического заполнения временных меток"""
        payment = self._create_payment()
        self.assertIsNotNone(payment.created_at)
        self.assertIsNotNone(payment.updated_at)

    def test_payment_with_import_batch_id(self) -> None:
        """Тест платежа с идентификатором импорта"""
        payment = self._create_payment(import_batch_id='IMPORT-2024-001')
        self.assertEqual(payment.import_batch_id, 'IMPORT-2024-001')

    def test_payment_cascade_delete(self) -> None:
        """Тест: при удалении договора платеж не удаляется, а отвязывается (SET_NULL)"""
        payment = self._create_payment()
        self.assertEqual(Payment.objects.count(), 1)
        
        self.contract.delete()
        # Платеж должен остаться
        self.assertEqual(Payment.objects.count(), 1)
        
        # Обновляем объект из БД
        payment.refresh_from_db()
        # Поле contract должно стать None
        self.assertIsNone(payment.contract)


class PaymentRegistryModelTests(TestCase):
    def setUp(self) -> None:
        self.object = Object.objects.create(
            name='Объект Б',
            address='г. Санкт-Петербург, Невский проспект, д. 10',
            description='Второй объект',
        )
        
        self.tax_system = TaxSystem.objects.create(code='usn', name='УСН', vat_rate=None)
        self.legal_entity = LegalEntity.objects.create(
            name='Our Company 2', short_name='OC2', inn='333', tax_system=self.tax_system
        )
        self.counterparty = Counterparty.objects.create(
            name='Contractor 2', inn='444', type=Counterparty.Type.VENDOR, legal_form=Counterparty.LegalForm.OOO
        )
        
        self.contract = Contract.objects.create(
            object=self.object,
            contract_type=Contract.Type.EXPENSE,
            number='ДГ-002',
            name='Контракт 2',
            contract_date=timezone.now().date(),
            counterparty=self.counterparty,
            legal_entity=self.legal_entity,
            total_amount=Decimal('2000000.00'),
        )

    def _create_planned_payment(self, **kwargs) -> PaymentRegistry:
        defaults = {
            'contract': self.contract,
            'planned_date': timezone.now().date() + timezone.timedelta(days=30),
            'amount': Decimal('500000.00'),
            'status': PaymentRegistry.Status.PLANNED,
            'initiator': 'Иванов И.И.',
            'comment': 'Плановый платёж за материалы',
        }
        defaults.update(kwargs)
        return PaymentRegistry.objects.create(**defaults)

    def test_create_planned_payment(self) -> None:
        """Тест создания планового платежа"""
        planned = self._create_planned_payment()
        self.assertEqual(PaymentRegistry.objects.count(), 1)
        self.assertEqual(planned.contract, self.contract)
        self.assertEqual(planned.status, PaymentRegistry.Status.PLANNED)
        self.assertEqual(planned.amount, Decimal('500000.00'))

    def test_planned_payment_statuses(self) -> None:
        """Тест статусов плановых платежей"""
        planned = self._create_planned_payment(status=PaymentRegistry.Status.PLANNED)
        approved = self._create_planned_payment(status=PaymentRegistry.Status.APPROVED)
        cancelled = self._create_planned_payment(status=PaymentRegistry.Status.CANCELLED)
        
        self.assertEqual(planned.status, PaymentRegistry.Status.PLANNED)
        self.assertEqual(approved.status, PaymentRegistry.Status.APPROVED)
        self.assertEqual(cancelled.status, PaymentRegistry.Status.CANCELLED)
        self.assertEqual(PaymentRegistry.objects.count(), 3)

    def test_planned_payment_str_representation(self) -> None:
        """Тест строкового представления планового платежа"""
        planned = self._create_planned_payment()
        str_repr = str(planned)
        self.assertIn('500000.00', str_repr)
        self.assertIn('Планируется', str_repr)

    def test_planned_payment_timestamps(self) -> None:
        """Тест автоматического заполнения временных меток"""
        planned = self._create_planned_payment()
        self.assertIsNotNone(planned.created_at)
        self.assertIsNotNone(planned.updated_at)

    def test_planned_payment_cascade_delete(self) -> None:
        """Тест каскадного удаления при удалении договора"""
        planned = self._create_planned_payment()
        self.assertEqual(PaymentRegistry.objects.count(), 1)
        
        self.contract.delete()
        self.assertEqual(PaymentRegistry.objects.count(), 0)
