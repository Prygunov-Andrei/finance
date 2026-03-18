import datetime as dt

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from rest_framework.test import APIClient

from kanban_files.models import FileObject


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


def _make_jwt(priv_pem: str, user_id: int):
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        'user_id': user_id,
        'username': f'user_{user_id}',
        'roles': ['supply_operator'],
        'erp_permissions': {},
        'iss': 'finans-assistant-erp',
        'aud': 'kanban-service',
        'iat': int(now.timestamp()),
        'nbf': int(now.timestamp()),
        'exp': int((now + dt.timedelta(minutes=5)).timestamp()),
    }
    return jwt.encode(payload, priv_pem, algorithm='RS256')


@pytest.mark.django_db
def test_file_init_returns_upload_url(monkeypatch, settings):
    settings.KANBAN_SERVICE_TOKEN = 'svc'
    settings.KANBAN_S3_BUCKET_NAME = 'files'

    monkeypatch.setattr('kanban_files.s3.presign_put', lambda bucket, key, content_type, expires_in=600: 'http://upload')

    client = APIClient()
    resp = client.post(
        '/kanban-api/v1/files/init/',
        {
            'sha256': 'a' * 64,
            'size_bytes': 123,
            'mime_type': 'application/pdf',
            'original_filename': 'doc.pdf',
        },
        format='json',
        HTTP_X_SERVICE_TOKEN='svc',
    )
    assert resp.status_code == 201
    assert resp.data['upload_url'] == 'http://upload'
    assert resp.data['file']['sha256'] == 'a' * 64


@pytest.mark.django_db
def test_file_finalize_sets_ready(monkeypatch, settings):
    settings.KANBAN_SERVICE_TOKEN = 'svc'
    settings.KANBAN_S3_BUCKET_NAME = 'files'

    f = FileObject.objects.create(
        sha256='b' * 64,
        size_bytes=10,
        mime_type='application/pdf',
        original_filename='x.pdf',
        bucket='files',
        object_key='sha256/bb/' + ('b' * 64),
        status=FileObject.Status.UPLOADING,
        created_by_user_id=1,
        created_by_username='user_1',
    )

    monkeypatch.setattr('kanban_files.s3.head_object', lambda bucket, key: {'ContentLength': 10})

    client = APIClient()
    resp = client.post('/kanban-api/v1/files/finalize/', {'file_id': str(f.id)}, format='json', HTTP_X_SERVICE_TOKEN='svc')
    assert resp.status_code == 200
    f.refresh_from_db()
    assert f.status == FileObject.Status.READY


@pytest.mark.django_db
def test_download_url_respects_owner_acl(monkeypatch, settings):
    priv, pub = _generate_rsa_keypair()
    settings.DEBUG = False
    settings.KANBAN_JWT_VERIFYING_KEY = pub
    settings.KANBAN_JWT_ALGORITHM = 'RS256'
    settings.KANBAN_JWT_ISSUER = 'finans-assistant-erp'
    settings.KANBAN_JWT_AUDIENCE = 'kanban-service'

    f = FileObject.objects.create(
        sha256='c' * 64,
        size_bytes=10,
        mime_type='application/pdf',
        original_filename='x.pdf',
        bucket='files',
        object_key='sha256/cc/' + ('c' * 64),
        status=FileObject.Status.READY,
        created_by_user_id=1,
        created_by_username='user_1',
    )

    monkeypatch.setattr('kanban_files.s3.presign_get', lambda bucket, key, expires_in=600: 'http://download')

    other_token = _make_jwt(priv, user_id=2)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {other_token}')
    resp = client.post(f'/kanban-api/v1/files/{f.id}/download_url/', format='json')
    assert resp.status_code == 403

    owner_token = _make_jwt(priv, user_id=1)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {owner_token}')
    resp = client.post(f'/kanban-api/v1/files/{f.id}/download_url/', format='json')
    assert resp.status_code == 200
    assert resp.data['download_url'] == 'http://download'

