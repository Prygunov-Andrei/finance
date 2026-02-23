from typing import List, Optional
from pydantic import BaseModel, Field
from decimal import Decimal


class EstimateImportRow(BaseModel):
    """Одна строка импортируемой сметы"""
    item_number: int = Field(0, description="Порядковый номер")
    name: str = Field(..., description="Наименование товара/услуги")
    model_name: str = Field("", description="Модель / марка")
    unit: str = Field("шт", description="Единица измерения")
    quantity: Decimal = Field(Decimal("1"), description="Количество")
    material_unit_price: Decimal = Field(Decimal("0"), description="Цена материала за единицу")
    work_unit_price: Decimal = Field(Decimal("0"), description="Цена работы за единицу")
    section_name: str = Field("", description="Название раздела/системы")


class ParsedEstimate(BaseModel):
    """Полная структура распарсенной сметы"""
    rows: List[EstimateImportRow]
    sections: List[str] = Field(default_factory=list, description="Уникальные названия разделов")
    total_rows: int = Field(0, description="Общее количество строк")
    confidence: float = Field(0.0, ge=0.0, le=1.0, description="Уверенность парсинга")
