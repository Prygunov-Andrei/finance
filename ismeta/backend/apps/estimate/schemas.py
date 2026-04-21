"""Pydantic-схемы для JSONB-полей Estimate/Section/Item (CONTRIBUTING §10.1)."""

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MarkupConfig(BaseModel):
    """Наценка: процент, фиксированная цена, фиксированная сумма."""

    type: Literal["percent", "fixed_price", "fixed_amount"]
    value: Decimal = Field(..., ge=0)
    note: str | None = None


class TechSpecs(BaseModel):
    """ТТХ позиции — whitelist известных полей + extra="allow" для произвольных.

    Это НЕ строгая схема: JSONField `tech_specs` остаётся словарём произвольной
    формы. Мы лишь типизируем известные ключи, чтобы:
      - IDE / mypy подсказывали имена в коде;
      - `.model_validate()` в `EstimateItem.clean()` ловил очевидные type-ошибки
        (например int в полях brand/model_name) для whitelist-полей.

    Для любых других ключей (flow, cooling, heating, diameter_mm, fire_class,
    length_mm, section, material, class, shielded, liquid, gas, ports,
    thickness_mm, rating и т.д.) — ConfigDict(extra="allow").
    """

    model_config = ConfigDict(extra="allow")

    # Бренд/модель — подставляются при PDF-импорте (Recognition) и в seed.
    brand: str | None = None
    model_name: str | None = None
    # Legacy-алиасы (до E-MAT-01 использовалось `manufacturer`/`model`).
    manufacturer: str | None = None
    model: str | None = None
    # Часто встречающиеся спецификации ОВиК.
    power_kw: Decimal | None = None
    weight_kg: Decimal | None = None
    dimensions: str | None = None
    # Номер исходной страницы (PDF import, E28).
    source_page: int | None = None
