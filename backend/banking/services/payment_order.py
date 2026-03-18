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

@transaction.atomic
def create_payment_order(
    bank_account: BankAccount,
    user: User,
    recipient_name: str,
    recipient_inn: str,
    recipient_kpp: str,
    recipient_account: str,
    recipient_bank_name: str,
    recipient_bik: str,
    recipient_corr_account: str,
    amount: Decimal,
    purpose: str,
    vat_info: str = '',
    payment_date: Optional[date] = None,
    payment_registry_id: Optional[int] = None,
    invoice_id: Optional[int] = None,
) -> BankPaymentOrder:
    """
    Создать платёжное поручение.

    Returns:
        Созданный BankPaymentOrder.
    """
    from payments.models import PaymentRegistry, Invoice

    if payment_date is None:
        payment_date = date.today()

    registry = None
    if payment_registry_id:
        registry = PaymentRegistry.objects.get(pk=payment_registry_id)

    order = BankPaymentOrder.objects.create(
        bank_account=bank_account,
        payment_registry=registry,
        recipient_name=recipient_name,
        recipient_inn=recipient_inn,
        recipient_kpp=recipient_kpp,
        recipient_account=recipient_account,
        recipient_bank_name=recipient_bank_name,
        recipient_bik=recipient_bik,
        recipient_corr_account=recipient_corr_account,
        amount=amount,
        purpose=purpose,
        vat_info=vat_info,
        payment_date=payment_date,
        original_payment_date=payment_date,
        status=BankPaymentOrder.Status.DRAFT,
        created_by=user,
    )

    # Привязка Invoice к BankPaymentOrder (через Invoice.bank_payment_order)
    if invoice_id:
        Invoice.objects.filter(pk=invoice_id).update(bank_payment_order=order)

    BankPaymentOrderEvent.objects.create(
        order=order,
        event_type=BankPaymentOrderEvent.EventType.CREATED,
        user=user,
        new_value={
            'amount': str(amount),
            'payment_date': payment_date.isoformat(),
            'recipient_name': recipient_name,
        },
    )

    return order


@transaction.atomic
def submit_for_approval(order: BankPaymentOrder, user: User) -> BankPaymentOrder:
    """Отправить платёжное поручение на согласование."""
    if order.status != BankPaymentOrder.Status.DRAFT:
        raise ValueError(f'Нельзя отправить на согласование из статуса {order.get_status_display()}')

    old_status = order.status
    order.status = BankPaymentOrder.Status.PENDING_APPROVAL
    order.save(update_fields=['status'])

    BankPaymentOrderEvent.objects.create(
        order=order,
        event_type=BankPaymentOrderEvent.EventType.SUBMITTED,
        user=user,
        old_value={'status': old_status},
        new_value={'status': order.status},
    )

    return order


@transaction.atomic
def approve_order(
    order: BankPaymentOrder,
    user: User,
    payment_date: Optional[date] = None,
    comment: str = '',
) -> BankPaymentOrder:
    """
    Одобрить платёжное поручение.

    Args:
        order: Платёжное поручение.
        user: Пользователь-контролёр.
        payment_date: Новая дата оплаты (если нужно изменить).
        comment: Комментарий.
    """
    if order.status != BankPaymentOrder.Status.PENDING_APPROVAL:
        raise ValueError(f'Нельзя одобрить из статуса {order.get_status_display()}')

    old_values = {'status': order.status, 'payment_date': order.payment_date.isoformat()}

    order.status = BankPaymentOrder.Status.APPROVED
    order.approved_by = user
    order.approved_at = timezone.now()

    if payment_date:
        order.payment_date = payment_date

    order.save(update_fields=['status', 'approved_by', 'approved_at', 'payment_date'])

    new_values = {'status': order.status, 'payment_date': order.payment_date.isoformat()}

    BankPaymentOrderEvent.objects.create(
        order=order,
        event_type=BankPaymentOrderEvent.EventType.APPROVED,
        user=user,
        old_value=old_values,
        new_value=new_values,
        comment=comment,
    )

    return order


@transaction.atomic
def reject_order(order: BankPaymentOrder, user: User, comment: str = '') -> BankPaymentOrder:
    """Отклонить платёжное поручение."""
    if order.status != BankPaymentOrder.Status.PENDING_APPROVAL:
        raise ValueError(f'Нельзя отклонить из статуса {order.get_status_display()}')

    old_status = order.status
    order.status = BankPaymentOrder.Status.REJECTED
    order.save(update_fields=['status'])

    BankPaymentOrderEvent.objects.create(
        order=order,
        event_type=BankPaymentOrderEvent.EventType.REJECTED,
        user=user,
        old_value={'status': old_status},
        new_value={'status': order.status},
        comment=comment,
    )

    return order


@transaction.atomic
def reschedule_order(
    order: BankPaymentOrder,
    user: User,
    new_payment_date: date,
    comment: str = '',
) -> BankPaymentOrder:
    """
    Перенести дату оплаты одобренного платёжного поручения.

    Доступно только в статусе approved.
    Обязательный комментарий с причиной переноса.
    """
    if order.status != BankPaymentOrder.Status.APPROVED:
        raise ValueError(f'Перенос даты возможен только в статусе "Одобрено", текущий: {order.get_status_display()}')

    if not comment.strip():
        raise ValueError('Комментарий (причина переноса) обязателен')

    old_date = order.payment_date.isoformat()
    order.payment_date = new_payment_date
    order.save(update_fields=['payment_date'])

    BankPaymentOrderEvent.objects.create(
        order=order,
        event_type=BankPaymentOrderEvent.EventType.RESCHEDULED,
        user=user,
        old_value={'payment_date': old_date},
        new_value={'payment_date': new_payment_date.isoformat()},
        comment=comment,
    )

    logger.info(
        'ПП #%d: дата перенесена с %s на %s пользователем %s. Причина: %s',
        order.pk, old_date, new_payment_date, user.username, comment,
    )

    return order


def execute_payment_order(order: BankPaymentOrder) -> BankPaymentOrder:
    """
    Отправить платёжное поручение в банк.

    Использует payment_mode из BankConnection:
    - for_sign: создаёт черновик на подпись
    - auto_sign: создаёт и подписывает
    """
    if order.status != BankPaymentOrder.Status.APPROVED:
        raise ValueError(f'Нельзя отправить в банк из статуса {order.get_status_display()}')

    connection = order.bank_account.bank_connection

    with TochkaAPIClient(connection) as client:
        payment_data = client.build_payment_data(
            customer_code=connection.customer_code,
            account_code=order.bank_account.external_account_id,
            recipient_name=order.recipient_name,
            recipient_inn=order.recipient_inn,
            recipient_kpp=order.recipient_kpp,
            recipient_account=order.recipient_account,
            recipient_bank_name=order.recipient_bank_name,
            recipient_bik=order.recipient_bik,
            recipient_corr_account=order.recipient_corr_account,
            amount=str(order.amount),
            purpose=order.purpose,
            payment_date=order.payment_date,
        )

        try:
            if connection.payment_mode == BankConnection.PaymentMode.FOR_SIGN:
                result = client.create_payment_for_sign(payment_data)
                new_status = BankPaymentOrder.Status.PENDING_SIGN
            else:
                result = client.create_payment(payment_data)
                new_status = BankPaymentOrder.Status.EXECUTED
        except TochkaAPIError as exc:
            order.status = BankPaymentOrder.Status.FAILED
            order.error_message = str(exc)
            order.raw_response = {'error': str(exc)}
            order.save(update_fields=['status', 'error_message', 'raw_response'])

            BankPaymentOrderEvent.objects.create(
                order=order,
                event_type=BankPaymentOrderEvent.EventType.FAILED,
                old_value={'status': BankPaymentOrder.Status.APPROVED},
                new_value={'status': order.status, 'error': str(exc)},
            )
            raise

    # Успешная отправка
    order.status = new_status
    order.sent_at = timezone.now()
    order.external_request_id = result.get('Data', {}).get('requestId', '')
    order.external_payment_id = result.get('Data', {}).get('paymentId', '')
    order.raw_response = result

    if new_status == BankPaymentOrder.Status.EXECUTED:
        order.executed_at = timezone.now()

    order.save(update_fields=[
        'status', 'sent_at', 'external_request_id',
        'external_payment_id', 'raw_response', 'executed_at',
    ])

    BankPaymentOrderEvent.objects.create(
        order=order,
        event_type=BankPaymentOrderEvent.EventType.SENT_TO_BANK,
        new_value={
            'status': order.status,
            'external_request_id': order.external_request_id,
        },
    )

    logger.info('ПП #%d отправлено в банк, статус: %s', order.pk, order.get_status_display())
    return order


def check_payment_order_status(order: BankPaymentOrder) -> BankPaymentOrder:
    """Проверить статус платёжного поручения в банке."""
    if not order.external_request_id:
        return order

    if order.status not in (
        BankPaymentOrder.Status.SENT_TO_BANK,
        BankPaymentOrder.Status.PENDING_SIGN,
    ):
        return order

    connection = order.bank_account.bank_connection

    with TochkaAPIClient(connection) as client:
        try:
            result = client.get_payment_status(order.external_request_id)
        except TochkaAPIError as exc:
            logger.error('Ошибка проверки статуса ПП #%d: %s', order.pk, exc)
            return order

    bank_status = result.get('Data', {}).get('status', '')

    if bank_status in ('EXECUTED', 'COMPLETED', 'SUCCESS'):
        order.status = BankPaymentOrder.Status.EXECUTED
        order.executed_at = timezone.now()
        order.save(update_fields=['status', 'executed_at'])

        BankPaymentOrderEvent.objects.create(
            order=order,
            event_type=BankPaymentOrderEvent.EventType.EXECUTED,
            new_value={'status': order.status, 'bank_status': bank_status},
        )
    elif bank_status in ('REJECTED', 'DECLINED', 'FAILED'):
        order.status = BankPaymentOrder.Status.FAILED
        order.error_message = result.get('Data', {}).get('errorMessage', bank_status)
        order.save(update_fields=['status', 'error_message'])

        BankPaymentOrderEvent.objects.create(
            order=order,
            event_type=BankPaymentOrderEvent.EventType.FAILED,
            new_value={'status': order.status, 'bank_status': bank_status},
        )

    return order


# =============================================================================
