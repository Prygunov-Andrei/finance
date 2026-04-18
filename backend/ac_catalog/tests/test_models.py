"""Unit-тесты для моделей ac_catalog."""
from __future__ import annotations

import pytest

from ac_brands.tests.factories import BrandFactory
from ac_catalog.models import ACModel
from ac_catalog.tests.factories import (
    ACModelFactory,
    ACModelPhotoFactory,
    ACModelSupplierFactory,
    EquipmentTypeFactory,
    ModelRawValueFactory,
    ModelRegionFactory,
)
from ac_catalog.utils import generate_acmodel_slug, slugify_part, transliterate
from ac_methodology.tests.factories import CriterionFactory


@pytest.mark.django_db
def test_equipment_type_str():
    et = EquipmentTypeFactory(name="Сплит-система")
    assert str(et) == "Сплит-система"


@pytest.mark.django_db
def test_acmodel_str_uses_brand_and_inner_unit():
    brand = BrandFactory(name="Daikin")
    m = ACModelFactory(brand=brand, inner_unit="ftxb25c")
    # save() upper-cases inner_unit
    assert str(m) == "Daikin FTXB25C"


@pytest.mark.django_db
def test_acmodel_save_normalizes_units_to_upper():
    m = ACModelFactory(inner_unit=" ftxb25c ", outer_unit=" rxb25c ")
    assert m.inner_unit == "FTXB25C"
    assert m.outer_unit == "RXB25C"


@pytest.mark.django_db
def test_acmodel_save_generates_slug_when_empty():
    brand = BrandFactory(name="Daikin")
    m = ACModelFactory(brand=brand, series="Comfort", inner_unit="ftxb25c", outer_unit="rxb25c")
    assert m.slug == "Daikin-Comfort-FTXB25C-RXB25C"


@pytest.mark.django_db
def test_acmodel_save_keeps_explicit_slug():
    m = ACModelFactory(slug="custom-slug-1")
    assert m.slug == "custom-slug-1"


@pytest.mark.django_db
def test_acmodel_save_omits_empty_outer_unit_in_slug():
    brand = BrandFactory(name="Brand")
    m = ACModelFactory(brand=brand, series="Eco", inner_unit="x1", outer_unit="")
    assert m.slug == "Brand-Eco-X1"


def test_transliterate_basic():
    assert transliterate("Бренд") == "Brend"
    # Многосимвольные транслитерации (sh, kh, zh) сохраняют регистр первого символа,
    # последующие — нижний регистр. "Шум" → "SH" + "u" + "m".
    assert transliterate("Шум") == "SHum"
    assert transliterate("шум") == "shum"


def test_slugify_part_strips_punctuation():
    assert slugify_part("v 2.0+") == "v_2_0"


def test_generate_slug_drops_empty_parts():
    assert generate_acmodel_slug("Brand", "", "X1", "") == "Brand-X1"


@pytest.mark.django_db
def test_model_region_str():
    r = ModelRegionFactory(region_code="ru")
    assert "Россия" in str(r)


@pytest.mark.django_db
def test_model_raw_value_save_copies_criterion_code():
    crit = CriterionFactory(code="noise_min")
    rv = ModelRawValueFactory(criterion=crit)
    assert rv.criterion_code == "noise_min"


@pytest.mark.django_db
def test_model_raw_value_save_keeps_orphan_code_when_criterion_null():
    rv = ModelRawValueFactory(criterion=None)
    rv.criterion_code = "orphaned_code"
    rv.save()
    assert rv.criterion_code == "orphaned_code"


@pytest.mark.django_db
def test_model_raw_value_str_with_criterion():
    crit = CriterionFactory(code="cap_min")
    rv = ModelRawValueFactory(criterion=crit, raw_value="2.5")
    assert "cap_min" in str(rv) and "2.5" in str(rv)


@pytest.mark.django_db
def test_acmodel_photo_str():
    photo = ACModelPhotoFactory(order=1)
    assert "фото #1" in str(photo)


@pytest.mark.django_db
def test_acmodel_supplier_str():
    sup = ACModelSupplierFactory(name="DNS")
    assert "DNS" in str(sup)


@pytest.mark.django_db
def test_acmodel_publish_status_default_draft():
    m = ACModelFactory()
    assert m.publish_status == ACModel.PublishStatus.DRAFT
