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


def _get_tochka_public_key():
    """Получить и кэшировать публичный ключ Точки для верификации вебхуков."""
    global _TOCHKA_PUBLIC_KEY
    if _TOCHKA_PUBLIC_KEY is not None:
        return _TOCHKA_PUBLIC_KEY

    import httpx
    from jwt.algorithms import RSAAlgorithm

    try:
        response = httpx.get(TOCHKA_PUBLIC_KEY_URL, timeout=10)
        key_data = response.json()
        _TOCHKA_PUBLIC_KEY = RSAAlgorithm.from_jwk(json.dumps(key_data))
        return _TOCHKA_PUBLIC_KEY
    except Exception as exc:
        logger.error('Не удалось получить публичный ключ Точки: %s', exc)
        raise


def verify_webhook_jwt(jwt_token: str) -> dict:
    """
    Верифицировать и декодировать JWT из вебхука Точки.

    Args:
        jwt_token: JWT-строка из тела POST-запроса.

    Returns:
        Декодированный payload.

    Raises:
        jwt.InvalidTokenError: Если подпись невалидна.
    """
    public_key = _get_tochka_public_key()
    return jwt.decode(jwt_token, public_key, algorithms=['RS256'])


def process_webhook(jwt_token: str) -> Optional[BankTransaction]:
    """
    Обработать входящий вебхук от Точки.

    Args:
        jwt_token: JWT-строка из тела запроса.

    Returns:
        Созданная BankTransaction или None.
    """
    try:
        payload = verify_webhook_jwt(jwt_token)
    except Exception as exc:
        logger.error('Невалидный вебхук JWT: %s', exc)
        return None

    webhook_type = payload.get('webhookType', '')
    customer_code = payload.get('customerCode', '')
    payment_id = payload.get('paymentId', '')

    if not payment_id:
        logger.warning('Вебхук без paymentId: %s', webhook_type)
        return None

    # Проверяем, не обработан ли уже
    if BankTransaction.objects.filter(external_id=payment_id).exists():
        logger.info('Транзакция %s уже существует, пропускаем', payment_id)
        return None

    # Находим банковский счёт по customerCode
    try:
        connection = BankConnection.objects.get(
            customer_code=customer_code,
            is_active=True,
        )
    except BankConnection.DoesNotExist:
        logger.warning('Подключение с customerCode=%s не найдено', customer_code)
        return None

    # Определяем тип транзакции
    if webhook_type == 'incomingPayment':
        tx_type = BankTransaction.TransactionType.INCOMING
        cp_data = payload.get('SidePayer', {})
    elif webhook_type == 'outgoingPayment':
        tx_type = BankTransaction.TransactionType.OUTGOING
        cp_data = payload.get('SideRecipient', {})
    else:
        logger.info('Неподдерживаемый тип вебхука: %s', webhook_type)
        return None

    # Находим банковский счёт
    recipient_data = payload.get('SideRecipient', {})
    payer_data = payload.get('SidePayer', {})

    # Для входящих — наш счёт это получатель, для исходящих — отправитель
    our_account_number = (
        recipient_data.get('account', '') if tx_type == BankTransaction.TransactionType.INCOMING
        else payer_data.get('account', '')
    )

    bank_account = BankAccount.objects.filter(
        bank_connection=connection,
    ).first()

    if not bank_account:
        logger.warning('Банковский счёт не найден для подключения %s', connection)
        return None

    tx = BankTransaction.objects.create(
        bank_account=bank_account,
        external_id=payment_id,
        transaction_type=tx_type,
        amount=Decimal(str(payload.get('amount', '0'))),
        date=payload.get('date', date.today().isoformat()),
        purpose=payload.get('purpose', ''),
        counterparty_name=cp_data.get('name', ''),
        counterparty_inn=cp_data.get('inn', ''),
        counterparty_kpp=cp_data.get('kpp', ''),
        counterparty_account=cp_data.get('account', ''),
        counterparty_bank_name=cp_data.get('bankName', ''),
        counterparty_bik=cp_data.get('bankCode', ''),
        counterparty_corr_account=cp_data.get('bankCorrespondentAccount', ''),
        document_number=payload.get('documentNumber', ''),
        raw_data=payload,
    )

    logger.info('Вебхук обработан: %s транзакция %s на сумму %s', webhook_type, payment_id, tx.amount)

    # Если это исходящий платёж — пробуем обновить статус BankPaymentOrder
    if tx_type == BankTransaction.TransactionType.OUTGOING:
        _update_order_from_webhook(payment_id, tx)

    return tx


def _update_order_from_webhook(payment_id: str, transaction: BankTransaction):
    """Обновить статус BankPaymentOrder при получении вебхука об исходящем платеже."""
    orders = BankPaymentOrder.objects.filter(
        external_payment_id=payment_id,
        status__in=[
            BankPaymentOrder.Status.SENT_TO_BANK,
            BankPaymentOrder.Status.PENDING_SIGN,
        ],
    )

    for order in orders:
        order.status = BankPaymentOrder.Status.EXECUTED
        order.executed_at = timezone.now()
        order.save(update_fields=['status', 'executed_at'])

        BankPaymentOrderEvent.objects.create(
            order=order,
            event_type=BankPaymentOrderEvent.EventType.EXECUTED,
            new_value={
                'status': order.status,
                'source': 'webhook',
                'payment_id': payment_id,
            },
        )
        logger.info('ПП #%d отмечено как исполненное (вебхук)', order.pk)
