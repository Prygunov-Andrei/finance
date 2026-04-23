"""Тесты для data-migration 0007_seed_key_measurements.

Миграция substring-эвристикой размечает `is_key_measurement=True` для
критериев, у которых `code` содержит `min_noise`, `noise_measurement`,
`key_` или `noise`.

Тесты вызывают внутренние функции `seed_key_measurements` и
`unseed_key_measurements` напрямую — через `apps.get_model`.
"""
from __future__ import annotations

import importlib

import pytest
from django.apps import apps

# Имена файлов миграций начинаются с цифры → прямой from-импорт невозможен.
# Используем importlib для доступа к функциям seed/unseed.
_seed_module = importlib.import_module(
    "ac_methodology.migrations.0007_seed_key_measurements",
)
seed_key_measurements = _seed_module.seed_key_measurements
unseed_key_measurements = _seed_module.unseed_key_measurements


class _FakeSchemaEditor:
    """Миграции принимают schema_editor, но RunPython функции его не
    используют — пустая заглушка."""


@pytest.mark.django_db
def test_seed_marks_noise_criterion():
    """Критерий с code='noise' помечается ключевым замером."""
    from ac_methodology.models import Criterion

    c = Criterion.objects.create(
        code="noise_test", name_ru="Шум test", value_type=Criterion.ValueType.NUMERIC,
        is_key_measurement=False,
    )
    seed_key_measurements(apps, _FakeSchemaEditor())
    c.refresh_from_db()
    assert c.is_key_measurement is True


@pytest.mark.django_db
def test_seed_marks_min_noise_criterion():
    """Критерий с подстрокой 'min_noise' в code помечается ключевым."""
    from ac_methodology.models import Criterion

    c = Criterion.objects.create(
        code="min_noise_sample", name_ru="Min noise", value_type=Criterion.ValueType.NUMERIC,
        is_key_measurement=False,
    )
    seed_key_measurements(apps, _FakeSchemaEditor())
    c.refresh_from_db()
    assert c.is_key_measurement is True


@pytest.mark.django_db
def test_seed_marks_noise_measurement_criterion():
    from ac_methodology.models import Criterion

    c = Criterion.objects.create(
        code="a_noise_measurement", name_ru="x", value_type=Criterion.ValueType.BINARY,
        is_key_measurement=False,
    )
    seed_key_measurements(apps, _FakeSchemaEditor())
    c.refresh_from_db()
    assert c.is_key_measurement is True


@pytest.mark.django_db
def test_seed_marks_key_prefixed_criterion():
    """Подстрока 'key_' в code — тоже матч."""
    from ac_methodology.models import Criterion

    c = Criterion.objects.create(
        code="key_feature_x", name_ru="x", value_type=Criterion.ValueType.NUMERIC,
        is_key_measurement=False,
    )
    seed_key_measurements(apps, _FakeSchemaEditor())
    c.refresh_from_db()
    assert c.is_key_measurement is True


@pytest.mark.django_db
def test_seed_skips_unrelated_criterion():
    """Критерий без соответствующей подстроки в code остаётся False."""
    from ac_methodology.models import Criterion

    c = Criterion.objects.create(
        code="warranty_years", name_ru="Гарантия", value_type=Criterion.ValueType.NUMERIC,
        is_key_measurement=False,
    )
    seed_key_measurements(apps, _FakeSchemaEditor())
    c.refresh_from_db()
    assert c.is_key_measurement is False


@pytest.mark.django_db
def test_seed_idempotent():
    """Повторный прогон миграции не меняет ничего и не падает."""
    from ac_methodology.models import Criterion

    c = Criterion.objects.create(
        code="noise_vibration", name_ru="Шум", value_type=Criterion.ValueType.NUMERIC,
        is_key_measurement=False,
    )
    # Первый прогон — помечает.
    seed_key_measurements(apps, _FakeSchemaEditor())
    c.refresh_from_db()
    assert c.is_key_measurement is True

    # Второй прогон — без изменений, без ошибок.
    seed_key_measurements(apps, _FakeSchemaEditor())
    c.refresh_from_db()
    assert c.is_key_measurement is True


@pytest.mark.django_db
def test_unseed_resets_matched_codes():
    """Reverse-миграция сбрасывает is_key_measurement только для кодов,
    которые матчат паттерны."""
    from ac_methodology.models import Criterion

    # Критерий матчит паттерн — будет сброшен.
    matched = Criterion.objects.create(
        code="noise_x", name_ru="x", value_type=Criterion.ValueType.NUMERIC,
        is_key_measurement=True,
    )
    # Критерий вручную помечен, но с кодом НЕ матчит — должен остаться True.
    manual = Criterion.objects.create(
        code="some_manual_flag", name_ru="x", value_type=Criterion.ValueType.NUMERIC,
        is_key_measurement=True,
    )

    unseed_key_measurements(apps, _FakeSchemaEditor())

    matched.refresh_from_db()
    manual.refresh_from_db()
    assert matched.is_key_measurement is False
    assert manual.is_key_measurement is True
