"""Тесты data-миграции 0005_clear_ionizer_type_values.

Maxim 1.0 Q5: набор значений ionizer_type изменён, поле очищается, Максим перезаполняет вручную.
"""
from __future__ import annotations

from importlib import import_module

import pytest

from ac_catalog.models import ModelRawValue
from ac_catalog.tests.factories import ACModelFactory, ModelRawValueFactory
from ac_methodology.tests.factories import CriterionFactory


def _clear_func():
    # Имя модуля миграции начинается с цифры — импортируем через import_module.
    module = import_module("ac_catalog.migrations.0005_clear_ionizer_type_values")
    return module.clear_ionizer_type


class _AppsStub:
    """Минимальный заместитель apps registry для RunPython функции."""

    def get_model(self, app_label, model_name):
        assert (app_label, model_name) == ("ac_catalog", "ModelRawValue")
        return ModelRawValue


@pytest.mark.django_db
def test_clear_ionizer_type_resets_raw_and_numeric_values():
    crit_ionizer = CriterionFactory(code="ionizer_type")
    crit_other = CriterionFactory(code="russian_remote")

    model = ACModelFactory()

    rv_ionizer = ModelRawValueFactory(
        model=model, criterion=crit_ionizer, raw_value="ПДС", numeric_value=2.0,
    )
    rv_ionizer_other = ModelRawValueFactory(
        model=ACModelFactory(), criterion=crit_ionizer, raw_value="Серебро",
    )
    rv_unrelated = ModelRawValueFactory(
        model=model, criterion=crit_other, raw_value="Да",
    )

    _clear_func()(_AppsStub(), schema_editor=None)

    rv_ionizer.refresh_from_db()
    rv_ionizer_other.refresh_from_db()
    rv_unrelated.refresh_from_db()

    assert rv_ionizer.raw_value == ""
    assert rv_ionizer.numeric_value is None
    assert rv_ionizer_other.raw_value == ""
    assert rv_unrelated.raw_value == "Да"


@pytest.mark.django_db
def test_clear_ionizer_type_idempotent_on_already_empty():
    crit_ionizer = CriterionFactory(code="ionizer_type")
    ModelRawValueFactory(
        model=ACModelFactory(), criterion=crit_ionizer,
        raw_value="", numeric_value=None,
    )

    _clear_func()(_AppsStub(), schema_editor=None)


@pytest.mark.django_db
def test_clear_ionizer_type_no_rows_at_all():
    _clear_func()(_AppsStub(), schema_editor=None)
