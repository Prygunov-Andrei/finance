"""Тесты singleton-модели FeaturedNewsSettings и публичного endpoint
``GET /featured-news/`` для hero-блока главной hvac-info.

Endpoint смонтирован через hvac_bridge.public_urls (тот же паттерн, что
news-categories, news-authors):
- /api/v1/hvac/public/featured-news/
- /api/hvac/featured-news/
"""
from __future__ import annotations

import pytest
from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APIClient

from news.models import FeaturedNewsSettings, NewsCategory, NewsPost


URL_CANONICAL = "/api/v1/hvac/public/featured-news/"
URL_ALT = "/api/hvac/featured-news/"


# ---------------------------------------------------------------------------
# Фикстуры
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def categories(db):
    """8 NewsCategory сидируются миграцией 0028 — берём существующие."""
    return {c.slug: c for c in NewsCategory.objects.all()}


def _make_post(
    *,
    title: str,
    category_slug: str,
    pub_offset_minutes: int = 0,
    status: str = "published",
    is_no_news_found: bool = False,
    is_deleted: bool = False,
):
    """Хелпер: создаёт NewsPost. ``pub_offset_minutes`` смещает pub_date
    относительно now (положительный → в будущее, отрицательный → в прошлое).
    """
    post = NewsPost.objects.create(
        title=title,
        body="Тело новости. Несколько слов для расчёта reading_time.",
        status=status,
        source_language="ru",
        pub_date=timezone.now() + timedelta(minutes=pub_offset_minutes),
        category=category_slug,
        is_no_news_found=is_no_news_found,
        is_deleted=is_deleted,
    )
    # Гарантируем что category_ref проставился (сделает save(); если slug ещё
    # отсутствует — оставляем None и пробуем явно).
    if post.category_ref_id is None:
        try:
            post.category_ref = NewsCategory.objects.get(slug=category_slug)
            post.save(update_fields=["category_ref"])
        except NewsCategory.DoesNotExist:
            pass
    return post


# ---------------------------------------------------------------------------
# 1. Singleton-поведение модели
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSingletonModel:
    def test_save_forces_pk_1(self):
        obj = FeaturedNewsSettings()
        obj.save()
        assert obj.pk == 1
        assert FeaturedNewsSettings.objects.count() == 1

    def test_second_instance_overwrites_first(self, categories):
        first = FeaturedNewsSettings.objects.create()
        first.category = categories["brands"]
        first.save()

        # Попытка создать «вторую» запись с явным pk=2 — save() форсирует pk=1
        # и обновляет ту же строку.
        second = FeaturedNewsSettings(pk=2, category=categories["industry"])
        second.save()

        assert FeaturedNewsSettings.objects.count() == 1
        only = FeaturedNewsSettings.objects.get()
        assert only.pk == 1
        assert only.category_id == "industry"

    def test_delete_is_no_op(self, categories):
        obj = FeaturedNewsSettings.objects.create(category=categories["brands"])
        obj.delete()
        assert FeaturedNewsSettings.objects.filter(pk=1).exists()

    def test_get_creates_when_missing(self):
        FeaturedNewsSettings.objects.all().delete()
        # delete() — no-op, поэтому почистим напрямую через QuerySet.
        FeaturedNewsSettings.objects.filter(pk=1).delete()
        assert not FeaturedNewsSettings.objects.exists()

        obj = FeaturedNewsSettings.get()
        assert obj.pk == 1
        assert obj.category_id is None

    def test_get_returns_existing(self, categories):
        FeaturedNewsSettings.objects.update_or_create(
            pk=1, defaults={"category": categories["brands"]}
        )
        obj = FeaturedNewsSettings.get()
        assert obj.pk == 1
        assert obj.category_id == "brands"

    def test_str_with_and_without_category(self, categories):
        empty = FeaturedNewsSettings(pk=1)
        assert "latest from all" in str(empty)

        empty.category = categories["brands"]
        assert "brands" in str(empty)

    def test_seed_migration_created_pk_1(self):
        """Data-migration 0030_seed_featured_settings создала singleton."""
        assert FeaturedNewsSettings.objects.filter(pk=1).exists()


# ---------------------------------------------------------------------------
# 2. Endpoint /featured-news/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFeaturedNewsEndpoint:
    def test_default_no_category_returns_latest_from_all(self, client, categories):
        """Если в singleton'е category=NULL — возвращается latest published
        из всех категорий (текущее поведение по умолчанию)."""
        FeaturedNewsSettings.objects.update_or_create(
            pk=1, defaults={"category": None}
        )
        _make_post(title="Старая", category_slug="brands", pub_offset_minutes=-120)
        _make_post(title="Средняя", category_slug="industry", pub_offset_minutes=-60)
        latest = _make_post(title="Свежая", category_slug="review", pub_offset_minutes=-1)

        response = client.get(URL_CANONICAL)
        assert response.status_code == 200
        data = response.json()
        assert data["category"] is None
        assert data["post"] is not None
        assert data["post"]["id"] == latest.id
        assert data["post"]["title"] == "Свежая"

    def test_with_category_returns_latest_from_that_category(self, client, categories):
        """settings.category=brands → latest published из brands, игнорируя
        более свежие новости в других категориях."""
        FeaturedNewsSettings.objects.update_or_create(
            pk=1, defaults={"category": categories["brands"]}
        )
        # 3 brands-новости разной давности.
        _make_post(title="Brands старая", category_slug="brands", pub_offset_minutes=-180)
        _make_post(title="Brands средняя", category_slug="brands", pub_offset_minutes=-120)
        latest_brands = _make_post(
            title="Brands свежая", category_slug="brands", pub_offset_minutes=-30
        )
        # 2 industry-новости, одна свежее всех brands.
        _make_post(title="Industry старая", category_slug="industry", pub_offset_minutes=-60)
        _make_post(title="Industry самая свежая", category_slug="industry", pub_offset_minutes=-1)

        response = client.get(URL_CANONICAL)
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "brands"
        assert data["post"] is not None
        assert data["post"]["id"] == latest_brands.id

    def test_category_without_news_returns_post_null(self, client, categories):
        """settings.category=guide, но в БД нет published guide-новостей →
        endpoint возвращает {post: null, category: 'guide'}."""
        FeaturedNewsSettings.objects.update_or_create(
            pk=1, defaults={"category": categories["guide"]}
        )
        # Новость есть, но в другой категории.
        _make_post(title="Brands есть", category_slug="brands", pub_offset_minutes=-30)

        response = client.get(URL_CANONICAL)
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "guide"
        assert data["post"] is None

    def test_ignores_is_no_news_found(self, client, categories):
        """is_no_news_found=True никогда не попадает в featured — даже если
        она самая свежая по pub_date — endpoint возвращает следующую."""
        FeaturedNewsSettings.objects.update_or_create(
            pk=1, defaults={"category": categories["brands"]}
        )
        real = _make_post(
            title="Реальная", category_slug="brands", pub_offset_minutes=-60
        )
        _make_post(
            title="Заглушка",
            category_slug="brands",
            pub_offset_minutes=-1,  # свежее, но
            is_no_news_found=True,  # должна быть отфильтрована
        )

        response = client.get(URL_CANONICAL)
        assert response.status_code == 200
        assert response.json()["post"]["id"] == real.id

    def test_ignores_drafts_and_deleted_and_future(self, client, categories):
        """Фильтрует: status!=published, is_deleted=True, pub_date в будущем."""
        FeaturedNewsSettings.objects.update_or_create(
            pk=1, defaults={"category": categories["brands"]}
        )
        good = _make_post(
            title="Опубликованная", category_slug="brands", pub_offset_minutes=-60
        )
        _make_post(
            title="Draft", category_slug="brands", pub_offset_minutes=-1, status="draft"
        )
        _make_post(
            title="Soft-deleted",
            category_slug="brands",
            pub_offset_minutes=-1,
            is_deleted=True,
        )
        _make_post(
            title="Запланированная в будущем",
            category_slug="brands",
            pub_offset_minutes=+60,
        )

        response = client.get(URL_CANONICAL)
        assert response.status_code == 200
        assert response.json()["post"]["id"] == good.id

    def test_alt_url_works(self, client, categories):
        """Альтернативный mount /api/hvac/featured-news/ работает идентично."""
        FeaturedNewsSettings.objects.update_or_create(
            pk=1, defaults={"category": None}
        )
        post = _make_post(
            title="Через alt", category_slug="industry", pub_offset_minutes=-1
        )

        response = client.get(URL_ALT)
        assert response.status_code == 200
        assert response.json()["post"]["id"] == post.id

    def test_anonymous_access_allowed(self, client):
        """Endpoint публичный — anonymous может его дёрнуть и не получит 401/403."""
        response = client.get(URL_CANONICAL)
        assert response.status_code == 200

    def test_response_shape(self, client, categories):
        """Ответ всегда содержит ключи post и category (даже когда post=None)."""
        FeaturedNewsSettings.objects.update_or_create(
            pk=1, defaults={"category": categories["guide"]}
        )
        response = client.get(URL_CANONICAL)
        body = response.json()
        assert set(body.keys()) == {"post", "category"}
        assert body["post"] is None
        assert body["category"] == "guide"
