import pytest
from rest_framework.test import APIClient

from kanban_files.models import FileObject


@pytest.mark.django_db
def test_supply_case_with_multiple_invoices_and_relink_attachment(settings):
    settings.KANBAN_SERVICE_TOKEN = 'svc'
    client = APIClient()

    board = client.post('/kanban-api/v1/boards/', {'key': 'supply_overlay', 'title': 'Supply'}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    col = client.post('/kanban-api/v1/columns/', {'board': board.data['id'], 'key': 'new', 'title': 'New', 'order': 1}, format='json', HTTP_X_SERVICE_TOKEN='svc')

    card = client.post(
        '/kanban-api/v1/cards/',
        {'board': board.data['id'], 'column': col.data['id'], 'type': 'supply_case', 'title': 'Case', 'description': '', 'meta': {}},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )

    case = client.post(
        '/kanban-api/v1/supply/cases/',
        {'card': card.data['id'], 'erp_object_id': 10, 'erp_contract_id': 20, 'supplier_label': 'Test'},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert case.status_code == 201

    inv1 = client.post(
        '/kanban-api/v1/supply/invoice_refs/',
        {'supply_case': case.data['id'], 'erp_invoice_id': 111},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    inv2 = client.post(
        '/kanban-api/v1/supply/invoice_refs/',
        {'supply_case': case.data['id'], 'erp_invoice_id': 222},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert inv1.status_code == 201 and inv2.status_code == 201

    del1 = client.post(
        '/kanban-api/v1/supply/deliveries/',
        {'supply_case': case.data['id'], 'invoice_ref': inv1.data['id'], 'status': 'planned', 'notes': 'part 1'},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    del2 = client.post(
        '/kanban-api/v1/supply/deliveries/',
        {'supply_case': case.data['id'], 'invoice_ref': inv1.data['id'], 'status': 'planned', 'notes': 'part 2'},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert del1.status_code == 201 and del2.status_code == 201

    f = FileObject.objects.create(
        sha256='e' * 64,
        size_bytes=1,
        mime_type='image/jpeg',
        original_filename='p.jpg',
        bucket='files',
        object_key='sha256/ee/' + ('e' * 64),
        status=FileObject.Status.READY,
    )

    att = client.post(
        f"/kanban-api/v1/cards/{card.data['id']}/attach_file/",
        {'file_id': str(f.id), 'kind': 'photo', 'document_type': 'primary'},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert att.status_code == 201
    attachment_id = att.data['id']

    relink = client.post(
        f"/kanban-api/v1/attachments/{attachment_id}/relink/",
        {'delivery_batch_id': del1.data['id']},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert relink.status_code == 200
    assert relink.data['delivery_batch_id'] == del1.data['id']

