import jwt
import pytest
from django.conf import settings
from django.contrib.auth.models import User

from personnel.models import Employee


@pytest.mark.django_db
def test_login_token_contains_roles_and_erp_permissions(api_client):
    user = User.objects.create_user(username='u1', password='pass12345')
    Employee.objects.create(
        full_name='Test User',
        user=user,
        erp_permissions={
            'supply': 'edit',
            'warehouse': 'edit',
            'object_tasks': 'read',
            'kanban_admin': 'none',
        },
    )

    resp = api_client.post('/api/v1/auth/login/', {'username': 'u1', 'password': 'pass12345'}, format='json')
    assert resp.status_code == 200
    access = resp.data['access']

    payload = jwt.decode(access, settings.SECRET_KEY, algorithms=['HS256'], options={'verify_aud': False})
    assert payload['username'] == 'u1'
    assert 'roles' in payload
    assert set(payload['roles']) >= {'supply_operator', 'warehouse', 'object_tasks'}
    assert payload['erp_permissions']['supply'] == 'edit'

