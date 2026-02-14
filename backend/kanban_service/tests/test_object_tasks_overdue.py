import datetime as dt

import pytest
from rest_framework.test import APIClient

from kanban_core.models import Card, CardEvent
from kanban_object_tasks.tasks import scan_overdue_tasks


@pytest.mark.django_db
def test_overdue_scan_creates_single_event_per_day(settings):
    settings.KANBAN_SERVICE_TOKEN = 'svc'
    client = APIClient()

    board = client.post('/kanban-api/v1/boards/', {'key': 'obj_tasks', 'title': 'Tasks'}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    col = client.post('/kanban-api/v1/columns/', {'board': board.data['id'], 'key': 'todo', 'title': 'ToDo', 'order': 1}, format='json', HTTP_X_SERVICE_TOKEN='svc')

    card = client.post(
        '/kanban-api/v1/cards/',
        {'board': board.data['id'], 'column': col.data['id'], 'type': 'object_task', 'title': 'T1', 'description': '', 'meta': {}, 'due_date': '2000-01-01'},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert card.status_code == 201
    card_id = card.data['id']

    assert CardEvent.objects.filter(card_id=card_id, event_type='task_overdue').count() == 0

    scan_overdue_tasks()
    assert CardEvent.objects.filter(card_id=card_id, event_type='task_overdue').count() == 1

    # Повторный запуск в тот же день не должен плодить события.
    scan_overdue_tasks()
    assert CardEvent.objects.filter(card_id=card_id, event_type='task_overdue').count() == 1

