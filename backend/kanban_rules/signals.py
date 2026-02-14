from django.db.models.signals import post_save
from django.dispatch import receiver

from kanban_core.models import CardEvent
from kanban_rules.tasks import process_card_event


@receiver(post_save, sender=CardEvent)
def enqueue_rules_on_event(sender, instance: CardEvent, created: bool, **kwargs):
    if not created:
        return
    process_card_event.delay(str(instance.id))

