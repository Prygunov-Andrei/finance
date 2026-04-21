"""Нормализация бренд-логотипов к единому optical weight.

Canvas 200×56; content ≤ 160×40 (80%×71%), центрировано на прозрачном фоне.
ТЗ: ac-rating/tz/M6-brand-logos-normalize.md.

Алгоритм:
1. Открыть как RGBA.
2. Определить content-bbox (по alpha, либо по не-белым RGB с tolerance).
3. Crop до bbox, scale с сохранением aspect под MAX_CONTENT.
4. Наложить на прозрачный canvas 200×56, центрировать.
"""

from __future__ import annotations

import io

from PIL import Image

CANVAS_W, CANVAS_H = 200, 56
MAX_CONTENT_W = 160  # 80% от canvas_w
MAX_CONTENT_H = 40   # ~71% от canvas_h

ALPHA_THRESHOLD = 10    # пиксели с alpha <= 10 считаем фоном
WHITE_TOLERANCE = 250   # RGB >= 250 считаем белым фоном


def _content_bbox(img: Image.Image) -> tuple[int, int, int, int] | None:
    """Bbox контента — не-прозрачного или не-белого. None если пусто."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    alpha = img.getchannel("A")
    amin, amax = alpha.getextrema()
    if amin < 255:
        # есть прозрачные/полупрозрачные пиксели → bbox по alpha
        mask = alpha.point(lambda a: 255 if a > ALPHA_THRESHOLD else 0)
        return mask.getbbox()

    # Все пиксели непрозрачные → фон должен быть белым; ищем не-белый.
    # point() по RGB применяется к каждому каналу независимо; getbbox()
    # считает пиксель «content» если хоть один канал ≠ 0.
    rgb = img.convert("RGB")
    inverted = rgb.point(lambda p: 255 if p < WHITE_TOLERANCE else 0)
    return inverted.getbbox()


def normalize_logo_file(src_bytes: bytes) -> bytes:
    """Принимает bytes исходного логотипа, возвращает bytes нормализованного PNG."""
    img = Image.open(io.BytesIO(src_bytes)).convert("RGBA")

    bbox = _content_bbox(img)
    if bbox is None:
        raise ValueError("Empty or all-white image")

    content = img.crop(bbox)

    scale = min(MAX_CONTENT_W / content.width, MAX_CONTENT_H / content.height)
    new_w = max(1, int(round(content.width * scale)))
    new_h = max(1, int(round(content.height * scale)))
    content = content.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    offset = ((CANVAS_W - new_w) // 2, (CANVAS_H - new_h) // 2)
    canvas.paste(content, offset, content)

    out = io.BytesIO()
    canvas.save(out, "PNG", optimize=True)
    return out.getvalue()
