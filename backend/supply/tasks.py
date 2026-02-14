import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def process_bitrix_deal(self, deal_id: int, integration_id: int):
    """
    Основная Celery-задача обработки сделки из Битрикс24.

    1. Загружает данные сделки через BitrixAPIClient
    2. Проверяет стадию
    3. Создаёт SupplyRequest и Invoice(s)
    4. Запускает LLM-распознавание для каждого счёта
    """
    from supply.services.deal_processor import DealProcessor
    from supply.models import BitrixIntegration

    try:
        integration = BitrixIntegration.objects.get(id=integration_id, is_active=True)
    except BitrixIntegration.DoesNotExist:
        logger.error('process_bitrix_deal: integration %s not found or inactive', integration_id)
        return

    processor = DealProcessor(integration)
    try:
        processor.process_deal(deal_id)
    except Exception as exc:
        logger.exception('process_bitrix_deal: error processing deal %s', deal_id)
        raise self.retry(exc=exc)


@shared_task
def recognize_invoice(invoice_id: int):
    """
    Celery-задача LLM-распознавания конкретного счёта.

    Вызывает InvoiceService.recognize() для перевода
    Invoice из RECOGNITION в REVIEW.
    """
    from payments.services import InvoiceService

    try:
        InvoiceService.recognize(invoice_id)
    except Exception:
        logger.exception('recognize_invoice: error for invoice %s', invoice_id)


@shared_task
def generate_recurring_invoices():
    """
    Ежедневная задача (Celery Beat): генерация счетов из периодических платежей.

    Проверяет RecurringPayment с next_generation_date <= today + 30 дней
    и создаёт Invoice для каждого.
    """
    from payments.services import InvoiceService

    try:
        count = InvoiceService.generate_recurring()
        logger.info('generate_recurring_invoices: created %d invoices', count)
    except Exception:
        logger.exception('generate_recurring_invoices: error')
