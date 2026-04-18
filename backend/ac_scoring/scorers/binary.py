"""Binary scorer: yes -> 100, no -> 0."""

from __future__ import annotations

from typing import Any

from ac_methodology.models import MethodologyCriterion as Criterion

from .base import BaseScorer, ScoreResult

TRUTHY = {"да", "yes", "есть", "1", "true", "+"}


class BinaryScorer(BaseScorer):
    def calculate(self, criterion: Criterion, raw_value: Any, **context: Any) -> ScoreResult:
        val = str(raw_value).strip().lower()
        is_true = val in TRUTHY
        if criterion.is_inverted:
            score = 0.0 if is_true else 100.0
        else:
            score = 100.0 if is_true else 0.0
        return ScoreResult(normalized_score=score)
