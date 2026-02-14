from kanban_core.models import Card, CardEvent
from typing import Optional, Dict, Any


def log_card_event(card: Card, event_type: str, actor, data: Optional[Dict[str, Any]] = None) -> CardEvent:
    data = data or {}
    return CardEvent.objects.create(
        card=card,
        event_type=event_type,
        data=data,
        actor_user_id=getattr(actor, 'user_id', None),
        actor_username=getattr(actor, 'username', '') or '',
    )

