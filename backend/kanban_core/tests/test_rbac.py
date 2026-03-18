import datetime as dt

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from rest_framework.test import APIClient


def _generate_rsa_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode('ascii')
    pub_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode('ascii')
    return priv_pem, pub_pem


def _make_jwt(priv_pem: str, roles: list[str]):
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        'user_id': 123,
        'username': 'tester',
        'roles': roles,
        'erp_permissions': {},
        'iss': 'finans-assistant-erp',
        'aud': 'kanban-service',
        'iat': int(now.timestamp()),
        'nbf': int(now.timestamp()),
        'exp': int((now + dt.timedelta(minutes=5)).timestamp()),
    }
    return jwt.encode(payload, priv_pem, algorithm='RS256')


@pytest.mark.django_db
def test_warehouse_endpoint_denies_without_role(settings):
    priv, pub = _generate_rsa_keypair()
    settings.KANBAN_JWT_VERIFYING_KEY = pub
    settings.KANBAN_JWT_ALGORITHM = 'RS256'
    settings.KANBAN_JWT_ISSUER = 'finans-assistant-erp'
    settings.KANBAN_JWT_AUDIENCE = 'kanban-service'

    token = _make_jwt(priv, roles=['supply_operator'])
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    resp = client.get('/kanban-api/v1/rbac/warehouse_only/')
    assert resp.status_code == 403


@pytest.mark.django_db
def test_warehouse_endpoint_allows_with_role(settings):
    priv, pub = _generate_rsa_keypair()
    settings.DEBUG = True
    settings.KANBAN_JWT_VERIFYING_KEY = pub
    settings.KANBAN_JWT_ALGORITHM = 'RS256'
    settings.KANBAN_JWT_ISSUER = 'finans-assistant-erp'
    settings.KANBAN_JWT_AUDIENCE = 'kanban-service'

    token = _make_jwt(priv, roles=['warehouse'])
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    echo = client.get('/kanban-api/v1/rbac/echo_auth/')
    assert echo.status_code == 200, echo.content
    assert echo.json()['http_authorization'].startswith('Bearer ')
    whoami = client.get('/kanban-api/v1/rbac/whoami/')
    assert whoami.status_code == 200
    assert whoami.json()['roles'] == ['warehouse']
    resp = client.get('/kanban-api/v1/rbac/warehouse_only/')
    assert resp.status_code == 200
    assert resp.json()['ok'] is True


@pytest.mark.django_db
def test_service_token_allows(settings):
    settings.KANBAN_SERVICE_TOKEN = 'service-secret'

    client = APIClient()
    resp = client.get('/kanban-api/v1/rbac/warehouse_only/', HTTP_X_SERVICE_TOKEN='service-secret')
    assert resp.status_code == 200
    assert resp.json()['ok'] is True

