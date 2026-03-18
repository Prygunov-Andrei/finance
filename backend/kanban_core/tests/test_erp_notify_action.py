import pytest
from rest_framework.test import APIClient

from kanban_rules.models import RuleExecution, Rule


@pytest.mark.django_db
def test_notify_erp_action_called_once(monkeypatch, settings):
    settings.KANBAN_SERVICE_TOKEN = 'svc'
    settings.ERP_API_BASE_URL = 'http://erp/api/v1'
    settings.ERP_SERVICE_TOKEN = 'erp-secret'

    called = {'count': 0}

    def fake_notify_erp(*args, **kwargs):
        called['count'] += 1

    monkeypatch.setattr('kanban_rules.engine.notify_erp', fake_notify_erp)

    client = APIClient()
    board = client.post('/kanban-api/v1/boards/', {'key': 'supply_notify', 'title': 'Supply'}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    col_a = client.post('/kanban-api/v1/columns/', {'board': board.data['id'], 'key': 'new', 'title': 'New', 'order': 1}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    col_b = client.post('/kanban-api/v1/columns/', {'board': board.data['id'], 'key': 'done', 'title': 'Done', 'order': 2}, format='json', HTTP_X_SERVICE_TOKEN='svc')

    rule = Rule.objects.create(
        board_id=board.data['id'],
        is_active=True,
        event_type='card_moved',
        title='notify',
        conditions={'to_column_key': 'done'},
        actions=[{'type': 'notify_erp', 'payload': {'user_id': 1, 'notification_type': 'general', 'title': 'x'}}],
    )

    card = client.post(
        '/kanban-api/v1/cards/',
        {'board': board.data['id'], 'column': col_a.data['id'], 'type': 'supply_case', 'title': 'Case', 'description': '', 'meta': {}},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    card_id = card.data['id']

    move = client.post(f'/kanban-api/v1/cards/{card_id}/move/', {'to_column_key': 'done'}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    assert move.status_code == 200

    assert called['count'] == 1

    # Повторный move в ту же колонку не создаёт новый event и не вызывает notify.
    move2 = client.post(f'/kanban-api/v1/cards/{card_id}/move/', {'to_column_key': 'done'}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    assert move2.status_code == 200
    assert called['count'] == 1

