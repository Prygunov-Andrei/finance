"""Custom scale scorer using JSON definitions (TZ section 8.2)."""

from __future__ import annotations

import logging
from typing import Any

from ac_methodology.models import MethodologyCriterion as Criterion

from .base import BaseScorer, ScoreResult

logger = logging.getLogger(__name__)


class CustomScaleScorer(BaseScorer):
    """
    Supports two JSON formats:
    1. Dict mapping: {"value_label": score, ...}
    2. Interval list: [{"from": x, "to": y, "score": z}, ...]
    """

    def calculate(self, criterion: Criterion, raw_value: Any, **context: Any) -> ScoreResult:
        scale = criterion.custom_scale_json
        if not scale:
            return ScoreResult(normalized_score=0)

        if isinstance(scale, dict):
            return self._dict_scale(scale, raw_value)
        if isinstance(scale, list):
            return self._interval_scale(scale, raw_value)

        logger.warning("Unknown scale format for criterion %s", criterion.code)
        return ScoreResult(normalized_score=0)

    def _dict_scale(self, scale: dict, raw_value: Any) -> ScoreResult:
        val = str(raw_value).strip().lower()
        for key, score in scale.items():
            if val == str(key).strip().lower():
                return ScoreResult(normalized_score=float(score)).clamp()
        return ScoreResult(normalized_score=0)

    def _interval_scale(self, scale: list, raw_value: Any) -> ScoreResult:
        try:
            value = float(raw_value)
        except (ValueError, TypeError):
            return ScoreResult(normalized_score=0)

        for interval in scale:
            low = float(interval.get("from", float("-inf")))
            high = float(interval.get("to", float("inf")))
            if low <= value < high:
                return ScoreResult(normalized_score=float(interval["score"])).clamp()

        return ScoreResult(normalized_score=0)
