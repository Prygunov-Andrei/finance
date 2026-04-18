"""Formula-based scorer using interval scale (TZ section 12.2)."""

from __future__ import annotations

from typing import Any

from ac_methodology.models import MethodologyCriterion as Criterion

from .base import BaseScorer, ScoreResult


class FormulaScorer(BaseScorer):
    """
    Scores a numeric value against an interval scale defined in formula_json.
    Format: [{"from": x, "to": y, "score": z}, ...]
    """

    def calculate(self, criterion: Criterion, raw_value: Any, **context: Any) -> ScoreResult:
        try:
            value = float(raw_value)
        except (ValueError, TypeError):
            return ScoreResult(normalized_score=0)

        intervals = criterion.formula_json if isinstance(criterion.formula_json, list) else []
        if not intervals:
            return ScoreResult(normalized_score=0)

        for interval in intervals:
            low = float(interval.get("from", 0))
            high = float(interval.get("to", float("inf")))
            if low <= value < high:
                return ScoreResult(normalized_score=float(interval["score"])).clamp()

        return ScoreResult(normalized_score=0)
