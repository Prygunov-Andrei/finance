from datetime import date
from typing import Any, Dict

from django.db import transaction

from kanban_core.models import CardEvent, Card
from kanban_core.services import log_card_event
from kanban_rules.models import Rule, RuleExecution
from kanban_integrations.erp_client import notify_erp


class _SystemActor:
    user_id = None
    username = 'rules'


def _matches_conditions(card: Card, event: CardEvent, conditions: Dict[str, Any]) -> bool:
    """
    Мини-DSL (V1):
    - card_type: строка
    - from_column_key / to_column_key: для event_type=card_moved
    - column_key: текущее состояние карточки
    """
    if not conditions:
        return True

    card_type = conditions.get('card_type')
    if card_type and card.type != card_type:
        return False

    column_key = conditions.get('column_key')
    if column_key and card.column.key != column_key:
        return False

    if event.event_type == 'card_moved':
        from_key = (event.data or {}).get('from')
        to_key = (event.data or {}).get('to')

        if conditions.get('from_column_key') and conditions['from_column_key'] != from_key:
            return False
        if conditions.get('to_column_key') and conditions['to_column_key'] != to_key:
            return False

    return True


def _apply_action(card: Card, actor, action: Dict[str, Any]) -> None:
    action_type = action.get('type')

    if action_type == 'set_due_date':
        due = action.get('due_date')
        if isinstance(due, str):
            due = date.fromisoformat(due)
        card.due_date = due
        card.save(update_fields=['due_date', 'updated_at'])
        log_card_event(card, 'rule_set_due_date', actor, data={'due_date': due.isoformat() if due else None})
        return

    if action_type == 'assign':
        card.assignee_user_id = action.get('assignee_user_id')
        card.assignee_username = action.get('assignee_username', '') or ''
        card.save(update_fields=['assignee_user_id', 'assignee_username', 'updated_at'])
        log_card_event(card, 'rule_assigned', actor, data={'assignee_user_id': card.assignee_user_id})
        return

    if action_type == 'notify_erp':
        payload = action.get('payload') or {}
        # payload shape (V1):
        # - user_id (int)
        # - notification_type (str)
        # - title (str)
        # - message (str, optional)
        # - data (dict, optional)
        user_id = payload.get('user_id')
        notification_type = payload.get('notification_type', 'general')
        title = payload.get('title', '')
        message = payload.get('message', '')
        data = payload.get('data') or {}

        if user_id and title:
            notify_erp(
                user_id=int(user_id),
                notification_type=str(notification_type),
                title=str(title),
                message=str(message),
                data=data,
            )

        log_card_event(card, 'rule_notify_erp', actor, data={'payload': payload})
        return

    raise ValueError(f'Unknown action type: {action_type}')


def process_event(event: CardEvent) -> int:
    """
    Выполнить правила для конкретного события.
    Возвращает количество реально исполненных правил.
    """
    if event.event_type.startswith('rule_'):
        # Избегаем циклов по умолчанию.
        return 0

    card = event.card
    rules = Rule.objects.filter(board=card.board, event_type=event.event_type, is_active=True).order_by('created_at')
    executed = 0
    actor = _SystemActor()

    for rule in rules:
        if not _matches_conditions(card, event, rule.conditions or {}):
            continue

        with transaction.atomic():
            obj, created = RuleExecution.objects.get_or_create(rule=rule, event=event)
            if not created:
                continue

            try:
                for action in (rule.actions or []):
                    _apply_action(card, actor=actor, action=action)
                obj.status = 'ok'
                obj.save(update_fields=['status'])
                executed += 1
            except Exception as exc:
                obj.status = 'error'
                obj.error = str(exc)
                obj.save(update_fields=['status', 'error'])
                raise

    return executed

