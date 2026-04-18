"""Factory-boy фабрики для моделей ac_brands."""
from __future__ import annotations

import factory
from factory.django import DjangoModelFactory

from ac_brands.models import Brand, BrandOriginClass


class BrandOriginClassFactory(DjangoModelFactory):
    class Meta:
        model = BrandOriginClass
        django_get_or_create = ("origin_type",)

    origin_type = factory.Sequence(lambda n: f"origin-{n}")
    fallback_score = 50.0


class BrandFactory(DjangoModelFactory):
    class Meta:
        model = Brand
        django_get_or_create = ("name",)

    name = factory.Sequence(lambda n: f"Brand-{n}")
    is_active = True
    origin_class = None
