"""
Сервисный слой для операций с платежами.
Вынесено из PaymentSerializer для соблюдения принципа Single Responsibility.
"""
from decimal import Decimal
from django.db import transaction
from typing import List, Dict, Any, Optional

from catalog.services import ProductMatcher
from catalog.models import ProductPriceHistory
from .models import Payment, PaymentRegistry, PaymentItem


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
