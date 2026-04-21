"""Тесты моделей news (M5.1 / M5.2)."""
from __future__ import annotations

import pytest

from news.models import NewsPost
from news.tests.factories import NewsPostFactory


@pytest.mark.django_db
def test_category_default_is_other():
    """M5.1: если category не передан — дефолт 'other'."""
    post = NewsPost.objects.create(title="Без категории", body="тело")
    assert post.category == NewsPost.Category.OTHER == "other"


@pytest.mark.django_db
def test_reading_time_auto_calculation():
    """M5.2: reading_time_minutes считается из body как round(words/200), >=1.

    400 слов → 2 минуты. 50 слов → 1 (минимум)."""
    body_400 = " ".join(["слово"] * 400)
    post_400 = NewsPostFactory(body=body_400, reading_time_minutes=None)
    assert post_400.reading_time_minutes == 2

    post_50 = NewsPostFactory(body=" ".join(["w"] * 50), reading_time_minutes=None)
    assert post_50.reading_time_minutes == 1


@pytest.mark.django_db
def test_reading_time_manual_override_preserved():
    """M5.2: если редактор заполнил reading_time_minutes — save() не пересчитывает."""
    body_1000_words = " ".join(["x"] * 1000)  # auto-calc дал бы 5 мин
    post = NewsPostFactory(body=body_1000_words, reading_time_minutes=7)
    assert post.reading_time_minutes == 7

    # Повторный save без переопределения тоже сохраняет ручное значение.
    post.body = " ".join(["y"] * 2000)
    post.save()
    assert post.reading_time_minutes == 7
