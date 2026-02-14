from celery import shared_task

from kanban_core.models import CardEvent
from kanban_rules.engine import process_event


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def process_card_event(self, event_id: str) -> int:
    try:
        event = CardEvent.objects.select_related('card', 'card__board', 'card__column').get(id=event_id)
    except CardEvent.DoesNotExist:
        return 0

    return process_event(event)

