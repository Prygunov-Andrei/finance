"""Factory-boy фабрики для моделей ac_reviews."""
from __future__ import annotations

import factory
from factory.django import DjangoModelFactory

from ac_catalog.tests.factories import ACModelFactory
from ac_reviews.models import Review


class ReviewFactory(DjangoModelFactory):
    class Meta:
        model = Review

    model = factory.SubFactory(ACModelFactory)
    author_name = factory.Sequence(lambda n: f"Reviewer-{n}")
    rating = 5
    status = Review.Status.PENDING
