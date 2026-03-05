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
    def recognize(invoice_id: int, auto_counterparty: bool = True):
        """
        Единый pipeline LLM-распознавания: RECOGNITION → REVIEW.

        Поддерживает PDF, изображения (PNG/JPG) и Excel (XLSX/XLS).
        Используется для single-upload, batch-upload и management command.
        """
        invoice = Invoice.objects.select_for_update().get(id=invoice_id)

        if invoice.status != Invoice.Status.RECOGNITION:
            logger.warning(
                'Cannot recognize invoice #%d: status=%s', invoice_id, invoice.status,
            )
            return

        try:
            if not invoice.invoice_file:
                raise ValueError('Нет файла для распознавания')

            # 1. Парсинг файла → ParsedInvoice
            parsed_invoice, processing_time = InvoiceService._parse_invoice_file(invoice)

            # 2. Сохранить ParsedDocument
            parsed_doc = InvoiceService._save_parsed_document(
                invoice, parsed_invoice, processing_time,
            )
            invoice.parsed_document = parsed_doc
            invoice.recognition_confidence = parsed_invoice.confidence

            # 3. Заполнить поля Invoice
            InvoiceService._populate_invoice_fields(invoice, parsed_invoice)

            # 4. Найти/создать контрагента
            InvoiceService._match_or_create_counterparty(
                invoice, parsed_invoice, auto_create=auto_counterparty,
            )

            # 5. Бизнес-дедупликация (номер + сумма + ИНН)
            duplicate = InvoiceService._check_business_duplicate(
                invoice, parsed_invoice,
            )
            if duplicate:
                invoice.status = Invoice.Status.REVIEW
                invoice.save()
                InvoiceEvent.objects.create(
                    invoice=invoice,
                    event_type=InvoiceEvent.EventType.RECOGNIZED,
                    comment=(
                        f'Возможный дубликат счёта #{duplicate.id} '
                        f'({duplicate.invoice_number}). Позиции не созданы.'
                    ),
                )
                if invoice.bulk_session:
                    InvoiceService._update_bulk_session(
                        invoice.bulk_session, success=True,
                    )
                return

            # 6. Создать InvoiceItem (без Product — товары в каталог при verify)
            InvoiceService._create_invoice_items(
                invoice, parsed_invoice,
            )

            # 7. Перевести в REVIEW
            invoice.status = Invoice.Status.REVIEW
            invoice.save()

            InvoiceEvent.objects.create(
                invoice=invoice,
                event_type=InvoiceEvent.EventType.RECOGNIZED,
                comment=(
                    f'LLM распознавание завершено '
                    f'(confidence: {invoice.recognition_confidence})'
                ),
            )

            # Обновить BulkImportSession если есть
            if invoice.bulk_session:
                InvoiceService._update_bulk_session(
                    invoice.bulk_session, success=True,
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

            if invoice.bulk_session:
                InvoiceService._update_bulk_session(
                    invoice.bulk_session, success=False, error=str(exc),
                )

    @staticmethod
    @transaction.atomic
    def verify(invoice_id: int, user):
        """Оператор подтвердил данные: REVIEW → VERIFIED.

        Создаёт Product-записи в каталоге из InvoiceItem.
        """
        invoice = Invoice.objects.select_for_update().get(id=invoice_id)

        if invoice.status != Invoice.Status.REVIEW:
            raise ValueError(
                f'Нельзя подтвердить: текущий статус '
                f'"{invoice.get_status_display()}"'
            )

        # Валидация обязательных полей
        errors = []
        if not invoice.counterparty_id:
            errors.append('Не указан контрагент')
        if not invoice.amount_gross:
            errors.append('Не указана сумма')
        if errors:
            raise ValueError(
                'Нельзя подтвердить: ' + '; '.join(errors)
            )

        # Создать товары в каталоге из позиций
        InvoiceService._create_products_from_items(invoice)

        invoice.status = Invoice.Status.VERIFIED
        invoice.reviewed_by = user
        invoice.reviewed_at = timezone.now()
        invoice.save()

        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.REVIEWED,
            user=user,
            comment='Оператор подтвердил данные счёта',
        )

    @staticmethod
    @transaction.atomic
    def submit_to_registry(invoice_id: int, user):
        """Оператор отправил в реестр: VERIFIED → IN_REGISTRY."""
        invoice = Invoice.objects.select_for_update().get(id=invoice_id)

        if invoice.status != Invoice.Status.VERIFIED:
            raise ValueError(
                f'Нельзя отправить в реестр: текущий статус '
                f'"{invoice.get_status_display()}"'
            )

        invoice.status = Invoice.Status.IN_REGISTRY
        invoice.save()

        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.SENT_TO_REGISTRY,
            user=user,
            comment='Оператор отправил счёт в реестр оплат',
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
    def mark_cash_paid(invoice_id: int, user=None):
        """Наличная/ручная оплата: APPROVED → PAID (минуя банковское ПП)."""
        invoice = Invoice.objects.select_for_update().get(id=invoice_id)

        if invoice.status != Invoice.Status.APPROVED:
            raise ValueError(
                f'Нельзя отметить оплату: текущий статус "{invoice.get_status_display()}"'
            )
        if invoice.bank_payment_order_id:
            raise ValueError('Этот счёт привязан к платёжному поручению, используйте банковскую оплату')

        invoice.status = Invoice.Status.PAID
        invoice.paid_at = timezone.now()
        invoice.save(update_fields=['status', 'paid_at', 'updated_at'])

        InvoiceEvent.objects.create(
            invoice=invoice,
            event_type=InvoiceEvent.EventType.PAID,
            user=user,
            comment='Оплата наличными подтверждена',
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

    # =========================================================================
    # Приватные методы pipeline recognize()
    # =========================================================================

    @staticmethod
    def _parse_invoice_file(invoice: Invoice):
        """
        Парсит файл счёта в зависимости от расширения.

        Returns:
            (ParsedInvoice, processing_time_ms)
        """
        from pathlib import Path
        from llm_services.schemas import ParsedInvoice

        filename = invoice.invoice_file.name
        ext = Path(filename).suffix.lower()

        file_content = invoice.invoice_file.read()
        invoice.invoice_file.seek(0)

        if ext in ('.pdf', '.png', '.jpg', '.jpeg'):
            from llm_services.services.document_parser import DocumentParser
            from llm_services.models import LLMProvider

            parser = DocumentParser(provider=LLMProvider.get_default())
            result = parser.parse_invoice(file_content, filename)

            if not result['success']:
                raise ValueError(
                    result.get('error', f'Неизвестная ошибка парсинга {ext}')
                )

            data = result['data']
            parsed_invoice = ParsedInvoice(**data)
            time_ms = (
                result['parsed_document'].processing_time_ms
                if result.get('parsed_document')
                else 0
            )
            # Удаляем ParsedDocument, созданный DocumentParser —
            # мы создадим свой в _save_parsed_document
            if result.get('parsed_document'):
                result['parsed_document'].delete()
            return parsed_invoice, time_ms or 0

        elif ext in ('.xlsx', '.xls'):
            from llm_services.services.excel_parser import ExcelInvoiceParser
            from llm_services.models import LLMProvider

            parser = ExcelInvoiceParser(provider_model=LLMProvider.get_default())
            return parser.parse(file_content, filename)

        else:
            raise ValueError(f'Неподдерживаемый формат файла: {ext}')

    @staticmethod
    def _save_parsed_document(invoice: Invoice, parsed_invoice, processing_time: int):
        """Создаёт ParsedDocument с file_hash, parsed_data, confidence."""
        import hashlib
        from llm_services.models import LLMProvider, ParsedDocument

        file_content = invoice.invoice_file.read()
        invoice.invoice_file.seek(0)
        file_hash = hashlib.sha256(file_content).hexdigest()

        parsed_doc = ParsedDocument.objects.create(
            file_hash=file_hash,
            original_filename=invoice.invoice_file.name,
            provider=LLMProvider.get_default(),
            parsed_data=parsed_invoice.model_dump(mode='json'),
            confidence_score=parsed_invoice.confidence,
            processing_time_ms=processing_time,
            status=ParsedDocument.Status.SUCCESS,
        )
        return parsed_doc

    @staticmethod
    def _populate_invoice_fields(invoice: Invoice, parsed_invoice):
        """Заполняет поля Invoice из ParsedInvoice."""
        inv = parsed_invoice.invoice
        totals = parsed_invoice.totals

        if inv.number:
            invoice.invoice_number = inv.number
        if inv.date:
            invoice.invoice_date = inv.date

        if totals.amount_gross:
            invoice.amount_gross = totals.amount_gross
        if totals.vat_amount is not None:
            invoice.vat_amount = totals.vat_amount
            if totals.amount_gross and totals.vat_amount:
                invoice.amount_net = totals.amount_gross - totals.vat_amount

    @staticmethod
    def _match_or_create_counterparty(invoice: Invoice, parsed_invoice, auto_create: bool = False):
        """
        Ищет контрагента по ИНН из распознанных данных.
        Если auto_create=True и контрагент не найден — создаёт нового.
        """
        from accounting.models import Counterparty

        vendor_inn = parsed_invoice.vendor.inn
        if not vendor_inn or invoice.counterparty:
            return

        # Ищем существующего
        try:
            counterparty = Counterparty.objects.get(inn=vendor_inn)
            invoice.counterparty = counterparty
            return
        except Counterparty.DoesNotExist:
            pass
        except Counterparty.MultipleObjectsReturned:
            counterparty = Counterparty.objects.filter(inn=vendor_inn).first()
            invoice.counterparty = counterparty
            return

        if not auto_create:
            logger.info('Контрагент с ИНН %s не найден (auto_create=False)', vendor_inn)
            return

        # Автосоздание контрагента
        legal_form = 'ip' if len(vendor_inn) == 12 else 'ooo'
        counterparty = Counterparty.objects.create(
            name=parsed_invoice.vendor.name,
            type=Counterparty.Type.VENDOR,
            vendor_subtype=Counterparty.VendorSubtype.SUPPLIER,
            legal_form=legal_form,
            inn=vendor_inn,
            kpp=parsed_invoice.vendor.kpp or '',
        )
        invoice.counterparty = counterparty
        logger.info('Создан контрагент: %s (ИНН: %s)', counterparty.name, vendor_inn)

    @staticmethod
    def _check_business_duplicate(invoice: Invoice, parsed_invoice) -> Optional[Invoice]:
        """
        Проверяет бизнес-дубликат по номеру + сумме + ИНН поставщика.

        Returns:
            Invoice-дубликат или None.
        """
        if not invoice.invoice_number:
            return None

        qs = Invoice.objects.filter(
            invoice_number=invoice.invoice_number,
            amount_gross=invoice.amount_gross,
        ).exclude(
            id=invoice.id,
        ).exclude(
            status=Invoice.Status.CANCELLED,
        )

        # Уточняем по ИНН контрагента
        vendor_inn = parsed_invoice.vendor.inn
        if vendor_inn:
            qs = qs.filter(counterparty__inn=vendor_inn)

        return qs.first()

    @staticmethod
    def _create_invoice_items(invoice: Invoice, parsed_invoice) -> List:
        """
        Создать InvoiceItem из ParsedInvoice (без Product).

        Товары в каталог добавляются позже, при verify().
        Returns: пустой список (для обратной совместимости).
        """
        for item in parsed_invoice.items:
            raw_name = item.name
            if not raw_name:
                continue

            quantity = item.quantity
            price = item.price_per_unit
            unit = item.unit or 'шт'

            InvoiceItem.objects.create(
                invoice=invoice,
                product=None,
                raw_name=raw_name,
                quantity=quantity,
                unit=unit,
                price_per_unit=price,
                amount=quantity * price,
            )

        return []

    @staticmethod
    def _create_products_from_items(invoice: Invoice):
        """
        Создать Product из InvoiceItem при verify().

        Для каждой позиции без product: найти/создать товар,
        записать историю цен, категоризировать новые товары.
        """
        matcher = ProductMatcher()
        new_products = []

        for item in invoice.items.filter(product__isnull=True):
            if not item.raw_name:
                continue

            product, created = matcher.find_or_create_product(
                name=item.raw_name,
                unit=item.unit or 'шт',
            )

            if created:
                new_products.append(product)

            item.product = product
            item.save(update_fields=['product'])

            # История цен
            if invoice.counterparty and item.price_per_unit:
                ProductPriceHistory.objects.update_or_create(
                    product=product,
                    counterparty=invoice.counterparty,
                    invoice_date=invoice.invoice_date or date.today(),
                    unit=item.unit or 'шт',
                    defaults={
                        'price': item.price_per_unit,
                        'invoice_number': invoice.invoice_number or '',
                        'invoice': invoice,
                    }
                )

        # Категоризировать новые товары
        if new_products:
            InvoiceService._categorize_products(new_products)

    @staticmethod
    def _categorize_products(products: List):
        """Batch-категоризация новых товаров через LLM."""
        try:
            from catalog.categorizer import ProductCategorizer
            categorizer = ProductCategorizer()
            count = categorizer.categorize_products(products)
            logger.info('Категоризировано %d новых товаров', count)
        except Exception as exc:
            logger.warning('Категоризация не удалась: %s', exc)

    @staticmethod
    def _update_bulk_session(session, success: bool, error: str = ''):
        """Атомарно обновляет счётчики BulkImportSession и финализирует при завершении."""
        from django.db.models import F
        from .models import BulkImportSession

        updates = {'processed_files': F('processed_files') + 1}
        if success:
            updates['successful'] = F('successful') + 1
        else:
            updates['failed'] = F('failed') + 1

        BulkImportSession.objects.filter(id=session.id).update(**updates)

        if error:
            session.refresh_from_db()
            errors = session.errors or []
            errors.append(error)
            session.errors = errors
            session.save(update_fields=['errors'])

        # Финализация: если все файлы обработаны — ставим статус
        session.refresh_from_db()
        if session.processed_files >= session.total_files and session.status == BulkImportSession.Status.PROCESSING:
            if session.failed > 0:
                session.status = BulkImportSession.Status.COMPLETED_WITH_ERRORS
            else:
                session.status = BulkImportSession.Status.COMPLETED
            session.save(update_fields=['status', 'updated_at'])

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
