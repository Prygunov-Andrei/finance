"""Wave 10.1 — SEO P0: updated_at и main_photo_url в публичных сериализаторах
для генерации корректного sitemap.xml + image sitemap.
"""
from __future__ import annotations

import pytest

from ac_catalog.serializers import ACModelListSerializer, RatingPresetSerializer
from ac_catalog.tests.factories import (
    ACModelPhotoFactory,
    PublishedACModelFactory,
)
from ac_methodology.tests.factories import RatingPresetFactory


@pytest.mark.django_db
def test_ac_model_list_serializer_includes_updated_at():
    """SEO P0: updated_at в payload — для <lastmod> в sitemap.xml."""
    model = PublishedACModelFactory()
    data = ACModelListSerializer(model).data
    assert "updated_at" in data
    assert data["updated_at"] is not None


@pytest.mark.django_db
def test_ac_model_list_serializer_main_photo_url_returns_first_photo(tmp_path, settings):
    """SEO P0: main_photo_url = фото с минимальным order для <image:image> в sitemap."""
    settings.MEDIA_ROOT = str(tmp_path)
    model = PublishedACModelFactory()
    ACModelPhotoFactory(model=model, order=2)
    main_photo = ACModelPhotoFactory(model=model, order=0)

    data = ACModelListSerializer(model).data
    assert data["main_photo_url"]
    assert main_photo.image.url in data["main_photo_url"]
    # _url_with_mtime добавляет cache-buster — проверяем что он на месте.
    assert "?v=" in data["main_photo_url"]


@pytest.mark.django_db
def test_ac_model_list_serializer_main_photo_url_none_when_no_photos():
    """SEO P0: модель без фото → main_photo_url = None (не пустая строка)."""
    model = PublishedACModelFactory()
    data = ACModelListSerializer(model).data
    assert data["main_photo_url"] is None


@pytest.mark.django_db
def test_rating_preset_serializer_includes_updated_at():
    """SEO P0: updated_at у RatingPreset — для <lastmod> sitemap пресетов."""
    preset = RatingPresetFactory(slug="seo-test", label="SEO test")
    data = RatingPresetSerializer(preset).data
    assert "updated_at" in data
    assert data["updated_at"] is not None
