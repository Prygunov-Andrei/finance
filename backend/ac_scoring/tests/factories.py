"""Factory-boy фабрики для моделей ac_scoring."""
from __future__ import annotations

import factory
from factory.django import DjangoModelFactory

from ac_catalog.tests.factories import ACModelFactory
from ac_methodology.tests.factories import CriterionFactory, MethodologyVersionFactory
from ac_scoring.models import CalculationResult, CalculationRun


class CalculationRunFactory(DjangoModelFactory):
    class Meta:
        model = CalculationRun

    methodology = factory.SubFactory(MethodologyVersionFactory)
    status = CalculationRun.Status.PENDING
    triggered_by = None


class CalculationResultFactory(DjangoModelFactory):
    class Meta:
        model = CalculationResult

    run = factory.SubFactory(CalculationRunFactory)
    model = factory.SubFactory(ACModelFactory)
    criterion = factory.SubFactory(CriterionFactory)
    normalized_score = 0.0
    weighted_score = 0.0
