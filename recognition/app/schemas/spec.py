"""Pydantic schemas for /v1/parse/spec."""

from pydantic import BaseModel, Field


class SpecItem(BaseModel):
    name: str
    model_name: str = ""
    # E15.05 it2: brand — торговая марка оборудования (Корф, IEK, Fujitsu).
    # manufacturer — конкретный завод-поставщик (ООО «КОРФ», АО «ДКС»).
    # В ЕСКД-таблицах это две разные колонки (brand = «Поставщик» / «Код
    # продукции», manufacturer = «Завод-изготовитель» / «Производитель»).
    brand: str = ""
    manufacturer: str = ""
    unit: str = "шт"
    quantity: float = 1.0
    tech_specs: str = ""
    comments: str = ""
    section_name: str = ""
    page_number: int = 0
    sort_order: int = 0


class PagesStats(BaseModel):
    total: int = 0
    processed: int = 0
    skipped: int = 0
    error: int = 0


class PageSummary(BaseModel):
    """E15-06 (#52): per-page self-check LLM vs parsed.

    Заполняется SpecParser'ом после normalize: LLM возвращает `expected_count`,
    мы сравниваем с количеством реально эмитнутых items. Если delta превышает
    tolerance — retry через multimodal; если и после retry delta есть —
    помечаем page как suspicious (показывается на фронте в будущей UI-10).
    """

    page: int
    expected_count: int = 0
    # E15-06 it2 (#52): vision-based self-check по картинке страницы.
    # Независим от bbox-rows → видит хвостовые потери которые expected_count
    # на bbox (видит только то что парсит) игнорирует.
    expected_count_vision: int = 0
    parsed_count: int = 0
    retried: bool = False
    suspicious: bool = False


class SpecParseResponse(BaseModel):
    status: str = "done"  # done | partial | error
    items: list[SpecItem] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    pages_stats: PagesStats = Field(default_factory=PagesStats)
    pages_summary: list[PageSummary] = Field(default_factory=list)
