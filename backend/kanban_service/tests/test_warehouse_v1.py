import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_negative_balance_is_ahhtung(settings):
    settings.KANBAN_SERVICE_TOKEN = 'svc'
    client = APIClient()

    loc = client.post(
        '/kanban-api/v1/warehouse/locations/',
        {'kind': 'warehouse', 'title': 'Main'},
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert loc.status_code == 201, loc.data
    loc_id = loc.data['id']

    in_move = client.post(
        '/kanban-api/v1/warehouse/moves/',
        {
            'move_type': 'IN',
            'to_location': loc_id,
            'reason': '',
            'lines': [{'erp_product_id': 1, 'product_name': 'Bolt', 'unit': 'шт', 'qty': '5'}],
        },
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert in_move.status_code == 201

    out_move = client.post(
        '/kanban-api/v1/warehouse/moves/',
        {
            'move_type': 'OUT',
            'from_location': loc_id,
            'reason': '',
            'lines': [{'erp_product_id': 1, 'product_name': 'Bolt', 'unit': 'шт', 'qty': '7'}],
        },
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert out_move.status_code == 201

    balances = client.get(f'/kanban-api/v1/warehouse/moves/balances/?location_id={loc_id}', HTTP_X_SERVICE_TOKEN='svc')
    assert balances.status_code == 200
    row = balances.data['results'][0]
    assert row['ahhtung'] is True
    assert row['qty'] == '-2.000'

