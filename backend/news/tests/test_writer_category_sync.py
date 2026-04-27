"""NewsPostWriteSerializer должен синхронизировать category_ref FK.

Без этого FeaturedNewsView (фильтрует по category_ref_id) не находит новости,
у которых редактор сменил category через NewsEditor — потому что NewsPost.save()
при наличии расходящегося category_ref откатывает CharField обратно к старому
значению (см. backend/news/models.py:359-389 save()-sync).

Ключевые сценарии: PATCH category, POST category, legacy 'other' (нет в
NewsCategory), категория не существует в БД.
"""
from __future__ import annotations

import pytest
from django.utils import timezone

from news.models import NewsCategory, NewsPost
from news.serializers import NewsPostWriteSerializer


@pytest.fixture
def categories(db):
    """Активные категории для тестов (seed-миграция уже создала их в test DB)."""
    NewsCategory.objects.update_or_create(
        slug="brands", defaults={"name": "Бренды", "order": 10, "is_active": True},
    )
    NewsCategory.objects.update_or_create(
        slug="market", defaults={"name": "Рынок", "order": 20, "is_active": True},
    )


@pytest.mark.django_db
def test_create_post_with_category_sets_category_ref(categories):
    serializer = NewsPostWriteSerializer(data={
        "title": "T", "body": "B",
        "pub_date": timezone.now().isoformat(),
        "status": "draft", "source_language": "ru",
        "category": "brands",
    })
    assert serializer.is_valid(), serializer.errors
    # auto_translate — write_only, view-слой его pop'ает; в unit-тесте делаем то же.
    serializer.validated_data.pop("auto_translate", None)
    post = serializer.save()
    post.refresh_from_db()
    assert post.category == "brands"
    assert post.category_ref_id == "brands"


@pytest.mark.django_db
def test_patch_changes_category_and_category_ref(categories):
    """Главный кейс из бага #8: PATCH category на новой категории должен
    обновить и category_ref. Без фикса save()-sync откатывает category обратно
    к старому category_ref_id.
    """
    post = NewsPost.objects.create(
        title="T", body="B",
        pub_date=timezone.now(),
        status="draft", source_language="ru",
        category="brands",
    )
    post.refresh_from_db()
    assert post.category_ref_id == "brands"

    serializer = NewsPostWriteSerializer(
        post, data={"category": "market"}, partial=True,
    )
    assert serializer.is_valid(), serializer.errors
    serializer.save()

    post.refresh_from_db()
    assert post.category == "market"
    assert post.category_ref_id == "market"


@pytest.mark.django_db
def test_patch_to_unknown_category_returns_400(categories):
    """Wave 9: строгая валидация — slug, отсутствующий в NewsCategory, отвергается.

    До Wave 9 сериализатор молча ставил FK=None; теперь validate_category
    возвращает ValidationError, чтобы исключить тихий desync category vs.
    category_ref.
    """
    post = NewsPost.objects.create(
        title="T", body="B",
        pub_date=timezone.now(),
        status="draft", source_language="ru",
        category="brands",
    )
    post.refresh_from_db()

    NewsCategory.objects.filter(slug="nonexistent_slug_xyz").delete()

    serializer = NewsPostWriteSerializer(
        post, data={"category": "nonexistent_slug_xyz"}, partial=True,
    )
    assert not serializer.is_valid()
    assert "category" in serializer.errors


@pytest.mark.django_db
def test_patch_without_category_keeps_existing_ref(categories):
    """Если category не пришла в payload — category_ref не трогаем."""
    post = NewsPost.objects.create(
        title="T", body="B",
        pub_date=timezone.now(),
        status="draft", source_language="ru",
        category="brands",
    )
    post.refresh_from_db()
    assert post.category_ref_id == "brands"

    serializer = NewsPostWriteSerializer(
        post, data={"title": "Updated"}, partial=True,
    )
    assert serializer.is_valid(), serializer.errors
    serializer.save()

    post.refresh_from_db()
    assert post.title == "Updated"
    assert post.category == "brands"
    assert post.category_ref_id == "brands"


# ---------------------------------------------------------------------------
# Wave 9 — динамические категории (snять choices, max_length 20→64)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_create_with_long_dynamic_slug(categories):
    """POST новости с slug длиной >20 символов (Wave 9 расширил поле до 64)."""
    long_slug = "ekspertnye-obzory-konditsionerov"  # 33 символа
    NewsCategory.objects.update_or_create(
        slug=long_slug,
        defaults={"name": "Экспертные обзоры", "order": 90, "is_active": True},
    )

    serializer = NewsPostWriteSerializer(data={
        "title": "T", "body": "B",
        "pub_date": timezone.now().isoformat(),
        "status": "draft", "source_language": "ru",
        "category": long_slug,
    })
    assert serializer.is_valid(), serializer.errors
    serializer.validated_data.pop("auto_translate", None)
    post = serializer.save()
    post.refresh_from_db()

    assert post.category == long_slug
    assert post.category_ref_id == long_slug
    assert len(post.category) > 20


@pytest.mark.django_db
def test_create_with_unknown_slug_returns_400(categories):
    """POST с slug, которого нет в NewsCategory, отвергается строгой валидацией."""
    serializer = NewsPostWriteSerializer(data={
        "title": "T", "body": "B",
        "pub_date": timezone.now().isoformat(),
        "status": "draft", "source_language": "ru",
        "category": "totally_not_in_db",
    })
    assert not serializer.is_valid()
    assert "category" in serializer.errors


@pytest.mark.django_db
def test_all_legacy_enum_slugs_accepted(categories):
    """Regression: все 8 legacy slugs из TextChoices enum продолжают валидироваться.

    Seed-миграция 0028 создаёт их в NewsCategory; даже после снятия choices
    сериализатор должен их принимать.
    """
    legacy_slugs = [
        "business", "industry", "market", "regulation",
        "review", "guide", "brands", "other",
    ]
    for slug in legacy_slugs:
        NewsCategory.objects.update_or_create(
            slug=slug, defaults={"name": slug.capitalize(), "is_active": True},
        )

    for slug in legacy_slugs:
        serializer = NewsPostWriteSerializer(data={
            "title": "T", "body": "B",
            "pub_date": timezone.now().isoformat(),
            "status": "draft", "source_language": "ru",
            "category": slug,
        })
        assert serializer.is_valid(), (slug, serializer.errors)
