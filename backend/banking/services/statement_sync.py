"""
Бизнес-логика банковских операций.
"""

import json
import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

import jwt
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from banking.clients.tochka import TochkaAPIClient, TochkaAPIError
from banking.models import (
    BankAccount,
    BankConnection,
    BankPaymentOrder,
    BankPaymentOrderEvent,
    BankTransaction,
)

logger = logging.getLogger(__name__)

# Публичный ключ Точка Банка для верификации вебхуков (JWK)
TOCHKA_PUBLIC_KEY_URL = 'https://enter.tochka.com/doc/openapi/static/keys/public'
_TOCHKA_PUBLIC_KEY = None


# =============================================================================


def sync_statements(
    bank_account: BankAccount,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> int:
    """
    Синхронизировать выписку по банковскому счёту.

    Args:
        bank_account: Привязанный банковский счёт.
        date_from: Начало периода (по умолчанию — last_statement_date или -30 дней).
        date_to: Конец периода (по умолчанию — сегодня).

    Returns:
        Количество новых транзакций.
    """
    connection = bank_account.bank_connection

    if not connection.is_active:
        logger.warning('Подключение %s неактивно, пропускаем синхронизацию', connection)
        return 0

    if date_from is None:
        date_from = bank_account.last_statement_date or (date.today() - timedelta(days=30))
    if date_to is None:
        date_to = date.today()

    with TochkaAPIClient(connection) as client:
        try:
            data = client.get_statement(
                account_id=bank_account.external_account_id,
                date_from=date_from,
                date_to=date_to,
            )
        except TochkaAPIError as exc:
            logger.error('Ошибка получения выписки для %s: %s', bank_account, exc)
            return 0

    # Парсим транзакции из ответа
    transactions = _parse_statement_transactions(data)
    new_count = 0

    for tx_data in transactions:
        external_id = tx_data.get('paymentId', '')
        if not external_id:
            continue

        # Пропускаем уже существующие
        if BankTransaction.objects.filter(external_id=external_id).exists():
            continue

        # Определяем тип транзакции
        tx_type = BankTransaction.TransactionType.INCOMING
        if tx_data.get('direction') == 'outgoing':
            tx_type = BankTransaction.TransactionType.OUTGOING

        # Извлекаем реквизиты контрагента
        payer = tx_data.get('SidePayer', {})
        recipient = tx_data.get('SideRecipient', {})

        # Для входящих — контрагент это отправитель, для исходящих — получатель
        if tx_type == BankTransaction.TransactionType.INCOMING:
            cp = payer
        else:
            cp = recipient

        BankTransaction.objects.create(
            bank_account=bank_account,
            external_id=external_id,
            transaction_type=tx_type,
            amount=Decimal(str(tx_data.get('amount', '0'))),
            date=tx_data.get('date', date.today()),
            purpose=tx_data.get('purpose', ''),
            counterparty_name=cp.get('name', ''),
            counterparty_inn=cp.get('inn', ''),
            counterparty_kpp=cp.get('kpp', ''),
            counterparty_account=cp.get('account', ''),
            counterparty_bank_name=cp.get('bankName', ''),
            counterparty_bik=cp.get('bankCode', ''),
            counterparty_corr_account=cp.get('bankCorrespondentAccount', ''),
            document_number=tx_data.get('documentNumber', ''),
            raw_data=tx_data,
        )
        new_count += 1

    # Обновляем дату последней выписки
    bank_account.last_statement_date = date_to
    bank_account.save(update_fields=['last_statement_date'])

    # Обновляем last_sync_at на подключении
    connection.last_sync_at = timezone.now()
    connection.save(update_fields=['last_sync_at'])

    logger.info('Синхронизировано %d новых транзакций для %s', new_count, bank_account)
    return new_count


def _parse_statement_transactions(data: dict) -> list:
    """Извлечь список транзакций из ответа API выписки."""
    # Формат ответа Tochka Open Banking может варьироваться
    # Пробуем несколько вариантов структуры
    if 'Data' in data:
        statements = data['Data'].get('Statement', [])
        if isinstance(statements, list):
            return statements
        transactions = data['Data'].get('Transaction', [])
        if isinstance(transactions, list):
            return transactions
    if 'statements' in data:
        return data['statements']
    if isinstance(data, list):
        return data
    return []


# =============================================================================
# Сверка транзакций
# =============================================================================

def reconcile_transaction(
    transaction: BankTransaction,
    payment_id: int,
) -> bool:
    """
    Привязать банковскую транзакцию к внутреннему платежу.

    Args:
        transaction: Банковская транзакция.
        payment_id: ID внутреннего Payment.

    Returns:
        True если привязка успешна.
    """
    from payments.models import Payment, Invoice

    # Попытка привязать к Invoice (новая система)
    try:
        inv = Invoice.objects.get(pk=payment_id)
        transaction.invoice = inv
        transaction.reconciled = True
        transaction.save(update_fields=['invoice', 'reconciled'])
        logger.info('Транзакция %s привязана к счёту (Invoice) %d', transaction.external_id, payment_id)
        return True
    except Invoice.DoesNotExist:
        pass

    # Fallback: старая система Payment (LEGACY)
    try:
        payment = Payment.objects.get(pk=payment_id)
    except Payment.DoesNotExist:
        logger.error('Платёж %d не найден', payment_id)
        return False

    transaction.payment = payment
    transaction.reconciled = True
    transaction.save(update_fields=['payment', 'reconciled'])

    logger.info('Транзакция %s привязана к платежу %d (LEGACY)', transaction.external_id, payment_id)
    return True


def auto_reconcile(bank_account: BankAccount) -> int:
    """
    Автоматическая сверка транзакций по сумме, дате и ИНН контрагента.

    Returns:
        Количество автоматически сверенных транзакций.
    """
    from payments.models import Payment

    unreconciled = BankTransaction.objects.filter(
        bank_account=bank_account,
        reconciled=False,
    )

    matched = 0
    for tx in unreconciled:
        # Ищем платёж с совпадающей суммой, датой и ИНН контрагента
        payments = Payment.objects.filter(
            amount=tx.amount,
            payment_date=tx.date,
            status='paid',
        )

        if tx.counterparty_inn:
            payments = payments.filter(
                contract__counterparty__inn=tx.counterparty_inn,
            )

        if payments.count() == 1:
            payment = payments.first()
            tx.payment = payment
            tx.reconciled = True
            tx.save(update_fields=['payment', 'reconciled'])
            matched += 1

    logger.info('Автосверка: %d транзакций сопоставлено для %s', matched, bank_account)
    return matched


# =============================================================================
# Платёжные поручения
