"""Тесты сервиса нормализации логотипов брендов."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from ac_brands.services.logo_normalizer import (
    CANVAS_H,
    CANVAS_W,
    MAX_CONTENT_H,
    MAX_CONTENT_W,
    _content_bbox,
    normalize_logo_file,
)


def _as_bytes(img: Image.Image, fmt: str = "PNG") -> bytes:
    buf = io.BytesIO()
    img.save(buf, fmt)
    return buf.getvalue()


def _load(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def _make_rgba(size: tuple[int, int], fill=(0, 0, 0, 0)) -> Image.Image:
    return Image.new("RGBA", size, fill)


def test_canvas_dimensions():
    """Любой выход = ровно CANVAS_W × CANVAS_H."""
    img = _make_rgba((300, 100))
    img.paste((255, 0, 0, 255), (50, 25, 250, 75))
    out = _load(normalize_logo_file(_as_bytes(img)))
    assert out.size == (CANVAS_W, CANVAS_H)
    assert out.mode == "RGBA"


def test_wide_rgba_logo_fits_max_width():
    """Широкий content (500×50) → ограничивается по width (160) с сохранением aspect."""
    img = _make_rgba((500, 50))
    img.paste((255, 0, 0, 255), (0, 0, 500, 50))
    out = _load(normalize_logo_file(_as_bytes(img)))
    bbox = out.getbbox()
    assert bbox is not None
    content_w = bbox[2] - bbox[0]
    content_h = bbox[3] - bbox[1]
    assert content_w == MAX_CONTENT_W
    # aspect 10:1 → height = 160/10 = 16
    assert content_h == 16


def test_tall_rgba_logo_fits_max_height():
    """Узкий высокий content (40×200) → ограничивается по height (40)."""
    img = _make_rgba((40, 200))
    img.paste((0, 128, 0, 255), (0, 0, 40, 200))
    out = _load(normalize_logo_file(_as_bytes(img)))
    bbox = out.getbbox()
    assert bbox is not None
    content_w = bbox[2] - bbox[0]
    content_h = bbox[3] - bbox[1]
    assert content_h == MAX_CONTENT_H
    # aspect 1:5 → width = 40/5 = 8
    assert content_w == 8


def test_whitebg_no_alpha_crops_to_content():
    """RGB 300×100 белый фон + чёрный квадрат (10..290 × 10..90) → crop по не-белому."""
    img = Image.new("RGB", (300, 100), (255, 255, 255))
    img.paste((0, 0, 0), (10, 10, 290, 90))
    data = _as_bytes(img, "PNG")

    rgba = _load(data).convert("RGBA")
    bbox = _content_bbox(rgba)
    assert bbox == (10, 10, 290, 90)

    out = _load(normalize_logo_file(data))
    assert out.size == (CANVAS_W, CANVAS_H)
    # content width 280, height 80 → scale = min(160/280, 40/80) = min(0.571, 0.5) = 0.5
    out_bbox = out.getbbox()
    assert out_bbox is not None
    cw = out_bbox[2] - out_bbox[0]
    ch = out_bbox[3] - out_bbox[1]
    assert cw == 140  # 280 * 0.5
    assert ch == 40   # 80 * 0.5


def test_empty_image_raises():
    """Полностью прозрачный PNG → ValueError."""
    img = _make_rgba((100, 100))  # alpha=0 по всему полю
    with pytest.raises(ValueError):
        normalize_logo_file(_as_bytes(img))


def test_all_white_image_raises():
    """Чистый белый RGB без content → ValueError."""
    img = Image.new("RGB", (100, 100), (255, 255, 255))
    with pytest.raises(ValueError):
        normalize_logo_file(_as_bytes(img))


def test_square_logo_scales_by_height():
    """100×100 квадрат → min(160/100, 40/100) = 0.4 → 40×40."""
    img = _make_rgba((100, 100))
    img.paste((0, 0, 255, 255), (0, 0, 100, 100))
    out = _load(normalize_logo_file(_as_bytes(img)))
    bbox = out.getbbox()
    assert bbox is not None
    cw = bbox[2] - bbox[0]
    ch = bbox[3] - bbox[1]
    assert cw == 40
    assert ch == 40


def test_preserves_aspect_ratio():
    """200×50 content (aspect 4:1) → output content тоже 4:1."""
    img = _make_rgba((200, 50))
    img.paste((255, 128, 0, 255), (0, 0, 200, 50))
    out = _load(normalize_logo_file(_as_bytes(img)))
    bbox = out.getbbox()
    assert bbox is not None
    cw = bbox[2] - bbox[0]
    ch = bbox[3] - bbox[1]
    # 4:1 ± rounding tolerance
    assert abs(cw / ch - 4.0) < 0.1


def test_content_is_centered():
    """Крошечный content в углу исходника → на выходе центрирован на canvas."""
    img = _make_rgba((500, 200))
    img.paste((255, 0, 0, 255), (10, 10, 30, 30))  # 20×20 content в углу
    out = _load(normalize_logo_file(_as_bytes(img)))
    bbox = out.getbbox()
    assert bbox is not None
    # content 20×20 → scale = min(160/20, 40/20) = 2.0 → 40×40
    # центр canvas (100, 28); content bbox: (80, 8, 120, 48)
    assert bbox == (80, 8, 120, 48)


def test_logo_with_padding_is_cropped():
    """PNG 400×200 с content 100×50 внутри → padding отрезан перед scale."""
    img = _make_rgba((400, 200))
    img.paste((10, 10, 10, 255), (150, 75, 250, 125))  # 100×50 content
    out = _load(normalize_logo_file(_as_bytes(img)))
    bbox = out.getbbox()
    assert bbox is not None
    cw = bbox[2] - bbox[0]
    ch = bbox[3] - bbox[1]
    # content 100×50 → scale = min(160/100, 40/50) = min(1.6, 0.8) = 0.8
    assert cw == 80
    assert ch == 40
