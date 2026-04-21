"""Pydantic schemas for /v1/parse/spec."""

from pydantic import BaseModel, Field


class SpecItem(BaseModel):
    name: str
    model_name: str = ""
    brand: str = ""
    unit: str = "шт"
    quantity: float = 1.0
    tech_specs: str = ""
    # E15.04: содержимое колонки «Примечание» (например «1кг на 1м2») —
    # отдельное поле, чтобы фронт мог показать комментарий рядом с позицией
    # без распаковки tech_specs JSON. Pydantic-default "" сохраняет обратную
    # совместимость для старых клиентов.
    comments: str = ""
    section_name: str = ""
    page_number: int = 0
    sort_order: int = 0


class PagesStats(BaseModel):
    total: int = 0
    processed: int = 0
    skipped: int = 0
    error: int = 0


class SpecParseResponse(BaseModel):
    status: str = "done"  # done | partial | error
    items: list[SpecItem] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    pages_stats: PagesStats = Field(default_factory=PagesStats)
