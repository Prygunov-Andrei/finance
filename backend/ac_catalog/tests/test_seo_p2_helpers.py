"""Wave 10.3 — SEO P2: absolute URL в `_url_with_mtime` + транслит имени
кириллических файлов при upload через pre_save signal.
"""
from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from ac_catalog.models import ACModelPhoto
from ac_catalog.serializers import _url_with_mtime
from ac_catalog.tests.factories import ACModelPhotoFactory, PublishedACModelFactory


def _make_image_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.django_db
def test_url_with_mtime_empty_for_no_field():
    assert _url_with_mtime(None) == ""


@pytest.mark.django_db
def test_url_with_mtime_returns_absolute_when_public_host_set(
    tmp_path, settings, monkeypatch,
):
    settings.MEDIA_ROOT = str(tmp_path)
    monkeypatch.setenv("PUBLIC_MEDIA_HOST", "https://hvac-info.com")

    photo = ACModelPhotoFactory()
    url = _url_with_mtime(photo.image)

    assert url.startswith("https://hvac-info.com/"), url
    assert "/media/" in url
    assert "?v=" in url


@pytest.mark.django_db
def test_url_with_mtime_falls_back_to_relative_without_host(
    tmp_path, settings, monkeypatch,
):
    settings.MEDIA_ROOT = str(tmp_path)
    monkeypatch.delenv("PUBLIC_MEDIA_HOST", raising=False)

    photo = ACModelPhotoFactory()
    url = _url_with_mtime(photo.image)

    assert url.startswith("/media/"), url
    assert "?v=" in url


@pytest.mark.django_db
def test_url_with_mtime_strips_trailing_slash_in_host(
    tmp_path, settings, monkeypatch,
):
    settings.MEDIA_ROOT = str(tmp_path)
    monkeypatch.setenv("PUBLIC_MEDIA_HOST", "https://hvac-info.com/")

    photo = ACModelPhotoFactory()
    url = _url_with_mtime(photo.image)

    # Не должно быть «https://hvac-info.com//media/...».
    assert "//media/" not in url.replace("https://", "")
    assert url.startswith("https://hvac-info.com/media/")


@pytest.mark.django_db
def test_acmodel_photo_filename_transliterated_on_save(tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    model = PublishedACModelFactory()
    upload = SimpleUploadedFile(
        name="Снимок_17.04.2026_215.53.png",
        content=_make_image_bytes(),
        content_type="image/png",
    )
    photo = ACModelPhoto.objects.create(model=model, image=upload, order=0)

    basename = photo.image.name.rsplit("/", 1)[-1]
    assert all(c.isascii() for c in basename), photo.image.name
    assert basename.endswith(".png")
    assert basename.lower().startswith("snimok")


@pytest.mark.django_db
def test_acmodel_photo_filename_no_change_for_latin(tmp_path, settings):
    """Идемпотентность: латинское имя должно сохраниться (только lowercase ext)."""
    settings.MEDIA_ROOT = str(tmp_path)
    model = PublishedACModelFactory()
    upload = SimpleUploadedFile(
        name="model_photo.PNG",
        content=_make_image_bytes(),
        content_type="image/png",
    )
    photo = ACModelPhoto.objects.create(model=model, image=upload, order=0)

    basename = photo.image.name.rsplit("/", 1)[-1]
    assert basename == "model_photo.png"
