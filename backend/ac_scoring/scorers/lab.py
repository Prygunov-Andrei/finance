"""Lab parameter scorer (TZ section 13)."""

from __future__ import annotations

from typing import Any

from ac_methodology.models import MethodologyCriterion as Criterion

from .base import BaseScorer, ScoreResult
from .custom_scale import CustomScaleScorer
from .numeric import NumericScorer


class LabScorer(BaseScorer):
    """
    Delegates to NumericScorer or CustomScaleScorer based on criterion config.
    Returns score=0 if lab measurement is missing and criterion is required.
    """

    def calculate(self, criterion: Criterion, raw_value: Any, **context: Any) -> ScoreResult:
        lab_status = context.get("lab_status", "not_measured")

        if lab_status != "measured":
            return ScoreResult(normalized_score=0)

        if criterion.custom_scale_json:
            return CustomScaleScorer().calculate(criterion, raw_value, **context)

        return NumericScorer().calculate(criterion, raw_value, **context)
