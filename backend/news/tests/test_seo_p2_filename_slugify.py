"""Wave 10.3 — SEO P2: транслит имён загружаемых файлов в news (avatar, media)."""
from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from news.models import NewsAuthor, NewsMedia
from news.tests.factories import NewsAuthorFactory, NewsPostFactory


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.django_db
def test_news_author_avatar_filename_transliterated(tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    upload = SimpleUploadedFile(
        name="Аватар Редактора.png",
        content=_png_bytes(),
        content_type="image/png",
    )
    author = NewsAuthorFactory(avatar=upload)
    author.refresh_from_db()

    basename = author.avatar.name.rsplit("/", 1)[-1]
    assert all(c.isascii() for c in basename), author.avatar.name
    assert basename.endswith(".png")


@pytest.mark.django_db
def test_news_media_file_filename_transliterated(tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    post = NewsPostFactory()
    upload = SimpleUploadedFile(
        name="Снимок_17.04.2026_215.53.png",
        content=_png_bytes(),
        content_type="image/png",
    )
    media = NewsMedia.objects.create(
        news_post=post,
        file=upload,
        media_type="image",
        original_name="Снимок_17.04.2026_215.53.png",
    )

    basename = media.file.name.rsplit("/", 1)[-1]
    assert all(c.isascii() for c in basename), media.file.name
    assert basename.endswith(".png")
    # original_name остаётся кириллический (не slug'ается) — это поле истории.
    assert media.original_name.startswith("Снимок")
