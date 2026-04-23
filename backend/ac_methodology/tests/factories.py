"""Factory-boy фабрики для моделей ac_methodology."""
from __future__ import annotations

import factory
from factory.django import DjangoModelFactory

from ac_methodology.models import (
    Criterion,
    MethodologyCriterion,
    MethodologyVersion,
    RatingPreset,
)


class MethodologyVersionFactory(DjangoModelFactory):
    class Meta:
        model = MethodologyVersion
        django_get_or_create = ("version",)

    version = factory.Sequence(lambda n: f"1.{n}")
    name = factory.Sequence(lambda n: f"Methodology {n}")
    description = ""
    is_active = False


class ActiveMethodologyVersionFactory(MethodologyVersionFactory):
    is_active = True


class CriterionFactory(DjangoModelFactory):
    class Meta:
        model = Criterion
        django_get_or_create = ("code",)

    code = factory.Sequence(lambda n: f"crit_{n}")
    name_ru = factory.Sequence(lambda n: f"Критерий {n}")
    value_type = Criterion.ValueType.NUMERIC
    is_active = True


class MethodologyCriterionFactory(DjangoModelFactory):
    class Meta:
        model = MethodologyCriterion

    methodology = factory.SubFactory(MethodologyVersionFactory)
    criterion = factory.SubFactory(CriterionFactory)
    scoring_type = MethodologyCriterion.ScoringType.MIN_MEDIAN_MAX
    weight = 10.0
    min_value = 0.0
    max_value = 100.0


class RatingPresetFactory(DjangoModelFactory):
    class Meta:
        model = RatingPreset
        django_get_or_create = ("slug",)

    slug = factory.Sequence(lambda n: f"preset-{n}")
    label = factory.Sequence(lambda n: f"Пресет {n}")
    order = factory.Sequence(lambda n: n)
    is_active = True
    description = ""
    is_all_selected = False
