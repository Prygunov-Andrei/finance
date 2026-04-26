"""Тесты для Ф8D — урезанный Django-admin (custom ACAdminSite).

Проверяем:
  - На `/admin/` видны ТОЛЬКО whitelist-модели (методика + auth + LogEntry).
  - Прямые URL'ы к скрытым моделям → 404.
  - LogEntry — read-only.
  - `/hvac-admin/` остаётся полным admin (backup-доступ).
"""
from __future__ import annotations

import pytest
from django.contrib.auth.models import User


@pytest.fixture
def staff_user(db):
    return User.objects.create_superuser("admin_test", "a@a.com", "pass123")


@pytest.fixture
def staff_client(client, staff_user):
    client.force_login(staff_user)
    return client


@pytest.mark.django_db
def test_admin_index_shows_only_whitelisted_apps(staff_client):
    """`/admin/` должен показывать только AC methodology + auth + admin (LogEntry)."""
    response = staff_client.get("/admin/")
    assert response.status_code == 200
    content = response.content.decode().lower()

    # whitelist visible
    assert "ac_methodology" in content or "методолог" in content or "методик" in content
    assert "auth" in content or "пользовател" in content

    # blacklist hidden
    forbidden_substrings = [
        "/admin/ac_catalog/",
        "/admin/ac_brands/",
        "/admin/ac_reviews/",
        "/admin/ac_submissions/",
        "/admin/ac_scoring/",
        "/admin/news/",
        "/admin/contracts/",
        "/admin/payments/",
        "/admin/estimates/",
        "/admin/accounting/",
        "/admin/banking/",
        "/admin/references/",
        "/admin/llm_services/",
    ]
    for fragment in forbidden_substrings:
        assert fragment not in content, f"{fragment} should be hidden in /admin/ index"


@pytest.mark.django_db
def test_admin_direct_url_to_blacklisted_model_is_404(staff_client):
    """Прямой URL к скрытой модели → 404 (ac_admin_site её не зарегистрировал)."""
    blacklisted = [
        "/admin/ac_catalog/acmodel/",
        "/admin/ac_brands/brand/",
        "/admin/ac_reviews/review/",
        "/admin/ac_submissions/acsubmission/",
        "/admin/news/newspost/",
        "/admin/contracts/contract/",
        "/admin/payments/payment/",
        "/admin/estimates/estimate/",
    ]
    for url in blacklisted:
        response = staff_client.get(url)
        assert response.status_code == 404, (
            f"{url} should be 404, got {response.status_code}"
        )


@pytest.mark.django_db
def test_admin_whitelisted_models_accessible(staff_client):
    """Whitelist URLs возвращают 200."""
    whitelist = [
        "/admin/ac_methodology/methodologyversion/",
        "/admin/ac_methodology/criterion/",
        "/admin/ac_methodology/ratingpreset/",
        "/admin/auth/user/",
        "/admin/auth/group/",
        "/admin/admin/logentry/",
    ]
    for url in whitelist:
        response = staff_client.get(url)
        assert response.status_code == 200, (
            f"{url} should be 200, got {response.status_code}"
        )


@pytest.mark.django_db
def test_logentry_is_readonly(staff_client):
    """Add для LogEntry запрещён (has_add_permission=False)."""
    response = staff_client.get("/admin/admin/logentry/add/")
    assert response.status_code in (403, 302, 404), (
        f"LogEntry add should be denied, got {response.status_code}"
    )


@pytest.mark.django_db
def test_hvac_admin_backup_full(staff_client):
    """`/hvac-admin/` остаётся полным admin — backup-доступ."""
    # Главная страница backup-admin'а должна открываться.
    response = staff_client.get("/hvac-admin/")
    assert response.status_code == 200, (
        f"/hvac-admin/ index should be 200, got {response.status_code}"
    )

    # Скрытая в /admin/ модель (news/newspost) доступна через /hvac-admin/.
    response = staff_client.get("/hvac-admin/news/newspost/")
    assert response.status_code in (200, 302), (
        f"/hvac-admin/news/newspost/ should be reachable, got {response.status_code}"
    )

    # Любая модель из admin.site._registry достижима через /hvac-admin/.
    response = staff_client.get("/hvac-admin/ac_brands/brand/")
    assert response.status_code == 200, (
        f"/hvac-admin/ac_brands/brand/ should be 200, got {response.status_code}"
    )


@pytest.mark.django_db
def test_admin_site_branding(staff_client):
    """Кастомный header/title виден на index page."""
    response = staff_client.get("/admin/")
    assert response.status_code == 200
    content = response.content.decode()
    assert "AC Rating" in content
