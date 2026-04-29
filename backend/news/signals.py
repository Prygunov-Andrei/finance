"""Сигналы news: транслит имён загружаемых файлов (Wave 10.3, SEO P2).

Старые кириллические имена файлов на проде не переименовываются — миграция
выполняется отдельной командой по запросу PO.
"""
from __future__ import annotations

from core.file_utils import register_filename_slugify

from .models import MediaUpload, NewsAuthor, NewsMedia

register_filename_slugify(NewsAuthor, ["avatar"])
register_filename_slugify(NewsMedia, ["file"])
register_filename_slugify(MediaUpload, ["file"])
