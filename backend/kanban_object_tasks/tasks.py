from datetime import date

from celery import shared_task
from django.db import transaction

from kanban_core.models import Card, CardEvent
from kanban_core.services import log_card_event
from kanban_object_tasks.models import OverdueMarker


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def scan_overdue_tasks(self) -> int:
    today = date.today()
    qs = Card.objects.select_related('board', 'column').filter(
        type=Card.CardType.OBJECT_TASK,
        due_date__isnull=False,
        due_date__lt=today,
    )

    created_count = 0
    for card in qs.iterator():
        with transaction.atomic():
            marker, created = OverdueMarker.objects.get_or_create(card=card, marker_date=today)
            if not created:
                continue
            # Важное: создаем CardEvent один раз в сутки на карточку.
            log_card_event(card, 'task_overdue', actor=_SystemActor(), data={'due_date': card.due_date.isoformat()})
            created_count += 1

    return created_count


class _SystemActor:
    user_id = None
    username = 'object_tasks'

