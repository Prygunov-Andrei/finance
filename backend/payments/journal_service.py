"""
Сервис проводок — управление двойной записью во Внутреннем плане счетов.

Автоматические проводки при оплате счетов и поступлении средств,
а также ручные проводки для внутренних переводов.
"""
import logging
from datetime import date
from decimal import Decimal
from typing import Optional

from django.db import transaction

from .models import (
    ExpenseCategory,
    Invoice,
    IncomeRecord,
    JournalEntry,
)

logger = logging.getLogger(__name__)

SYSTEM_ACCOUNT_CODES = {
    'profit': 'Прибыль',
    'working_capital': 'Оборотные средства',
    'vat': 'НДС',
}


def _get_system_account(code: str) -> Optional[ExpenseCategory]:
    try:
        return ExpenseCategory.objects.get(
            code=code,
            account_type=ExpenseCategory.AccountType.SYSTEM,
        )
    except ExpenseCategory.DoesNotExist:
        logger.error('System account %s not found', code)
        return None


def _get_object_account(obj) -> Optional[ExpenseCategory]:
    """Get or create the virtual account for a construction object."""
    if not obj:
        return None
    account, created = ExpenseCategory.objects.get_or_create(
        account_type=ExpenseCategory.AccountType.OBJECT,
        object=obj,
        defaults={
            'name': f'Объект: {obj.name}',
            'code': f'obj_{obj.pk}',
        },
    )
    if created:
        logger.info('Created internal account for object %s', obj.name)
    return account


def _get_contract_subaccount(contract) -> Optional[ExpenseCategory]:
    """Get or create the sub-account for a contract."""
    if not contract:
        return None
    obj_account = _get_object_account(contract.object) if contract.object else None
    account, created = ExpenseCategory.objects.get_or_create(
        account_type=ExpenseCategory.AccountType.CONTRACT,
        contract=contract,
        defaults={
            'name': f'Договор: {contract.number}',
            'code': f'contract_{contract.pk}',
            'parent': obj_account,
        },
    )
    if created:
        logger.info('Created internal sub-account for contract %s', contract.number)
    return account


class JournalService:
    """Сервис управления проводками."""

    @staticmethod
    @transaction.atomic
    def create_expense_postings(invoice: Invoice, user=None) -> list[JournalEntry]:
        """
        Создать проводки при оплате Invoice.

        SUPPLIER / ACT_BASED: дебет счёта объекта (уменьшение баланса).
        HOUSEHOLD: дебет хоз. категории + авто-проводка категория→Прибыль.
        INTERNAL_TRANSFER: дебет from → кредит to.
        WAREHOUSE: дебет специального складского счёта.

        Также для любого типа с НДС создаётся проводка на счёт «НДС».
        """
        entries = []
        amount = invoice.amount_gross or Decimal('0')
        if not amount:
            return entries

        entry_date = date.today()

        if invoice.invoice_type in (
            Invoice.InvoiceType.SUPPLIER,
            Invoice.InvoiceType.ACT_BASED,
            Invoice.InvoiceType.WAREHOUSE,
        ):
            target = (
                _get_contract_subaccount(invoice.contract)
                or _get_object_account(invoice.object)
            )
            if target:
                entries.append(JournalEntry(
                    date=entry_date,
                    from_account=target,
                    to_account=target,  # placeholder, see below
                    amount=amount,
                    description=f'Оплата: {invoice}',
                    invoice=invoice,
                    created_by=user,
                    is_auto=True,
                ))
                # Debit from the object/contract (balance goes down)
                # We model it as from_account=target meaning money leaves target
                # Create a "spending" category or use the invoice category
                spend_cat = invoice.category
                if spend_cat and target:
                    entries[-1].from_account = target
                    entries[-1].to_account = spend_cat

        elif invoice.invoice_type == Invoice.InvoiceType.HOUSEHOLD:
            household_cat = invoice.category
            profit_account = _get_system_account('profit')
            if household_cat and profit_account:
                entries.append(JournalEntry(
                    date=entry_date,
                    from_account=profit_account,
                    to_account=household_cat,
                    amount=amount,
                    description=f'Хоз. расход: {invoice}',
                    invoice=invoice,
                    created_by=user,
                    is_auto=True,
                ))

        elif invoice.invoice_type == Invoice.InvoiceType.INTERNAL_TRANSFER:
            from_acc = invoice.category
            to_acc = invoice.target_internal_account
            if from_acc and to_acc:
                entries.append(JournalEntry(
                    date=entry_date,
                    from_account=from_acc,
                    to_account=to_acc,
                    amount=amount,
                    description=f'Внутренний перевод: {invoice}',
                    invoice=invoice,
                    created_by=user,
                    is_auto=True,
                ))

        # НДС-проводка
        vat_amount = invoice.vat_amount
        if vat_amount and vat_amount > 0:
            vat_account = _get_system_account('vat')
            if vat_account:
                entries.append(JournalEntry(
                    date=entry_date,
                    from_account=vat_account,
                    to_account=vat_account,
                    amount=vat_amount,
                    description=f'НДС исходящий: {invoice}',
                    invoice=invoice,
                    created_by=user,
                    is_auto=True,
                ))
                # For outgoing VAT: we track debits to VAT account
                # (money we can reclaim from state)
                # Model: from_account = source, to_account = vat
                source = invoice.category or _get_object_account(invoice.object)
                if source:
                    entries[-1].from_account = source
                    entries[-1].to_account = vat_account

        saved = []
        for entry in entries:
            if entry.from_account_id and entry.to_account_id:
                if entry.from_account_id != entry.to_account_id:
                    entry.save()
                    saved.append(entry)

        return saved

    @staticmethod
    @transaction.atomic
    def create_income_postings(
        income_record: IncomeRecord, user=None,
    ) -> list[JournalEntry]:
        """
        Создать проводки при поступлении средств.

        От Заказчика: кредит счёта объекта/договора (баланс растёт).
        Прочие: кредит указанного счёта из Плана счетов.
        """
        entries = []
        amount = income_record.amount
        if not amount:
            return entries

        entry_date = income_record.payment_date or date.today()

        if income_record.income_type in (
            IncomeRecord.IncomeType.CUSTOMER_ACT,
            IncomeRecord.IncomeType.ADVANCE,
            IncomeRecord.IncomeType.WARRANTY_RETURN,
        ):
            target = (
                _get_contract_subaccount(income_record.contract)
                or _get_object_account(income_record.object)
            )
            source = income_record.category
            if target and source and target.pk != source.pk:
                entries.append(JournalEntry(
                    date=entry_date,
                    from_account=source,
                    to_account=target,
                    amount=amount,
                    description=f'Поступление: {income_record}',
                    income_record=income_record,
                    created_by=user,
                    is_auto=True,
                ))
        else:
            target = income_record.category
            profit_account = _get_system_account('profit')
            if target and profit_account and target.pk != profit_account.pk:
                entries.append(JournalEntry(
                    date=entry_date,
                    from_account=target,
                    to_account=profit_account,
                    amount=amount,
                    description=f'Прочее поступление: {income_record}',
                    income_record=income_record,
                    created_by=user,
                    is_auto=True,
                ))

        saved = []
        for entry in entries:
            entry.save()
            saved.append(entry)
        return saved

    @staticmethod
    @transaction.atomic
    def create_manual_posting(
        from_account: ExpenseCategory,
        to_account: ExpenseCategory,
        amount: Decimal,
        description: str,
        user=None,
        posting_date: date = None,
    ) -> JournalEntry:
        """
        Создать ручную проводку.

        Примеры:
        - Объект → Прибыль (вывод прибыли с объекта)
        - Прибыль → Оборотные средства (пополнение оборотных)
        - Оборотные средства → Объект (финансирование объекта)
        """
        if from_account.pk == to_account.pk:
            raise ValueError('Счёт-источник и счёт-получатель не могут совпадать')

        entry = JournalEntry.objects.create(
            date=posting_date or date.today(),
            from_account=from_account,
            to_account=to_account,
            amount=amount,
            description=description,
            created_by=user,
            is_auto=False,
        )
        return entry

    @staticmethod
    def check_object_balance(obj, required_amount: Decimal) -> dict:
        """
        Проверить достаточность средств на счёте объекта.

        Returns:
            dict with keys: sufficient (bool), balance (Decimal), deficit (Decimal)
        """
        account = _get_object_account(obj)
        if not account:
            return {
                'sufficient': False,
                'balance': Decimal('0'),
                'deficit': required_amount,
            }

        balance = account.get_balance()
        sufficient = balance >= required_amount
        return {
            'sufficient': sufficient,
            'balance': balance,
            'deficit': max(Decimal('0'), required_amount - balance),
        }

    @staticmethod
    def get_account_balance(account: ExpenseCategory) -> Decimal:
        """Получить баланс счёта Внутреннего плана счетов."""
        return account.get_balance()
