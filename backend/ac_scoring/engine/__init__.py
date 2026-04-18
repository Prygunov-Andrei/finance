"""
Публичный API движка скоринга.

Внутреннее устройство: computation → persistence → batch.
"""

from __future__ import annotations

from .batch import recalculate_all
from .computation import compute_scores_for_model, max_possible_total_index, validate_weights
from .persistence import (
    calculate_model,
    refresh_all_ac_model_total_indices,
    update_model_total_index,
)

__all__ = [
    "calculate_model",
    "compute_scores_for_model",
    "max_possible_total_index",
    "recalculate_all",
    "refresh_all_ac_model_total_indices",
    "update_model_total_index",
    "validate_weights",
]
