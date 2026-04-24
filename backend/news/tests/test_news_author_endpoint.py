"""Тесты REST endpoint NewsAuthorViewSet (справочник для ERP UI).

Endpoint — read-only, только для staff ERP-пользователей. Используется
в frontend/app/erp/hvac/news/edit/[id]/ как picker для поля
editorial_author.

URLs (news.urls подключены одновременно в hvac_bridge/public_urls и через
корневой urls.py на `/api/hvac/` и `/api/v1/hvac/public/`):
- /api/hvac/news-authors/
- /api/v1/hvac/public/news-authors/

Оба алиаса ведут к одному ViewSet. Тестируем каноничный путь
(/api/v1/hvac/public/news-authors/) — так же делает test_api.py.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from news.tests.factories import NewsAuthorFactory


User = get_user_model()

LIST_URL = "/api/v1/hvac/public/news-authors/"
ALT_URL = "/api/hvac/news-authors/"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        username="staff-picker",
        email="staff-picker@test.com",
        password="testpass123",
        is_staff=True,
    )


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        username="regular-picker",
        email="regular-picker@test.com",
        password="testpass123",
    )


@pytest.fixture
def staff_client(client, staff_user):
    client.force_authenticate(user=staff_user)
    return client


@pytest.mark.django_db
def test_news_author_list_requires_staff_for_anonymous(client):
    """Anonymous user получает 401/403 (IsAdminUser)."""
    NewsAuthorFactory(name="Евгений Лаврентьев", role="Редактор")

    resp = client.get(LIST_URL)
    assert resp.status_code in (401, 403), (
        f"Anonymous должен быть заблокирован, получили {resp.status_code}: {resp.content!r}"
    )


@pytest.mark.django_db
def test_news_author_list_forbidden_for_non_staff(client, regular_user):
    """Авторизованный, но не staff — 403 (IsAdminUser)."""
    NewsAuthorFactory(name="Евгений Лаврентьев", role="Редактор")

    client.force_authenticate(user=regular_user)
    resp = client.get(LIST_URL)
    assert resp.status_code == 403, (
        f"Non-staff должен получать 403, получили {resp.status_code}: {resp.content!r}"
    )


@pytest.mark.django_db
def test_news_author_list_returns_shape_for_staff(staff_client):
    """Staff получает 200 + правильная форма ответа.

    Проверяем:
    - список не обёрнут в пагинацию (справочник маленький);
    - каждый элемент содержит id/name/role/avatar/is_active/order;
    - avatar — строка (пусто, если файла нет).
    """
    NewsAuthorFactory(
        name="Евгений Лаврентьев",
        role="Редактор отраслевой ленты",
        order=1,
    )
    NewsAuthorFactory(
        name="Мария Иванова",
        role="Корреспондент",
        order=2,
    )

    resp = staff_client.get(LIST_URL)
    assert resp.status_code == 200, (
        f"Staff должен получать 200, получили {resp.status_code}: {resp.content!r}"
    )

    body = resp.json()
    assert isinstance(body, list), f"Ожидаем list, получили {type(body).__name__}: {body!r}"
    assert len(body) == 2

    names = [item["name"] for item in body]
    assert "Евгений Лаврентьев" in names
    assert "Мария Иванова" in names

    first = body[0]
    assert set(first.keys()) == {"id", "name", "role", "avatar", "is_active", "order"}, (
        f"Неожиданный shape: {set(first.keys())}"
    )
    assert isinstance(first["id"], int)
    assert isinstance(first["avatar"], str)  # "" если файла нет
    assert first["is_active"] is True


@pytest.mark.django_db
def test_news_author_list_default_excludes_inactive(staff_client):
    """По умолчанию неактивные авторы скрыты (чтобы picker не показывал
    устаревшие записи)."""
    NewsAuthorFactory(name="Активный", is_active=True)
    NewsAuthorFactory(name="Уволенный", is_active=False)

    resp = staff_client.get(LIST_URL)
    assert resp.status_code == 200
    body = resp.json()

    names = [item["name"] for item in body]
    assert "Активный" in names
    assert "Уволенный" not in names


@pytest.mark.django_db
def test_news_author_list_honors_is_active_all(staff_client):
    """?is_active=all — отдаём и активных, и неактивных (для админки)."""
    NewsAuthorFactory(name="Активный", is_active=True)
    NewsAuthorFactory(name="Уволенный", is_active=False)

    resp = staff_client.get(f"{LIST_URL}?is_active=all")
    assert resp.status_code == 200
    body = resp.json()
    names = {item["name"] for item in body}
    assert names == {"Активный", "Уволенный"}


@pytest.mark.django_db
def test_news_author_endpoint_alt_prefix(staff_client):
    """Alt-путь /api/hvac/news-authors/ тоже работает (public_urls монтируется
    в двух местах: /api/v1/hvac/public/ и /api/hvac/)."""
    NewsAuthorFactory(name="Евгений Лаврентьев", role="Редактор")

    resp = staff_client.get(ALT_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["name"] == "Евгений Лаврентьев"
