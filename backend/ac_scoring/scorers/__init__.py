from .base import BaseScorer
from .binary import BinaryScorer
from .brand_age import BrandAgeScorer
from .categorical import CategoricalScorer
from .custom_scale import CustomScaleScorer
from .fallback import FallbackScorer
from .formula import FormulaScorer
from .lab import LabScorer
from .numeric import NumericScorer

SCORER_MAP: dict[str, type[BaseScorer]] = {
    "min_median_max": NumericScorer,
    "binary": BinaryScorer,
    "universal_scale": CategoricalScorer,
    "custom_scale": CustomScaleScorer,
    "formula": FormulaScorer,
    "interval": FormulaScorer,
}

__all__ = [
    "BaseScorer",
    "BinaryScorer",
    "BrandAgeScorer",
    "CategoricalScorer",
    "CustomScaleScorer",
    "FallbackScorer",
    "FormulaScorer",
    "LabScorer",
    "NumericScorer",
    "SCORER_MAP",
]
