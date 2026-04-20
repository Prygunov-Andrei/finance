"""PDF rendering via PyMuPDF — page → base64 PNG."""

import base64

import fitz

from ..config import settings


def render_page_to_b64(doc: fitz.Document, page_num: int) -> str:
    """Render single PDF page to base64-encoded PNG."""
    page = doc[page_num]
    mat = fitz.Matrix(settings.dpi / 72, settings.dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    png_bytes = pix.tobytes("png")
    return base64.b64encode(png_bytes).decode()
