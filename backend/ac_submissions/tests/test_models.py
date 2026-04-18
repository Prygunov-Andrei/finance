"""Unit-тесты для моделей ac_submissions."""
from __future__ import annotations

import math

import pytest

from ac_brands.tests.factories import BrandFactory
from ac_submissions.models import ACSubmission
from ac_submissions.tests.factories import ACSubmissionFactory, SubmissionPhotoFactory


@pytest.mark.django_db
def test_submission_str_uses_brand_name_when_brand_set():
    brand = BrandFactory(name="Daikin")
    sub = ACSubmissionFactory(brand=brand, inner_unit="ftxb25c")
    text = str(sub)
    assert text.startswith("Daikin")
    assert "ftxb25c" in text
    assert "На рассмотрении" in text


@pytest.mark.django_db
def test_submission_str_falls_back_to_custom_brand_name():
    sub = ACSubmissionFactory(brand=None, custom_brand_name="UnknownBrand")
    text = str(sub)
    assert text.startswith("UnknownBrand")


@pytest.mark.django_db
def test_submission_save_computes_inner_surface_area():
    sub = ACSubmissionFactory(
        inner_he_length_mm=700,
        inner_he_tube_count=12,
        inner_he_tube_diameter_mm=7.0,
    )
    expected = round(math.pi * 7.0 * 700 * 12 / 1_000_000, 4)
    assert sub.inner_he_surface_area == expected


@pytest.mark.django_db
def test_submission_save_computes_outer_surface_area():
    sub = ACSubmissionFactory(
        outer_he_length_mm=800,
        outer_he_tube_count=24,
        outer_he_tube_diameter_mm=7.0,
    )
    expected = round(math.pi * 7.0 * 800 * 24 / 1_000_000, 4)
    assert sub.outer_he_surface_area == expected


@pytest.mark.django_db
def test_submission_save_recomputes_areas_on_update():
    sub = ACSubmissionFactory()
    sub.inner_he_tube_count = 100
    sub.save()
    expected = round(
        math.pi * sub.inner_he_tube_diameter_mm * sub.inner_he_length_mm * 100 / 1_000_000,
        4,
    )
    assert sub.inner_he_surface_area == expected


@pytest.mark.django_db
def test_submission_default_status_pending():
    sub = ACSubmissionFactory()
    assert sub.status == ACSubmission.Status.PENDING


@pytest.mark.django_db
def test_submission_photo_str():
    photo = SubmissionPhotoFactory(order=2)
    text = str(photo)
    assert "Фото #2" in text
