"""Numeric scorer using min/median/max logic (TZ section 9)."""

from __future__ import annotations

from typing import Any

from ac_methodology.models import MethodologyCriterion as Criterion

from .base import BaseScorer, ScoreResult


def _resolve_median(criterion: Criterion, nominal_capacity: float | None) -> float | None:
    """Pick capacity-specific median when available, else fall back to scalar."""
    by_cap = criterion.median_by_capacity
    if by_cap and isinstance(by_cap, dict) and nominal_capacity is not None:
        cap_for_map = float(nominal_capacity)
        best_key: str | None = None
        best_dist = float("inf")
        for key in by_cap:
            try:
                dist = abs(float(key) - cap_for_map)
            except (ValueError, TypeError):
                continue
            if dist < best_dist or (dist == best_dist and best_key is not None and float(key) < float(best_key)):
                best_dist = dist
                best_key = key
        if best_key is not None:
            try:
                return float(by_cap[best_key])
            except (ValueError, TypeError):
                pass
    return criterion.median_value


class NumericScorer(BaseScorer):
    """
    Score = 0 at min, ~50 at median, 100 at max.
    Supports inverted scale (is_inverted) and capacity-dependent medians.
    """

    def calculate(self, criterion: Criterion, raw_value: Any, **context: Any) -> ScoreResult:
        try:
            value = float(raw_value)
        except (ValueError, TypeError):
            return ScoreResult(normalized_score=0)

        mn = criterion.min_value
        mx = criterion.max_value

        if mn is None or mx is None or mx <= mn:
            return ScoreResult(normalized_score=0)

        nominal_capacity = context.get("nominal_capacity")
        md = _resolve_median(criterion, nominal_capacity)

        if criterion.is_inverted:
            return self._calc_inverted(value, mn, mx, md)
        return self._calc_normal(value, mn, mx, md)

    def _calc_normal(self, value: float, mn: float, mx: float, md: float | None) -> ScoreResult:
        if value >= mx:
            return ScoreResult(normalized_score=100, above_reference=value > mx)
        if value <= mn:
            return ScoreResult(normalized_score=0)

        if md is not None and mn < md < mx:
            if value <= md:
                score = 50 * (value - mn) / (md - mn)
            else:
                score = 50 + 50 * (value - md) / (mx - md)
        else:
            score = 100 * (value - mn) / (mx - mn)

        return ScoreResult(normalized_score=round(score, 2)).clamp()

    def _calc_inverted(self, value: float, mn: float, mx: float, md: float | None) -> ScoreResult:
        """min is best (100), max is worst (0)."""
        if value <= mn:
            return ScoreResult(normalized_score=100, above_reference=value < mn)
        if value >= mx:
            return ScoreResult(normalized_score=0)

        if md is not None and mn < md < mx:
            if value <= md:
                score = 50 + 50 * (md - value) / (md - mn)
            else:
                score = 50 * (mx - value) / (mx - md)
        else:
            score = 100 * (mx - value) / (mx - mn)

        return ScoreResult(normalized_score=round(score, 2)).clamp()
