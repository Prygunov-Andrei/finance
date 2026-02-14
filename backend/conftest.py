"""
Корневой conftest.py для pytest.

Общие фикстуры, доступные во всех тестовых модулях backend.
"""
import os

# Установить ключ шифрования для banking модуля (до загрузки Django моделей)
os.environ.setdefault(
    'BANK_ENCRYPTION_KEY',
    'Cba2op88Xj8PxFfPduejikxKMdYcY1VS76j45BdfrYw=',
)

import pytest
from django.contrib.auth.models import User


@pytest.fixture
def admin_user(db):
    """Создаёт Django superuser для тестов."""
    return User.objects.create_superuser(
        username='admin',
        password='admin123',
        email='admin@test.com',
    )


@pytest.fixture
def api_client():
    """DRF APIClient без аутентификации."""
    from rest_framework.test import APIClient
    return APIClient()


@pytest.fixture
def authenticated_client(admin_user, api_client):
    """DRF APIClient с JWT-аутентификацией."""
    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(admin_user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return api_client
