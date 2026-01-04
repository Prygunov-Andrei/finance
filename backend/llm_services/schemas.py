from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import date as Date
from decimal import Decimal


class VendorInfo(BaseModel):
    """Информация о поставщике"""
    name: str = Field(..., description="Название организации")
    inn: str = Field(..., description="ИНН")
    kpp: Optional[str] = Field(None, description="КПП")


class BuyerInfo(BaseModel):
    """Информация о покупателе (наша компания)"""
    name: str = Field(..., description="Название организации")
    inn: str = Field(..., description="ИНН")


class InvoiceInfo(BaseModel):
    """Информация о счёте"""
    number: str = Field(..., description="Номер счёта")
    date: Date = Field(..., description="Дата счёта")


class TotalsInfo(BaseModel):
    """Итоговые суммы"""
    amount_gross: Decimal = Field(..., description="Сумма с НДС")
    vat_amount: Decimal = Field(..., description="Сумма НДС")


class InvoiceItem(BaseModel):
    """Позиция счёта"""
    name: str = Field(..., description="Наименование товара/услуги")
    quantity: Decimal = Field(..., description="Количество")
    unit: str = Field(..., description="Единица измерения")
    price_per_unit: Decimal = Field(..., description="Цена за единицу")


class FutureFields(BaseModel):
    """Поля для будущего расширения"""
    contract_number: Optional[str] = None
    manager_name: Optional[str] = None
    manager_phone: Optional[str] = None
    manager_email: Optional[str] = None
    valid_until: Optional[Date] = None
    delivery_address: Optional[str] = None
    shipping_terms: Optional[str] = None


class ParsedInvoice(BaseModel):
    """Полная структура распарсенного счёта"""
    vendor: VendorInfo
    buyer: BuyerInfo
    invoice: InvoiceInfo
    totals: TotalsInfo
    items: List[InvoiceItem]
    confidence: float = Field(..., ge=0.0, le=1.0, description="Уверенность парсинга")
    _future: Optional[FutureFields] = None
    
    class Config:
        json_encoders = {
            Decimal: lambda v: str(v),
            Date: lambda v: v.isoformat(),
        }
