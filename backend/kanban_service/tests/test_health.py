import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_health_endpoint_is_public():
    client = APIClient()
    resp = client.get('/kanban-api/health/')
    assert resp.status_code == 200
    assert resp.json()['status'] == 'ok'

