"""
Signals for auto-creating internal accounts when Objects / Contracts are created.
"""
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender='objects.Object')
def create_object_internal_account(sender, instance, created, **kwargs):
    """Auto-create an internal account for every new Object."""
    if not created:
        return
    from payments.models import ExpenseCategory

    ExpenseCategory.objects.get_or_create(
        account_type=ExpenseCategory.AccountType.OBJECT,
        object=instance,
        defaults={
            'name': f'Объект: {instance.name}',
            'code': f'obj_{instance.pk}',
        },
    )


@receiver(post_save, sender='contracts.Contract')
def create_contract_internal_account(sender, instance, created, **kwargs):
    """Auto-create an internal sub-account for every new Contract."""
    if not created:
        return
    from payments.models import ExpenseCategory

    parent = None
    if instance.object:
        parent, _ = ExpenseCategory.objects.get_or_create(
            account_type=ExpenseCategory.AccountType.OBJECT,
            object=instance.object,
            defaults={
                'name': f'Объект: {instance.object.name}',
                'code': f'obj_{instance.object.pk}',
            },
        )

    ExpenseCategory.objects.get_or_create(
        account_type=ExpenseCategory.AccountType.CONTRACT,
        contract=instance,
        defaults={
            'name': f'Договор: {instance.number}',
            'code': f'contract_{instance.pk}',
            'parent': parent,
        },
    )
