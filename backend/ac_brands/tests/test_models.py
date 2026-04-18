"""Unit-тесты для моделей ac_brands."""
from __future__ import annotations

import pytest

from ac_brands.tests.factories import BrandFactory, BrandOriginClassFactory


@pytest.mark.django_db
def test_brand_str():
    brand = BrandFactory(name="Daikin")
    assert str(brand) == "Daikin"


@pytest.mark.django_db
def test_brand_origin_class_str():
    origin = BrandOriginClassFactory(origin_type="Japan", fallback_score=80.5)
    assert str(origin) == "Japan (80.5)"


@pytest.mark.django_db
def test_brand_origin_class_fk_set_null():
    origin = BrandOriginClassFactory()
    brand = BrandFactory(origin_class=origin)
    origin.delete()
    brand.refresh_from_db()
    assert brand.origin_class is None
