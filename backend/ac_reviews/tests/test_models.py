"""Unit-тесты для моделей ac_reviews."""
from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError

from ac_reviews.tests.factories import ReviewFactory


@pytest.mark.django_db
def test_review_str_format():
    review = ReviewFactory(author_name="Иван", rating=4)
    text = str(review)
    assert "Иван" in text
    assert "4★" in text


@pytest.mark.django_db
def test_review_default_pending():
    """Новый отзыв создаётся в статусе pending — модерация требуется явно."""
    from ac_reviews.models import Review

    review = ReviewFactory()
    assert review.status == Review.Status.PENDING


@pytest.mark.django_db
def test_review_rating_validators_block_out_of_range():
    review = ReviewFactory.build(rating=6, model=None)
    with pytest.raises(ValidationError):
        review.full_clean(exclude=["model"])
