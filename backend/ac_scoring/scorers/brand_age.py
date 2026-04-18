"""Brand age scorer (TZ 3.0 criterion 30).

Score is based on how long the brand has been selling in Russia.
Uses sales_start_year_ru from Brand (справочник брендов).

Scale: min=1995 (best, 100 pts) .. max=current_year (worst, 0 pts).
Piecewise-linear through median (if defined on criterion).
"""

from __future__ import annotations

from typing import Any

from django.utils import timezone

from ac_methodology.models import MethodologyCriterion as Criterion

from .base import BaseScorer, ScoreResult

OLDEST_YEAR = 1995


class BrandAgeScorer(BaseScorer):
    """Инверсия by design: меньший год (старше бренд) = выше балл.

    is_inverted не используется, т.к. направление шкалы зашито в логику
    доменной области — бренд с большим стажем на рынке всегда оценивается выше.
    """

    def calculate(self, criterion: Criterion, raw_value: Any, **context: Any) -> ScoreResult:
        start_year = context.get("sales_start_year_ru")
        if start_year is None:
            return ScoreResult(normalized_score=0)

        try:
            year = int(start_year)
        except (ValueError, TypeError):
            return ScoreResult(normalized_score=0)

        current_year = timezone.now().year
        mn = criterion.min_value if criterion.min_value is not None else OLDEST_YEAR
        mx = criterion.max_value if criterion.max_value is not None else float(current_year)
        md = criterion.median_value

        if mx <= mn:
            return ScoreResult(normalized_score=0)

        if year <= mn:
            return ScoreResult(normalized_score=100)
        if year >= mx:
            return ScoreResult(normalized_score=0)

        if md is not None and mn < md < mx:
            if year <= md:
                score = 50 + 50 * (md - year) / (md - mn)
            else:
                score = 50 * (mx - year) / (mx - md)
        else:
            score = 100 * (mx - year) / (mx - mn)

        return ScoreResult(normalized_score=round(score, 2)).clamp()
