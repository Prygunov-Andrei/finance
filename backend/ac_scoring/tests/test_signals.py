"""Тесты сигнала post_save MethodologyVersion → recalculate_all_task.delay."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from ac_methodology.models import MethodologyVersion


@pytest.mark.django_db
def test_signal_enqueues_when_active_and_needs_recalculation():
    mv = MethodologyVersion.objects.create(
        version="sig-1", name="Sig", is_active=True, needs_recalculation=False,
    )
    with patch("ac_scoring.signals.recalculate_all_task.delay") as mock_delay:
        mv.needs_recalculation = True
        mv.save()
    mock_delay.assert_called_once_with(methodology_id=mv.pk)


@pytest.mark.django_db
def test_signal_skips_when_not_active():
    mv = MethodologyVersion.objects.create(
        version="sig-2", name="Sig", is_active=False, needs_recalculation=False,
    )
    with patch("ac_scoring.signals.recalculate_all_task.delay") as mock_delay:
        mv.needs_recalculation = True
        mv.save()
    mock_delay.assert_not_called()


@pytest.mark.django_db
def test_signal_skips_when_needs_recalculation_false():
    mv = MethodologyVersion.objects.create(
        version="sig-3", name="Sig", is_active=True, needs_recalculation=False,
    )
    with patch("ac_scoring.signals.recalculate_all_task.delay") as mock_delay:
        mv.name = "Renamed"
        mv.save()
    mock_delay.assert_not_called()


@pytest.mark.django_db
def test_signal_recursion_guard_on_engine_reset_update_fields():
    """Когда движок сбрасывает needs_recalculation через update_fields=
    {"needs_recalculation","updated_at"} — сигнал НЕ должен ставить новую задачу.
    """
    mv = MethodologyVersion.objects.create(
        version="sig-4", name="Sig", is_active=True, needs_recalculation=True,
    )
    with patch("ac_scoring.signals.recalculate_all_task.delay") as mock_delay:
        mv.needs_recalculation = False
        mv.save(update_fields=["needs_recalculation", "updated_at"])
    mock_delay.assert_not_called()
