"""Unit-тесты для моделей ac_scoring."""
from __future__ import annotations

import pytest

from ac_methodology.tests.factories import MethodologyVersionFactory
from ac_scoring.models import CalculationRun
from ac_scoring.tests.factories import CalculationResultFactory, CalculationRunFactory


@pytest.mark.django_db
def test_calculation_run_str_contains_status_and_version():
    mv = MethodologyVersionFactory(version="3.0")
    run = CalculationRunFactory(methodology=mv, status=CalculationRun.Status.RUNNING)
    text = str(run)
    assert "3.0" in text
    assert "Выполняется" in text


@pytest.mark.django_db
def test_calculation_run_default_status_pending():
    run = CalculationRunFactory()
    assert run.status == CalculationRun.Status.PENDING


@pytest.mark.django_db
def test_calculation_result_str_format():
    res = CalculationResultFactory(normalized_score=82.345, weighted_score=12.34)
    text = str(res)
    assert "82.3" in text
    assert "12.34" in text
