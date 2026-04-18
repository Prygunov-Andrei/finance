"""Categorical scorer with universal scale 100/70/50/30/0 (TZ section 8.1)."""

from __future__ import annotations

from typing import Any

from ac_methodology.models import MethodologyCriterion as Criterion

from .base import BaseScorer, ScoreResult

UNIVERSAL_SCALE = [100, 70, 50, 30, 0]

QUALITY_KEYWORDS = {
    100: {"отлично", "полноценный", "полная", "два и более", "excellent", "full"},
    70: {"хорошо", "good", "есть"},
    50: {"средне", "average", "упрощённый", "один", "маленькая", "маленький", "светодиод", "опция"},
    30: {"ниже среднего", "below average", "маркетинговый"},
    0: {"нет", "no", "отсутствует", "0", "none", ""},
}


class CategoricalScorer(BaseScorer):
    def calculate(self, criterion: Criterion, raw_value: Any, **context: Any) -> ScoreResult:
        val = str(raw_value).strip().lower()

        if criterion.custom_scale_json and isinstance(criterion.custom_scale_json, dict):
            for key, score in criterion.custom_scale_json.items():
                if val == str(key).strip().lower():
                    return ScoreResult(normalized_score=float(score)).clamp()
            return ScoreResult(normalized_score=0)

        for score, keywords in QUALITY_KEYWORDS.items():
            if val in keywords:
                return ScoreResult(normalized_score=float(score))

        return ScoreResult(normalized_score=0)
