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
# Синхронизация выписок
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
# Обработка вебхуков
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
