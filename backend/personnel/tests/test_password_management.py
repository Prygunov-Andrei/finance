"""
API-тесты управления учётными записями и паролями сотрудников:
- POST /api/v1/personnel/employees/{id}/create-user/
- POST /api/v1/personnel/employees/{id}/set-password/
"""
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from personnel.models import Employee, get_all_permission_keys, default_erp_permissions


def _auth_client(user):
    client = APIClient()
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
    return client


@pytest.fixture
def director(db):
    user = User.objects.create_user(username='director', password='DirSecret_7x!')
    full_edit = {key: 'edit' for key in get_all_permission_keys()}
    Employee.objects.create(full_name='Директор', user=user, erp_permissions=full_edit)
    return user


@pytest.fixture
def regular_user(db):
    user = User.objects.create_user(username='regular', password='pwd_regular_1!')
    Employee.objects.create(
        full_name='Обычный сотрудник',
        user=user,
        erp_permissions=default_erp_permissions(),
    )
    return user


@pytest.fixture
def target_employee_without_user(db):
    return Employee.objects.create(
        full_name='Без учётки',
        user=None,
        erp_permissions=default_erp_permissions(),
    )


@pytest.fixture
def target_employee_with_user(db):
    user = User.objects.create_user(username='target', password='initial_1Aa!')
    return Employee.objects.create(
        full_name='С учёткой',
        user=user,
        erp_permissions=default_erp_permissions(),
    )


# ---------- create-user ----------


@pytest.mark.django_db
class TestCreateUserEndpoint:
    def test_requires_authentication(self, api_client, target_employee_without_user):
        resp = api_client.post(
            f'/api/v1/personnel/employees/{target_employee_without_user.id}/create-user/',
            {'username': 'new_user'},
            format='json',
        )
        assert resp.status_code == 401

    def test_regular_user_forbidden(self, regular_user, target_employee_without_user):
        client = _auth_client(regular_user)
        resp = client.post(
            f'/api/v1/personnel/employees/{target_employee_without_user.id}/create-user/',
            {'username': 'new_user'},
            format='json',
        )
        assert resp.status_code == 403

    def test_director_can_create(self, director, target_employee_without_user):
        client = _auth_client(director)
        resp = client.post(
            f'/api/v1/personnel/employees/{target_employee_without_user.id}/create-user/',
            {'username': 'new_user'},
            format='json',
        )
        assert resp.status_code == 201
        assert resp.data['username'] == 'new_user'

        target_employee_without_user.refresh_from_db()
        assert target_employee_without_user.user is not None
        assert target_employee_without_user.user.username == 'new_user'

    def test_created_user_has_unusable_password(self, director, target_employee_without_user):
        client = _auth_client(director)
        client.post(
            f'/api/v1/personnel/employees/{target_employee_without_user.id}/create-user/',
            {'username': 'new_user'},
            format='json',
        )
        target_employee_without_user.refresh_from_db()
        assert not target_employee_without_user.user.has_usable_password()

    def test_duplicate_username_rejected(self, director, target_employee_without_user):
        User.objects.create_user(username='taken', password='x')
        client = _auth_client(director)
        resp = client.post(
            f'/api/v1/personnel/employees/{target_employee_without_user.id}/create-user/',
            {'username': 'taken'},
            format='json',
        )
        assert resp.status_code == 400
        assert 'username' in resp.data

    def test_already_bound_rejected(self, director, target_employee_with_user):
        client = _auth_client(director)
        resp = client.post(
            f'/api/v1/personnel/employees/{target_employee_with_user.id}/create-user/',
            {'username': 'another'},
            format='json',
        )
        assert resp.status_code == 400

    def test_short_username_rejected(self, director, target_employee_without_user):
        client = _auth_client(director)
        resp = client.post(
            f'/api/v1/personnel/employees/{target_employee_without_user.id}/create-user/',
            {'username': 'ab'},
            format='json',
        )
        assert resp.status_code == 400


# ---------- set-password ----------


@pytest.mark.django_db
class TestSetPasswordEndpoint:
    def test_requires_authentication(self, api_client, target_employee_with_user):
        resp = api_client.post(
            f'/api/v1/personnel/employees/{target_employee_with_user.id}/set-password/',
            {'new_password': 'Strong_Pa55!', 'new_password_confirm': 'Strong_Pa55!'},
            format='json',
        )
        assert resp.status_code == 401

    def test_regular_user_forbidden(self, regular_user, target_employee_with_user):
        client = _auth_client(regular_user)
        resp = client.post(
            f'/api/v1/personnel/employees/{target_employee_with_user.id}/set-password/',
            {'new_password': 'Strong_Pa55!', 'new_password_confirm': 'Strong_Pa55!'},
            format='json',
        )
        assert resp.status_code == 403

    def test_rejected_if_no_user_bound(self, director, target_employee_without_user):
        client = _auth_client(director)
        resp = client.post(
            f'/api/v1/personnel/employees/{target_employee_without_user.id}/set-password/',
            {'new_password': 'Strong_Pa55!', 'new_password_confirm': 'Strong_Pa55!'},
            format='json',
        )
        assert resp.status_code == 400

    def test_confirm_mismatch_rejected(self, director, target_employee_with_user):
        client = _auth_client(director)
        resp = client.post(
            f'/api/v1/personnel/employees/{target_employee_with_user.id}/set-password/',
            {'new_password': 'Strong_Pa55!', 'new_password_confirm': 'Other_Pa55!'},
            format='json',
        )
        assert resp.status_code == 400
        assert 'new_password_confirm' in resp.data

    def test_weak_password_rejected_by_django_validators(self, director, target_employee_with_user):
        client = _auth_client(director)
        resp = client.post(
            f'/api/v1/personnel/employees/{target_employee_with_user.id}/set-password/',
            {'new_password': '123', 'new_password_confirm': '123'},
            format='json',
        )
        assert resp.status_code == 400

    def test_success_allows_login(self, director, target_employee_with_user, api_client):
        client = _auth_client(director)
        resp = client.post(
            f'/api/v1/personnel/employees/{target_employee_with_user.id}/set-password/',
            {'new_password': 'Strong_Pa55Zzz!', 'new_password_confirm': 'Strong_Pa55Zzz!'},
            format='json',
        )
        assert resp.status_code == 200

        # После установки пароля — логин должен сработать
        login_resp = api_client.post(
            '/api/v1/auth/login/',
            {'username': target_employee_with_user.user.username, 'password': 'Strong_Pa55Zzz!'},
            format='json',
        )
        assert login_resp.status_code == 200
        assert 'access' in login_resp.data
