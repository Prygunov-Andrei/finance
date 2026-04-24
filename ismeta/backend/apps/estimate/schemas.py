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

    DEV-BACKLOG #6: whitelist расширен реальными ключами из Recognition
    (flow/cooling/heating/power/section/material/comments/system_prefix) —
    частые, единообразно текстовые. Любые другие ключи (diameter_mm,
    length_mm, thickness_mm, fire_class, shielded, liquid, gas, ports,
    rating, category и т.д.) принимаются через ConfigDict(extra="allow").
    """

    model_config = ConfigDict(extra="allow")

    # Бренд/модель — подставляются при PDF-импорте (Recognition) и в seed.
    brand: str | None = None
    model_name: str | None = None
    # Legacy-алиасы (до E-MAT-01 использовалось `manufacturer`/`model`).
    manufacturer: str | None = None
    model: str | None = None
    # Часто встречающиеся спецификации ОВиК (Recognition заполняет как строки
    # с единицами: «2600 м³/ч», «7.1 кВт»).
    flow: str | None = None
    cooling: str | None = None
    heating: str | None = None
    power: str | None = None
    power_kw: Decimal | None = None
    weight_kg: Decimal | None = None
    dimensions: str | None = None
    section: str | None = None
    material: str | None = None
    # UI-04 (PDF-import через Recognition): примечание + системный префикс.
    comments: str | None = None
    system_prefix: str | None = None
    # Номер исходной страницы (PDF import, E28).
    source_page: int | None = None
