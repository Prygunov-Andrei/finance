import pytest
from rest_framework.test import APIClient

from kanban_files.models import FileObject


@pytest.mark.django_db
def test_card_move_creates_event_log(settings):
    settings.KANBAN_SERVICE_TOKEN = 'svc'

    client = APIClient()

    board_resp = client.post(
        '/kanban-api/v1/boards/',
        {'key': 'supply', 'title': 'Supply'},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert board_resp.status_code == 201
    board_id = board_resp.data['id']

    col_a = client.post(
        '/kanban-api/v1/columns/',
        {'board': board_id, 'key': 'new', 'title': 'Новые', 'order': 10},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert col_a.status_code == 201

    col_b = client.post(
        '/kanban-api/v1/columns/',
        {'board': board_id, 'key': 'in_review', 'title': 'Проверка', 'order': 20},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert col_b.status_code == 201

    card = client.post(
        '/kanban-api/v1/cards/',
        {
            'board': board_id,
            'column': col_a.data['id'],
            'type': 'supply_case',
            'title': 'Case #1',
            'description': 'x',
            'meta': {},
        },
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert card.status_code == 201
    card_id = card.data['id']

    move = client.post(
        f'/kanban-api/v1/cards/{card_id}/move/',
        {'to_column_key': 'in_review'},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert move.status_code == 200
    assert move.data['column_key'] == 'in_review'

    events = client.get(f'/kanban-api/v1/cards/{card_id}/events/', HTTP_X_SERVICE_TOKEN='svc')
    assert events.status_code == 200
    types = [e['event_type'] for e in events.data]
    assert types[0] == 'card_created'
    assert 'card_moved' in types


@pytest.mark.django_db
def test_column_key_is_immutable(settings):
    settings.KANBAN_SERVICE_TOKEN = 'svc'
    client = APIClient()

    board = client.post('/kanban-api/v1/boards/', {'key': 'obj', 'title': 'Obj'}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    col = client.post('/kanban-api/v1/columns/', {'board': board.data['id'], 'key': 'todo', 'title': 'ToDo', 'order': 1}, format='json', HTTP_X_SERVICE_TOKEN='svc')

    patch = client.patch(f"/kanban-api/v1/columns/{col.data['id']}/", {'key': 'todo2'}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    assert patch.status_code == 400


@pytest.mark.django_db
def test_attach_file_creates_event(settings):
    settings.KANBAN_SERVICE_TOKEN = 'svc'
    client = APIClient()

    board = client.post('/kanban-api/v1/boards/', {'key': 'supply2', 'title': 'Supply2'}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    col = client.post('/kanban-api/v1/columns/', {'board': board.data['id'], 'key': 'new', 'title': 'New', 'order': 1}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    card = client.post(
        '/kanban-api/v1/cards/',
        {'board': board.data['id'], 'column': col.data['id'], 'type': 'supply_case', 'title': 'Case', 'description': '', 'meta': {}},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )

    f = FileObject.objects.create(
        sha256='d' * 64,
        size_bytes=1,
        mime_type='application/pdf',
        original_filename='x.pdf',
        bucket='files',
        object_key='sha256/dd/' + ('d' * 64),
        status=FileObject.Status.READY,
    )

    att = client.post(
        f"/kanban-api/v1/cards/{card.data['id']}/attach_file/",
        {'file_id': str(f.id), 'kind': 'document', 'document_type': 'invoice'},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert att.status_code == 201

    events = client.get(f"/kanban-api/v1/cards/{card.data['id']}/events/", HTTP_X_SERVICE_TOKEN='svc')
    types = [e['event_type'] for e in events.data]
    assert 'attachment_added' in types

