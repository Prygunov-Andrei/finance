"""Factory-boy фабрики для моделей ac_submissions."""
from __future__ import annotations

import factory
from factory.django import DjangoModelFactory

from ac_brands.tests.factories import BrandFactory
from ac_submissions.models import ACSubmission, SubmissionPhoto


class ACSubmissionFactory(DjangoModelFactory):
    class Meta:
        model = ACSubmission

    status = ACSubmission.Status.PENDING
    brand = factory.SubFactory(BrandFactory)
    custom_brand_name = ""
    series = "Series-A"
    inner_unit = factory.Sequence(lambda n: f"inner-{n}")
    outer_unit = factory.Sequence(lambda n: f"outer-{n}")
    compressor_model = "compressor-x"
    nominal_capacity_watt = 2500

    drain_pan_heater = "no"
    erv = False
    fan_speed_outdoor = False
    remote_backlight = False

    fan_speeds_indoor = 3
    fine_filters = 1
    ionizer_type = "none"
    russian_remote = "yes"
    uv_lamp = "no"

    inner_he_length_mm = 700
    inner_he_tube_count = 12
    inner_he_tube_diameter_mm = 7.0

    outer_he_length_mm = 800
    outer_he_tube_count = 24
    outer_he_tube_diameter_mm = 7.0
    outer_he_thickness_mm = 22

    submitter_email = "submitter@example.com"
    consent = True


class SubmissionPhotoFactory(DjangoModelFactory):
    class Meta:
        model = SubmissionPhoto

    submission = factory.SubFactory(ACSubmissionFactory)
    image = factory.django.ImageField(width=10, height=10, format="JPEG")
    order = 0
