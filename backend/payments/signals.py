from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import PaymentRegistry, Payment


@receiver(post_save, sender=PaymentRegistry)
def sync_payment_from_registry(sender, instance, created, **kwargs):
    """
    Синхронизация статуса платежа при изменении статуса в Реестре.
    
    Новая логика:
    - Платёж создаётся первым (через форму), сразу со статусом pending (для expense)
    - Реестр используется только для согласования расходов
    - При согласовании (approved → paid) платёж переводится в статус paid
    - При отмене заявки (cancelled) платёж переводится в статус cancelled
    """
    # Проверяем есть ли связанный платёж
    if hasattr(instance, 'payment_fact') and instance.payment_fact:
        payment = instance.payment_fact
        
        # При переводе заявки в PAID — проводим платёж
        if instance.status == PaymentRegistry.Status.PAID:
            if payment.status != Payment.Status.PAID:
                payment.status = Payment.Status.PAID
                payment.save(update_fields=['status'])
        
        # При отмене заявки — отменяем платёж
        elif instance.status == PaymentRegistry.Status.CANCELLED:
            if payment.status != Payment.Status.CANCELLED:
                payment.status = Payment.Status.CANCELLED
                payment.save(update_fields=['status'])


@receiver(post_save, sender=Payment)
def sync_registry_from_payment(sender, instance, created, **kwargs):
    """
    Обратная синхронизация: при изменении статуса платежа обновляем Реестр.
    
    Используется для случаев, когда платёж отменяется напрямую.
    """
    if instance.payment_registry:
        registry = instance.payment_registry
        
        # Платёж оплачен → заявка оплачена
        if instance.status == Payment.Status.PAID and registry.status != PaymentRegistry.Status.PAID:
            registry.status = PaymentRegistry.Status.PAID
            registry.save(update_fields=['status'])
        
        # Платёж отменён → заявка отменена
        elif instance.status == Payment.Status.CANCELLED and registry.status != PaymentRegistry.Status.CANCELLED:
            registry.status = PaymentRegistry.Status.CANCELLED
            registry.save(update_fields=['status'])

