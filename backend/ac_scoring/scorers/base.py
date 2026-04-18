from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ac_methodology.models import MethodologyCriterion


@dataclass
class ScoreResult:
    normalized_score: float
    above_reference: bool = False

    def clamp(self) -> "ScoreResult":
        self.normalized_score = max(0.0, min(100.0, self.normalized_score))
        return self


class BaseScorer:
    """Base class for all scoring strategies."""

    def calculate(self, criterion: MethodologyCriterion, raw_value: Any, **context: Any) -> ScoreResult:
        raise NotImplementedError
