import datetime as dt

import pytest
from rest_framework.test import APIClient

from kanban_rules.models import Rule, RuleExecution
from kanban_core.models import CardEvent
from kanban_core.models import Card
from kanban_rules.tasks import process_card_event


@pytest.mark.django_db
def test_rules_engine_is_idempotent_on_same_event(settings):
    settings.KANBAN_SERVICE_TOKEN = 'svc'

    client = APIClient()
    board = client.post('/kanban-api/v1/boards/', {'key': 'supply_rules', 'title': 'Supply'}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    col_a = client.post('/kanban-api/v1/columns/', {'board': board.data['id'], 'key': 'new', 'title': 'New', 'order': 1}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    col_b = client.post('/kanban-api/v1/columns/', {'board': board.data['id'], 'key': 'in_review', 'title': 'Review', 'order': 2}, format='json', HTTP_X_SERVICE_TOKEN='svc')

    rule = Rule.objects.create(
        board_id=board.data['id'],
        is_active=True,
        event_type='card_moved',
        title='Set due date on review',
        conditions={'to_column_key': 'in_review'},
        actions=[{'type': 'set_due_date', 'due_date': '2030-01-02'}],
    )

    card_resp = client.post(
        '/kanban-api/v1/cards/',
        {'board': board.data['id'], 'column': col_a.data['id'], 'type': 'supply_case', 'title': 'Case', 'description': '', 'meta': {}},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    card_id = card_resp.data['id']

    move = client.post(
        f'/kanban-api/v1/cards/{card_id}/move/',
        {'to_column_key': 'in_review'},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert move.status_code == 200

    card = Card.objects.get(id=card_id)
    assert card.due_date == dt.date(2030, 1, 2)

    moved_event = CardEvent.objects.filter(card_id=card_id, event_type='card_moved').latest('created_at')
    assert RuleExecution.objects.filter(rule=rule, event=moved_event).count() == 1

    # Повторная обработка того же события не должна создавать повторных execution.
    process_card_event(str(moved_event.id))
    assert RuleExecution.objects.filter(rule=rule, event=moved_event).count() == 1

