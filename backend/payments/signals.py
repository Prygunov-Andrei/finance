# =============================================================================
# Signals — LEGACY Payment<->PaymentRegistry sync disabled
# New system uses Invoice model with InvoiceService for state transitions.
# Old signals kept commented out for reference during transition period.
# =============================================================================

# from django.db.models.signals import post_save
# from django.dispatch import receiver
# from .models import PaymentRegistry, Payment
#
# @receiver(post_save, sender=PaymentRegistry)
# def sync_payment_from_registry(sender, instance, created, **kwargs):
#     """LEGACY: Синхронизация Payment <-> PaymentRegistry."""
#     pass
#
# @receiver(post_save, sender=Payment)
# def sync_registry_from_payment(sender, instance, created, **kwargs):
#     """LEGACY: Обратная синхронизация."""
#     pass
