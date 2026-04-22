"""Генератор dark-версий бренд-логотипов.

ТЗ: ac-rating/tz/polish-2-dark-logos.md.
PoC: ac-rating/tz/_poc_dark_logo_v6.py (проверено на 4 логотипах).

Алгоритм (детерминированный, без нейросетей):
1. Cleanup: пиксели где RGB близко к белому → плавно убираем alpha.
   Компенсирует баг normalization (M6): оригинальный нормализатор оставляет
   белые opaque-пиксели в границах текста, хотя логически они фон.
2. Классификация `is_monochromatic`: stdev(R,G,B) < 20 по непрозрачным
   пикселям. True — лого одного цвета (например, чёрный текст), можно
   перекрашивать в белый для .dark-темы.
3. Recolor: все RGB → (255, 255, 255), сохраняя alpha.

API:
    generate_dark_logo(src_path, force_colored=False, force_mono=False)
        Возвращает bytes (PNG) или None.
        None означает что dark-версия не нужна — фронт возьмёт light
        оригинал (либо fallback CSS invert).
"""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image

WHITE_THRESHOLD = 235  # RGB >= 235 начинают исчезать (плавно до 255 = 0% alpha)
MONO_ALPHA_THRESHOLD = 64  # пиксели с alpha выше — учитываем при classification
MONO_STDEV_THRESHOLD = 20.0  # средний per-pixel stdev(R,G,B) < этого → mono
MONO_MIN_PIXELS = 10  # минимум непрозрачных пикселей для корректной classification


def cleanup_white_opaque(
    img: Image.Image,
    white_threshold: int = WHITE_THRESHOLD,
) -> Image.Image:
    """Убирает белые (RGB≈255) opaque-пиксели → делает их прозрачными.

    Плавно: rgb_min=255 → alpha_new=0, rgb_min=white_threshold → alpha без изменений.
    """
    arr = np.array(img.convert("RGBA")).astype(np.float32)
    rgb_min = arr[..., :3].min(axis=2)
    denom = max(1, 255 - white_threshold)
    fade = np.clip((255 - rgb_min) / denom, 0, 1)
    arr[..., 3] *= fade
    arr[..., 3] = np.clip(arr[..., 3], 0, 255)
    return Image.fromarray(arr.astype(np.uint8), mode="RGBA")


def is_monochromatic(
    img: Image.Image,
    alpha_threshold: int = MONO_ALPHA_THRESHOLD,
    stdev_threshold: float = MONO_STDEV_THRESHOLD,
) -> bool:
    """True если лого — одно-/около-монохромный (stdev(R,G,B) низкий)."""
    arr = np.array(img.convert("RGBA"))
    alpha = arr[..., 3]
    mask = alpha > alpha_threshold
    if int(mask.sum()) < MONO_MIN_PIXELS:
        return False
    rgb = arr[mask][:, :3].astype(np.float32)
    stdev = rgb.std(axis=1)
    return float(stdev.mean()) < stdev_threshold


def set_rgb(img: Image.Image, r: int, g: int, b: int) -> Image.Image:
    """Меняет RGB у всех пикселей, сохраняя alpha-канал."""
    arr = np.array(img.convert("RGBA"))
    arr[..., 0] = r
    arr[..., 1] = g
    arr[..., 2] = b
    return Image.fromarray(arr, mode="RGBA")


def _load_image(src: Path | bytes) -> Image.Image:
    if isinstance(src, (bytes, bytearray)):
        return Image.open(io.BytesIO(src)).convert("RGBA")
    return Image.open(src).convert("RGBA")


def _to_png_bytes(img: Image.Image) -> bytes:
    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


def generate_dark_logo(
    src: Path | bytes,
    force_colored: bool = False,
    force_mono: bool = False,
) -> bytes | None:
    """Генерирует dark-версию brand-лого.

    Принимает path или bytes PNG с alpha-каналом (уже нормализован через
    `logo_normalizer.normalize_logo_file`).

    Логика:
    - `force_colored=True` → возвращает None (dark-версию не генерируем,
      фронт использует оригинал для .dark-темы).
    - `force_mono=True` → всегда перекрашиваем в белый (overrider ложно-позитивной
      colored-classification, например для logo с единственным цветным акцентом).
    - Иначе: считаем is_monochromatic; если True — recolor, иначе None.

    Returns:
        bytes: PNG bytes dark-версии (для Brand.logo_dark).
        None: dark-версия не нужна (лого цветной или force_colored).
    """
    if force_colored and force_mono:
        raise ValueError("Нельзя одновременно указывать force_colored и force_mono.")

    img = _load_image(src)
    cleaned = cleanup_white_opaque(img)

    if force_colored:
        return None

    if force_mono:
        return _to_png_bytes(set_rgb(cleaned, 255, 255, 255))

    if is_monochromatic(cleaned):
        return _to_png_bytes(set_rgb(cleaned, 255, 255, 255))

    return None


def classify_logo(src: Path | bytes) -> dict:
    """Helper для dry-run/диагностики — возвращает classification info.

    {
        "mono": bool,
        "mean_stdev": float,  # средний per-pixel stdev(R,G,B)
        "opaque_pixels": int,
    }
    """
    img = _load_image(src)
    cleaned = cleanup_white_opaque(img)
    arr = np.array(cleaned.convert("RGBA"))
    alpha = arr[..., 3]
    mask = alpha > MONO_ALPHA_THRESHOLD
    opaque = int(mask.sum())
    if opaque < MONO_MIN_PIXELS:
        return {"mono": False, "mean_stdev": 0.0, "opaque_pixels": opaque}
    rgb = arr[mask][:, :3].astype(np.float32)
    mean_stdev = float(rgb.std(axis=1).mean())
    return {
        "mono": mean_stdev < MONO_STDEV_THRESHOLD,
        "mean_stdev": mean_stdev,
        "opaque_pixels": opaque,
    }
