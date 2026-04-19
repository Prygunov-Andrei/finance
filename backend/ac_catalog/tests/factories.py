"""Factory-boy фабрики для моделей ac_catalog."""
from __future__ import annotations

import factory
from factory.django import DjangoModelFactory

from ac_brands.tests.factories import BrandFactory
from ac_catalog.models import (
    ACModel,
    ACModelPhoto,
    ACModelSupplier,
    EquipmentType,
    ModelRawValue,
    ModelRegion,
)
from ac_methodology.tests.factories import CriterionFactory


class EquipmentTypeFactory(DjangoModelFactory):
    class Meta:
        model = EquipmentType
        django_get_or_create = ("name",)

    name = factory.Sequence(lambda n: f"EquipmentType-{n}")


class ACModelFactory(DjangoModelFactory):
    class Meta:
        model = ACModel

    brand = factory.SubFactory(BrandFactory)
    series = "Series-A"
    inner_unit = factory.Sequence(lambda n: f"inner-{n}")
    outer_unit = factory.Sequence(lambda n: f"outer-{n}")
    nominal_capacity = 2500.0
    publish_status = ACModel.PublishStatus.DRAFT
    total_index = 0


class PublishedACModelFactory(ACModelFactory):
    publish_status = ACModel.PublishStatus.PUBLISHED


class ArchivedACModelFactory(ACModelFactory):
    publish_status = ACModel.PublishStatus.ARCHIVED


class ModelRegionFactory(DjangoModelFactory):
    class Meta:
        model = ModelRegion

    model = factory.SubFactory(ACModelFactory)
    region_code = ModelRegion.RegionCode.RU


class ModelRawValueFactory(DjangoModelFactory):
    class Meta:
        model = ModelRawValue

    model = factory.SubFactory(ACModelFactory)
    criterion = factory.SubFactory(CriterionFactory)
    raw_value = ""


class ACModelPhotoFactory(DjangoModelFactory):
    class Meta:
        model = ACModelPhoto

    model = factory.SubFactory(ACModelFactory)
    image = factory.django.ImageField(width=10, height=10, format="JPEG")
    order = 0


class ACModelSupplierFactory(DjangoModelFactory):
    class Meta:
        model = ACModelSupplier

    model = factory.SubFactory(ACModelFactory)
    name = factory.Sequence(lambda n: f"Supplier-{n}")
    url = "https://example.com/"
    order = 0
