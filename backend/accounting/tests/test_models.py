from django.test import TestCase
from django.core.exceptions import ValidationError
from accounting.models import TaxSystem, LegalEntity, Account, AccountBalance, Counterparty
from datetime import date

class AccountingModelsTest(TestCase):
    
    def setUp(self):
        # TaxSystem создаются миграцией, но для изоляции тестов лучше убедиться или создать
        self.tax_system = TaxSystem.objects.filter(code='osn_vat_20').first()
        if not self.tax_system:
             self.tax_system = TaxSystem.objects.create(
                code='osn_vat_20',
                name='ОСН (НДС 20%)',
                vat_rate=20.00,
                has_vat=True
            )

        self.legal_entity = LegalEntity.objects.create(
            name='ООО "Ромашка"',
            short_name='Ромашка',
            inn='1234567890',
            tax_system=self.tax_system
        )

    def test_legal_entity_creation(self):
        """Проверка создания юрлица"""
        self.assertEqual(self.legal_entity.short_name, 'Ромашка')
        self.assertEqual(str(self.legal_entity), 'Ромашка')
        self.assertEqual(self.legal_entity.tax_system.code, 'osn_vat_20')

    def test_account_creation(self):
        """Проверка создания счета"""
        account = Account.objects.create(
            legal_entity=self.legal_entity,
            name='Основной расчетный',
            number='40702810000000000001',
            currency=Account.Currency.RUB,
            initial_balance=1000.00
        )
        self.assertEqual(account.account_type, Account.Type.BANK_ACCOUNT)
        self.assertEqual(str(account), 'Основной расчетный (RUB)')
        self.assertEqual(account.initial_balance, 1000.00)

    def test_account_balance_creation(self):
        """Проверка создания записи остатка"""
        account = Account.objects.create(
            legal_entity=self.legal_entity,
            name='Касса',
            number='CASH_01',
            account_type=Account.Type.CASH
        )
        balance = AccountBalance.objects.create(
            account=account,
            balance_date=date(2023, 1, 1),
            balance=5000.00
        )
        self.assertEqual(balance.balance, 5000.00)
        # Decimal при str() может вести себя по-разному, проверим просто наличие суммы в строке
        self.assertIn('5000', str(balance))
        self.assertIn('2023-01-01', str(balance))

    def test_counterparty_creation(self):
        """Проверка создания контрагента"""
        counterparty = Counterparty.objects.create(
            name='ИП Иванов Иван Иванович',
            short_name='ИП Иванов',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.IP,
            inn='987654321012'
        )
        self.assertEqual(str(counterparty), 'ИП Иванов')
        self.assertEqual(counterparty.type, 'vendor')

    def test_unique_inn_legal_entity(self):
        """Проверка уникальности ИНН юрлица"""
        with self.assertRaises(Exception): # IntegrityError or ValidationError depending on DB
             LegalEntity.objects.create(
                name='Клон',
                short_name='Клон',
                inn='1234567890', # Дубликат
                tax_system=self.tax_system
            )

