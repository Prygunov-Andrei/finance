"""PoC v6: fix orig normalizer bug — белые opaque-пиксели на самом деле часть фона.

Шаги:
1. Cleanup: пиксели где RGB≈white и alpha>0 → alpha=0 (убираем "фоновые" пиксели внутри букв).
2. Для dark: mono → recolor RGB в white (сохраняя alpha).
3. Для light: сохраняем оригинал (после cleanup).
"""

from pathlib import Path
from PIL import Image
import numpy as np

SRC = Path("/tmp/logo-poc/original")
OUT_LIGHT = Path("/tmp/logo-poc/v6-light")
OUT_DARK = Path("/tmp/logo-poc/v6-dark")
OUT_LIGHT.mkdir(exist_ok=True)
OUT_DARK.mkdir(exist_ok=True)


def cleanup_white_opaque(img: Image.Image, white_threshold: int = 240) -> Image.Image:
    """Убираем пиксели где RGB близкий к белому — делаем их прозрачными.
    Плавно: rgb_min=255 → alpha_new=0, rgb_min=240 → alpha_new=original.
    """
    arr = np.array(img.convert("RGBA")).astype(np.float32)
    rgb_min = arr[..., :3].min(axis=2)
    fade = np.clip((255 - rgb_min) / (255 - white_threshold), 0, 1)
    arr[..., 3] *= fade
    arr[..., 3] = np.clip(arr[..., 3], 0, 255)
    return Image.fromarray(arr.astype(np.uint8), mode="RGBA")


def is_monochromatic(img: Image.Image, alpha_threshold: int = 64) -> bool:
    arr = np.array(img.convert("RGBA"))
    alpha = arr[..., 3]
    mask = alpha > alpha_threshold
    if mask.sum() < 10:
        return False
    rgb = arr[mask][:, :3].astype(np.float32)
    stdev = rgb.std(axis=1)
    return float(stdev.mean()) < 20


def set_rgb(img: Image.Image, r: int, g: int, b: int) -> Image.Image:
    arr = np.array(img.convert("RGBA"))
    arr[..., 0] = r
    arr[..., 1] = g
    arr[..., 2] = b
    return Image.fromarray(arr, mode="RGBA")


for src in sorted(SRC.glob("*.png")):
    name = src.stem
    img = Image.open(src).convert("RGBA")
    cleaned = cleanup_white_opaque(img, white_threshold=235)

    cleaned.save(OUT_LIGHT / f"{name}.png", "PNG", optimize=True)

    mono = is_monochromatic(cleaned)
    if mono:
        dark = set_rgb(cleaned, 255, 255, 255)
    else:
        dark = cleaned
    dark.save(OUT_DARK / f"{name}.png", "PNG", optimize=True)

    print(f"  {name:12s}  mono={mono}")
