from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction
from .models import PaymentRegistry, Payment
from contracts.models import ActPaymentAllocation

@receiver(post_save, sender=PaymentRegistry)
def process_approved_payment(sender, instance, created, **kwargs):
    """
    Автоматическое создание фактического платежа при переводе заявки в статус PAID.
    Если платеж уже создан, ничего не делаем.
    """
    # Проверяем, что статус стал PAID
    if instance.status == PaymentRegistry.Status.PAID:
        # Проверяем, нет ли уже связанного платежа (через reverse relation payment_fact)
        if not hasattr(instance, 'payment_fact'):
            with transaction.atomic():
                # Создаем платеж
                payment = Payment.objects.create(
                    payment_registry=instance,
                    payment_type=Payment.PaymentType.EXPENSE, # Заявки в основном на расход
                    amount=instance.amount,
                    amount_gross=instance.amount, # Предполагаем, что сумма в заявке полная
                    payment_date=instance.planned_date,
                    contract=instance.contract,
                    category=instance.category,
                    account=instance.account,
                    legal_entity=instance.account.legal_entity if instance.account else None,
                    description=f"Оплата по заявке: {instance.comment or 'Без комментария'}",
                    status=Payment.Status.PAID
                )
                
                # Если в заявке был указан Акт, создаем аллокацию (привязку платежа к акту)
                if instance.act:
                    ActPaymentAllocation.objects.create(
                        act=instance.act,
                        payment=payment,
                        amount=instance.amount
                    )

@receiver(post_save, sender=Payment)
def update_registry_status(sender, instance, created, **kwargs):
    """
    Если платеж привязан к заявке и его статус меняется, можно обновлять статус заявки.
    Например, если платеж отменен -> заявку можно вернуть в APPROVED или CANCELLED.
    Пока реализуем простую логику: если платеж оплачен, заявка тоже (хотя это дублирование).
    """
    if instance.payment_registry:
        registry = instance.payment_registry
        if instance.status == Payment.Status.PAID and registry.status != PaymentRegistry.Status.PAID:
            registry.status = PaymentRegistry.Status.PAID
            registry.save(update_fields=['status'])

