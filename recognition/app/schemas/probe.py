"""Pydantic schemas for /v1/probe — PDF inspection before full parsing."""

from pydantic import BaseModel


class ProbeResponse(BaseModel):
    pages_total: int
    text_layer_pages: int  # сколько страниц проходят per-page threshold
    has_text_layer: bool  # True только если ВСЕ страницы годятся под text-layer
    text_chars_total: int
    estimated_seconds: int
