"""
Сервисный слой для операций с платежами.
Вынесено из PaymentSerializer для соблюдения принципа Single Responsibility.
"""
import logging
from datetime import date, timedelta
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from typing import List, Dict, Any, Optional

from catalog.services import ProductMatcher
from catalog.models import ProductPriceHistory
from .models import (
    Payment, PaymentRegistry, PaymentItem,
    Invoice, InvoiceItem, InvoiceEvent,
    RecurringPayment, IncomeRecord,
)

logger = logging.getLogger(__name__)


class PaymentService:
    """Сервис для создания и обработки платежей"""
    
    @staticmethod
    @transaction.atomic
    def create_payment(
        validated_data: Dict[str, Any],
        items_data: List[Dict[str, Any]],
        user
    ) -> Payment:
        """
        Создание платежа с учётом типа:
        - income: сразу статус 'paid'
        - expense: статус 'pending', автоматически создаётся запись в Реестре
        
        Args:
            validated_data: Валидированные данные платежа
            items_data: Список позиций платежа
            user: Пользователь, создающий платёж
            
        Returns:
            Payment: Созданный платёж
        """
        payment_type = validated_data.get('payment_type')
        
        # Устанавливаем статус в зависимости от типа платежа
        if payment_type == Payment.PaymentType.INCOME:
            validated_data['status'] = Payment.Status.PAID
        else:  # expense
            validated_data['status'] = Payment.Status.PENDING
        
        # Создаём платёж
        payment = Payment.objects.create(**validated_data)
        
        # Для расходного платежа создаём запись в Реестре
        if payment_type == Payment.PaymentType.EXPENSE:
            registry_entry = PaymentService._create_registry_entry(payment, user)
            payment.payment_registry = registry_entry
            payment.save(update_fields=['payment_registry'])
        
        # Создаём позиции платежа
        if items_data:
            PaymentService._create_payment_items(payment, items_data)
        
        return payment
    
    @staticmethod
    def _create_registry_entry(payment: Payment, user) -> PaymentRegistry:
        """Создаёт запись в Реестре платежей"""
        initiator = user.get_full_name() or user.username if user else 'System'
        
        return PaymentRegistry.objects.create(
            account=payment.account,
            category=payment.category,
            contract=payment.contract,
            planned_date=payment.payment_date,
            amount=payment.amount_gross or payment.amount,
            status=PaymentRegistry.Status.PLANNED,
            initiator=initiator,
            comment=payment.description,
            invoice_file=payment.scan_file,
        )
    
    @staticmethod
    def _create_payment_items(payment: Payment, items_data: List[Dict[str, Any]]) -> None:
        """
        Создаёт позиции платежа и связанные записи в каталоге.
        
        Args:
            payment: Платёж
            items_data: Список данных позиций
        """
        matcher = ProductMatcher()
        counterparty = payment.contract.counterparty if payment.contract else None
        
        for item_data in items_data:
            # Конвертируем строковые значения в Decimal
            quantity = Decimal(str(item_data['quantity']))
            price_per_unit = Decimal(str(item_data['price_per_unit']))
            vat_amount = (
                Decimal(str(item_data.get('vat_amount', 0)))
                if item_data.get('vat_amount') else None
            )
            
            # Ищем или создаём товар в каталоге
            product, created = matcher.find_or_create_product(
                name=item_data['raw_name'],
                unit=item_data.get('unit', 'шт'),
                payment=payment
            )
            
            # Создаём позицию платежа
            PaymentItem.objects.create(
                payment=payment,
                product=product,
                raw_name=item_data['raw_name'],
                quantity=quantity,
                unit=item_data.get('unit', 'шт'),
                price_per_unit=price_per_unit,
                vat_amount=vat_amount
            )
            
            # Записываем историю цен (update_or_create для избежания дубликатов)
            if counterparty:
                ProductPriceHistory.objects.update_or_create(
                    product=product,
                    counterparty=counterparty,
                    invoice_date=payment.payment_date,
                    unit=item_data.get('unit', 'шт'),
                    defaults={
                        'price': price_per_unit,
                        'invoice_number': payment.description or '',
                        'payment': payment
                    }
                )


# =============================================================================
# InvoiceService — workflow счетов (новая система)
# =============================================================================

class InvoiceService:
    """
    Сервис для управления жизненным циклом счетов на оплату (Invoice).

    Workflow:
        RECOGNITION → REVIEW → IN_REGISTRY → APPROVED → SENDING → PAID
                                    ↓
                                CANCELLED
    """

    # =========================================================================
    # Создание
    # =========================================================================

    @staticmethod
    @transaction.atomic
    def create_from_bitrix(supply_request, invoice_file=None, **kwargs) -> Invoice:
        """Создать Invoice из запроса Битрикс24."""
        invoice = Invoice.objects.create(
            source=Invoice.Source.BITRIX,
            supply_request=supply_request,
            status=Invoice.Status.RECOGNITION,
            object=supply_request.object,
            contract=supply_request.contract,
            **kwargs,
        )
        if invoice_file:
            invoice.invoice_file = invoice_file
            invoice.save(update_fields=['invoice_file'])

        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.CREATED,
            comment=f'Создан из Битрикс24 (сделка #{supply_request.bitrix_deal_id})',
        )
        return invoice

    @staticmethod
    @transaction.atomic
    def create_manual(validated_data: Dict[str, Any], user) -> Invoice:
        """Создать Invoice вручную (бухгалтер / оператор)."""
        items_data = validated_data.pop('items', [])

        invoice = Invoice.objects.create(
            source=Invoice.Source.MANUAL,
            status=Invoice.Status.RECOGNITION,
            created_by=user,
            **validated_data,
        )
        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.CREATED,
            user=user,
            comment='Создан вручную',
        )
        return invoice

    @staticmethod
    @transaction.atomic
    def create_from_recurring(recurring: RecurringPayment) -> Invoice:
        """Создать Invoice из периодического платежа."""
        # Если сумма фиксированная — сразу в реестр, иначе — на проверку
        status = (
            Invoice.Status.IN_REGISTRY
            if recurring.amount_is_fixed
            else Invoice.Status.REVIEW
        )

        invoice = Invoice.objects.create(
            source=Invoice.Source.RECURRING,
            recurring_payment=recurring,
            status=status,
            counterparty=recurring.counterparty,
            category=recurring.category,
            account=recurring.account,
            contract=recurring.contract,
            object=recurring.object,
            legal_entity=recurring.legal_entity,
            amount_gross=recurring.amount,
            description=recurring.description or recurring.name,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=14),
        )
        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.CREATED,
            comment=f'Создан из периодического платежа: {recurring.name}',
        )
        return invoice

    # =========================================================================
    # Workflow-переходы
    # =========================================================================

    @staticmethod
    @transaction.atomic
    def recognize(invoice_id: int):
        """
        LLM-распознавание: RECOGNITION → REVIEW.

        Вызывает DocumentParser, заполняет поля Invoice,
        создаёт InvoiceItem через ProductMatcher.
        """
        invoice = Invoice.objects.select_for_update().get(id=invoice_id)

        if invoice.status != Invoice.Status.RECOGNITION:
            logger.warning(
                'Cannot recognize invoice #%d: status=%s', invoice_id, invoice.status,
            )
            return

        try:
            from llm_services.services.document_parser import DocumentParserService

            if not invoice.invoice_file:
                raise ValueError('Нет файла для распознавания')

            # Распознать PDF через LLM
            parsed_doc = DocumentParserService.parse_invoice(
                file=invoice.invoice_file,
            )

            # Заполнить поля из распознанного документа
            if parsed_doc:
                invoice.parsed_document = parsed_doc
                invoice.recognition_confidence = getattr(parsed_doc, 'confidence', None)

                # Данные из распознанного документа
                doc_data = parsed_doc.parsed_data or {}

                invoice.invoice_number = doc_data.get('invoice_number', '') or invoice.invoice_number
                if doc_data.get('invoice_date'):
                    try:
                        invoice.invoice_date = doc_data['invoice_date']
                    except (ValueError, TypeError):
                        pass
                if doc_data.get('due_date'):
                    try:
                        invoice.due_date = doc_data['due_date']
                    except (ValueError, TypeError):
                        pass

                invoice.amount_gross = (
                    Decimal(str(doc_data['total_amount']))
                    if doc_data.get('total_amount')
                    else invoice.amount_gross
                )
                invoice.amount_net = (
                    Decimal(str(doc_data['net_amount']))
                    if doc_data.get('net_amount')
                    else invoice.amount_net
                )
                invoice.vat_amount = (
                    Decimal(str(doc_data['vat_amount']))
                    if doc_data.get('vat_amount')
                    else invoice.vat_amount
                )

                # Создать позиции
                items = doc_data.get('items', [])
                InvoiceService._create_invoice_items(invoice, items)

                # Найти контрагента по ИНН
                if doc_data.get('vendor_inn') and not invoice.counterparty:
                    InvoiceService._match_counterparty(invoice, doc_data)

            invoice.status = Invoice.Status.REVIEW
            invoice.save()

            InvoiceEvent.objects.create(
                invoice=invoice,
                event_type=InvoiceEvent.EventType.RECOGNIZED,
                comment=f'LLM распознавание завершено (confidence: {invoice.recognition_confidence})',
            )

        except Exception as exc:
            logger.exception('Error recognizing invoice #%d', invoice_id)
            InvoiceEvent.objects.create(
                invoice=invoice,
                event_type=InvoiceEvent.EventType.COMMENT,
                comment=f'Ошибка распознавания: {exc}',
            )
            # Переводим в REVIEW чтобы оператор мог заполнить вручную
            invoice.status = Invoice.Status.REVIEW
            invoice.save(update_fields=['status'])

    @staticmethod
    @transaction.atomic
    def submit_to_registry(invoice_id: int, user):
        """Оператор подтвердил: REVIEW → IN_REGISTRY."""
        invoice = Invoice.objects.select_for_update().get(id=invoice_id)

        if invoice.status != Invoice.Status.REVIEW:
            raise ValueError(
                f'Нельзя отправить в реестр: текущий статус "{invoice.get_status_display()}"'
            )

        invoice.status = Invoice.Status.IN_REGISTRY
        invoice.reviewed_by = user
        invoice.reviewed_at = timezone.now()
        invoice.save()

        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.SENT_TO_REGISTRY,
            user=user,
            comment='Оператор подтвердил распознавание и отправил в реестр',
        )

    @staticmethod
    @transaction.atomic
    def approve(invoice_id: int, user, comment: str = ''):
        """
        Директор одобрил: IN_REGISTRY → APPROVED.

        Автоматически создаёт BankPaymentOrder.
        """
        invoice = Invoice.objects.select_for_update().get(id=invoice_id)

        if invoice.status != Invoice.Status.IN_REGISTRY:
            raise ValueError(
                f'Нельзя одобрить: текущий статус "{invoice.get_status_display()}"'
            )

        invoice.status = Invoice.Status.APPROVED
        invoice.approved_by = user
        invoice.approved_at = timezone.now()
        if comment:
            invoice.comment = comment
        invoice.save()

        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.APPROVED,
            user=user,
            comment=comment or 'Одобрено директором',
        )

        # Автоматически создать BankPaymentOrder
        InvoiceService._create_bank_payment_order(invoice, user)

    @staticmethod
    @transaction.atomic
    def reject(invoice_id: int, user, comment: str):
        """Директор отклонил: IN_REGISTRY → CANCELLED."""
        if not comment:
            raise ValueError('Необходимо указать причину отклонения')

        invoice = Invoice.objects.select_for_update().get(id=invoice_id)

        if invoice.status != Invoice.Status.IN_REGISTRY:
            raise ValueError(
                f'Нельзя отклонить: текущий статус "{invoice.get_status_display()}"'
            )

        old_status = invoice.status
        invoice.status = Invoice.Status.CANCELLED
        invoice.comment = comment
        invoice.save()

        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.REJECTED,
            user=user,
            old_value={'status': old_status},
            new_value={'status': Invoice.Status.CANCELLED},
            comment=comment,
        )

    @staticmethod
    @transaction.atomic
    def reschedule(invoice_id: int, user, new_date: date, comment: str):
        """Директор перенёс дату: IN_REGISTRY остаётся, меняется due_date."""
        if not comment:
            raise ValueError('Необходимо указать причину переноса')

        invoice = Invoice.objects.select_for_update().get(id=invoice_id)

        if invoice.status != Invoice.Status.IN_REGISTRY:
            raise ValueError(
                f'Нельзя перенести: текущий статус "{invoice.get_status_display()}"'
            )

        old_due_date = str(invoice.due_date) if invoice.due_date else None
        invoice.due_date = new_date
        invoice.save(update_fields=['due_date', 'updated_at'])

        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.RESCHEDULED,
            user=user,
            old_value={'due_date': old_due_date},
            new_value={'due_date': str(new_date)},
            comment=comment,
        )

    @staticmethod
    @transaction.atomic
    def mark_paid(invoice_id: int):
        """Банк подтвердил: SENDING → PAID."""
        invoice = Invoice.objects.select_for_update().get(id=invoice_id)

        if invoice.status != Invoice.Status.SENDING:
            logger.warning('Cannot mark invoice #%d as paid: status=%s', invoice_id, invoice.status)
            return

        invoice.status = Invoice.Status.PAID
        invoice.paid_at = timezone.now()
        invoice.save()

        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.PAID,
            comment='Оплата подтверждена банком',
        )

    @staticmethod
    @transaction.atomic
    def mark_sending(invoice_id: int):
        """Платёжное поручение отправлено: APPROVED → SENDING."""
        invoice = Invoice.objects.select_for_update().get(id=invoice_id)

        if invoice.status != Invoice.Status.APPROVED:
            return

        invoice.status = Invoice.Status.SENDING
        invoice.save(update_fields=['status', 'updated_at'])

        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.SENT_TO_BANK,
            comment='Платёжное поручение отправлено в банк',
        )

    # =========================================================================
    # Генерация периодических платежей
    # =========================================================================

    @staticmethod
    def generate_recurring() -> int:
        """
        Генерация счетов из периодических платежей.

        Проверяет RecurringPayment с next_generation_date <= today + 30 дней.
        Returns: количество созданных счетов.
        """
        today = date.today()
        upcoming = today + timedelta(days=30)

        recurring_payments = RecurringPayment.objects.filter(
            is_active=True,
            next_generation_date__lte=upcoming,
        )

        count = 0
        for rp in recurring_payments:
            # Проверяем, не создан ли уже счёт на эту дату
            existing = Invoice.objects.filter(
                recurring_payment=rp,
                invoice_date=rp.next_generation_date,
            ).exists()

            if not existing:
                InvoiceService.create_from_recurring(rp)
                count += 1

            # Обновить next_generation_date
            rp.next_generation_date = InvoiceService._calculate_next_date(rp)
            rp.save(update_fields=['next_generation_date'])

        return count

    # =========================================================================
    # Вспомогательные методы
    # =========================================================================

    @staticmethod
    def _create_invoice_items(invoice: Invoice, items_data: List[Dict]):
        """Создать позиции счёта из распознанных данных."""
        matcher = ProductMatcher()

        for item_data in items_data:
            raw_name = item_data.get('name', '')
            if not raw_name:
                continue

            quantity = Decimal(str(item_data.get('quantity', 1)))
            price = Decimal(str(item_data.get('price', 0)))
            unit = item_data.get('unit', 'шт')
            vat = (
                Decimal(str(item_data['vat_amount']))
                if item_data.get('vat_amount')
                else None
            )

            # Найти или создать товар
            product, created = matcher.find_or_create_product(
                name=raw_name,
                unit=unit,
            )

            InvoiceItem.objects.create(
                invoice=invoice,
                product=product,
                raw_name=raw_name,
                quantity=quantity,
                unit=unit,
                price_per_unit=price,
                amount=quantity * price,
                vat_amount=vat,
            )

            # История цен
            if invoice.counterparty:
                ProductPriceHistory.objects.update_or_create(
                    product=product,
                    counterparty=invoice.counterparty,
                    invoice_date=invoice.invoice_date or date.today(),
                    unit=unit,
                    defaults={
                        'price': price,
                        'invoice_number': invoice.invoice_number or '',
                    }
                )

    @staticmethod
    def _match_counterparty(invoice: Invoice, doc_data: Dict):
        """Попытаться найти контрагента по ИНН из распознанных данных."""
        from accounting.models import Counterparty

        vendor_inn = doc_data.get('vendor_inn', '')
        if not vendor_inn:
            return

        try:
            counterparty = Counterparty.objects.get(inn=vendor_inn)
            invoice.counterparty = counterparty
        except Counterparty.DoesNotExist:
            logger.info('Counterparty with INN %s not found', vendor_inn)
        except Counterparty.MultipleObjectsReturned:
            logger.warning('Multiple counterparties with INN %s', vendor_inn)

    @staticmethod
    def _create_bank_payment_order(invoice: Invoice, user):
        """Создать BankPaymentOrder из одобренного Invoice."""
        from banking.models import BankPaymentOrder, BankAccount

        if not invoice.account:
            logger.warning('Cannot create BPO for invoice #%d: no account', invoice.id)
            return

        # Найти BankAccount для данного счёта
        try:
            bank_account = BankAccount.objects.get(
                account=invoice.account,
                sync_enabled=True,
            )
        except BankAccount.DoesNotExist:
            logger.warning('No BankAccount for account #%d', invoice.account_id)
            return

        counterparty = invoice.counterparty
        if not counterparty:
            logger.warning('Cannot create BPO for invoice #%d: no counterparty', invoice.id)
            return

        # Формирование назначения платежа
        purpose = invoice.description or ''
        if invoice.invoice_number:
            purpose = f'Оплата по счёту №{invoice.invoice_number}'
            if invoice.invoice_date:
                purpose += f' от {invoice.invoice_date.strftime("%d.%m.%Y")}'
        if invoice.vat_amount:
            purpose += f' В т.ч. НДС {invoice.vat_amount} руб.'
        elif not invoice.vat_amount:
            purpose += ' Без НДС.'

        payment_date = invoice.due_date or date.today()

        bpo = BankPaymentOrder.objects.create(
            bank_account=bank_account,
            recipient_name=counterparty.name,
            recipient_inn=counterparty.inn,
            recipient_kpp=counterparty.kpp or '',
            recipient_account=counterparty.bank_account or '',
            recipient_bank_name=counterparty.bank_name or '',
            recipient_bik=counterparty.bank_bik or '',
            recipient_corr_account=counterparty.bank_corr_account or '',
            amount=invoice.amount_gross or Decimal('0'),
            purpose=purpose,
            vat_info=(
                f'В т.ч. НДС {invoice.vat_amount} руб.'
                if invoice.vat_amount
                else 'Без НДС'
            ),
            payment_date=payment_date,
            original_payment_date=payment_date,
            status=BankPaymentOrder.Status.DRAFT,
            created_by=user,
        )

        invoice.bank_payment_order = bpo
        invoice.save(update_fields=['bank_payment_order'])

        logger.info('Created BPO #%d for Invoice #%d', bpo.id, invoice.id)

    @staticmethod
    def _calculate_next_date(rp: RecurringPayment) -> date:
        """Вычислить следующую дату генерации для периодического платежа."""
        current = rp.next_generation_date

        if rp.frequency == RecurringPayment.Frequency.MONTHLY:
            month = current.month + 1
            year = current.year
            if month > 12:
                month = 1
                year += 1
            day = min(rp.day_of_month, 28)
            return date(year, month, day)

        elif rp.frequency == RecurringPayment.Frequency.QUARTERLY:
            month = current.month + 3
            year = current.year
            while month > 12:
                month -= 12
                year += 1
            day = min(rp.day_of_month, 28)
            return date(year, month, day)

        elif rp.frequency == RecurringPayment.Frequency.YEARLY:
            day = min(rp.day_of_month, 28)
            return date(current.year + 1, current.month, day)

        return current + timedelta(days=30)
