"""Тесты публичного HVAC news API (M5.5)."""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from ac_brands.tests.factories import BrandFactory
from ac_catalog.tests.factories import PublishedACModelFactory
from news.models import NewsPost
from news.tests.factories import NewsAuthorFactory, NewsPostFactory


PUBLIC_NEWS_URL = "/api/v1/hvac/public/news/"


@pytest.fixture
def client():
    return APIClient()


@pytest.mark.django_db
def test_public_news_list_returns_new_fields(client):
    """M5.5: каждый элемент list содержит category/category_display/lede/
    reading_time_minutes/editorial_author/mentioned_ac_models."""
    author = NewsAuthorFactory(name="Евгений Лаврентьев", role="Редактор")
    ac_model = PublishedACModelFactory(brand=BrandFactory(name="Daikin"))
    NewsPostFactory(
        title="Пост с полным shape",
        body="Первый абзац.\n\nВторой.",
        lede="Вступление.",
        reading_time_minutes=3,
        editorial_author=author,
        category=NewsPost.Category.INDUSTRY,
        mentioned_ac_models=[ac_model],
    )

    resp = client.get(PUBLIC_NEWS_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    item = body[0]

    assert item["category"] == "industry"
    assert item["category_display"] == "Индустрия"
    assert item["lede"] == "Вступление."
    assert item["reading_time_minutes"] == 3

    assert item["editorial_author"] is not None
    assert item["editorial_author"]["name"] == "Евгений Лаврентьев"
    assert item["editorial_author"]["role"] == "Редактор"
    assert "avatar_url" in item["editorial_author"]

    assert isinstance(item["mentioned_ac_models"], list)
    assert len(item["mentioned_ac_models"]) == 1
    assert item["mentioned_ac_models"][0]["slug"] == ac_model.slug
    assert item["mentioned_ac_models"][0]["brand"] == "Daikin"


@pytest.mark.django_db
def test_public_news_category_filter(client):
    """M5.5: ?category=business — возвращает только business-посты."""
    NewsPostFactory(category=NewsPost.Category.BUSINESS, title="Деловая")
    NewsPostFactory(category=NewsPost.Category.MARKET, title="Рыночная")
    NewsPostFactory(category=NewsPost.Category.BUSINESS, title="Ещё деловая")

    resp = client.get(f"{PUBLIC_NEWS_URL}?category=business")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    assert all(item["category"] == "business" for item in body)


@pytest.mark.django_db
def test_public_news_excludes_deleted_and_drafts(client):
    """M5.5: soft-deleted / no_news_found / draft не попадают в публичный list."""
    NewsPostFactory(title="Видимая")
    NewsPostFactory(title="Soft-deleted", is_deleted=True)
    NewsPostFactory(title="No-news-found", is_no_news_found=True)
    NewsPostFactory(title="Draft", status="draft")

    resp = client.get(PUBLIC_NEWS_URL)
    assert resp.status_code == 200
    body = resp.json()
    titles = [item["title"] for item in body]
    assert "Видимая" in titles
    assert "Soft-deleted" not in titles
    assert "No-news-found" not in titles
    assert "Draft" not in titles
