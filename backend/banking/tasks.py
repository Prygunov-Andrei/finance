"""
Celery-задачи для банковского модуля.
"""

import logging
from datetime import date

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='banking.sync_all_statements')
def sync_all_statements():
    """
    Синхронизация выписок по всем активным банковским счетам.

    Расписание: каждые 30 минут.
    """
    from banking.models import BankAccount
    from banking.services import sync_statements

    active_accounts = BankAccount.objects.filter(
        sync_enabled=True,
        bank_connection__is_active=True,
    ).select_related('bank_connection')

    total_new = 0
    for bank_account in active_accounts:
        try:
            count = sync_statements(bank_account)
            total_new += count
        except Exception as exc:
            logger.error(
                'Ошибка синхронизации выписки для %s: %s',
                bank_account, exc, exc_info=True,
            )

    logger.info('sync_all_statements: %d новых транзакций', total_new)
    return total_new


@shared_task(name='banking.execute_scheduled_payments')
def execute_scheduled_payments():
    """
    Исполнение одобренных платежей, у которых наступила дата оплаты.

    Учитывает переносы — берёт актуальную payment_date.
    Расписание: каждые 15 минут.
    """
    from banking.models import BankPaymentOrder
    from banking.services import execute_payment_order

    today = date.today()

    orders = BankPaymentOrder.objects.filter(
        status=BankPaymentOrder.Status.APPROVED,
        payment_date__lte=today,
        bank_account__bank_connection__is_active=True,
    ).select_related('bank_account__bank_connection')

    executed = 0
    for order in orders:
        try:
            execute_payment_order(order)
            executed += 1
        except Exception as exc:
            logger.error(
                'Ошибка исполнения ПП #%d: %s',
                order.pk, exc, exc_info=True,
            )

    logger.info('execute_scheduled_payments: %d платежей отправлено', executed)
    return executed


@shared_task(name='banking.refresh_bank_tokens')
def refresh_bank_tokens():
    """
    Обновление access_token для всех активных подключений.

    Расписание: каждые 12 часов.
    """
    from banking.clients.tochka import TochkaAPIClient, TochkaAPIError
    from banking.models import BankConnection

    connections = BankConnection.objects.filter(is_active=True)
    refreshed = 0

    for connection in connections:
        try:
            with TochkaAPIClient(connection) as client:
                client.ensure_valid_token()
            refreshed += 1
        except (TochkaAPIError, Exception) as exc:
            logger.error(
                'Ошибка обновления токена для %s: %s',
                connection.name, exc, exc_info=True,
            )

    logger.info('refresh_bank_tokens: %d подключений обновлено', refreshed)
    return refreshed


@shared_task(name='banking.check_pending_payments')
def check_pending_payments():
    """
    Проверка статуса отправленных платежей в банке.

    Расписание: каждые 5 минут.
    """
    from banking.models import BankPaymentOrder
    from banking.services import check_payment_order_status

    orders = BankPaymentOrder.objects.filter(
        status__in=[
            BankPaymentOrder.Status.SENT_TO_BANK,
            BankPaymentOrder.Status.PENDING_SIGN,
        ],
        bank_account__bank_connection__is_active=True,
    ).select_related('bank_account__bank_connection')

    updated = 0
    for order in orders:
        try:
            old_status = order.status
            check_payment_order_status(order)
            if order.status != old_status:
                updated += 1
        except Exception as exc:
            logger.error(
                'Ошибка проверки статуса ПП #%d: %s',
                order.pk, exc, exc_info=True,
            )

    logger.info('check_pending_payments: %d статусов обновлено', updated)
    return updated
