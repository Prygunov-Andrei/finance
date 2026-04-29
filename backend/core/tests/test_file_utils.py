"""Wave 10.3 — SEO P2: транслит имён файлов при upload."""
from __future__ import annotations

from core.file_utils import slugify_filename


def test_slugify_filename_transliterates_cyrillic():
    result = slugify_filename("Снимок_17.04.2026_215.53.png")
    assert all(c.isascii() for c in result)
    assert result.endswith(".png")
    assert "snimok" in result.lower()


def test_slugify_filename_preserves_latin_basename():
    result = slugify_filename("FUNAI_Logo.PNG")
    assert result == "funai_logo.png"


def test_slugify_filename_lowercases_extension():
    assert slugify_filename("photo.JPG").endswith(".jpg")
    assert slugify_filename("doc.PDF").endswith(".pdf")


def test_slugify_filename_falls_back_when_basename_unsluggable():
    # Только пунктуация в base → slugify возвращает '' → fallback name.
    assert slugify_filename("---.png") == "file.png"


def test_slugify_filename_handles_mixed_cyrillic_digits_punctuation():
    result = slugify_filename("Тест №1 (final).jpeg")
    assert all(c.isascii() for c in result)
    assert result.endswith(".jpeg")
    assert "test" in result.lower()


def test_slugify_filename_idempotent_on_already_slugified():
    once = slugify_filename("Снимок экрана.png")
    twice = slugify_filename(once)
    assert once == twice
