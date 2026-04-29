"""
Утилиты для нормализации имён загружаемых файлов.

При upload через ImageField/FileField кириллические имена в URL рендерятся
как percent-encoding (`%D0%A1%D0%BD%D0%B8%D0%BC%D0%BE%D0%BA_...`), что
выглядит уродливо в sitemap/og:image и хуже воспринимается некоторыми
индексаторами. Этот модуль транслитерирует кириллицу в латиницу и
нормализует остальное через `slugify`.

Существующие файлы на проде НЕ переименовываются автоматически — миграция
старых имён выполняется отдельной management-командой по запросу.
"""
from __future__ import annotations

import os
from typing import Iterable, Type

from django.db import models
from django.db.models.signals import pre_save
from django.utils.text import slugify

# ГОСТ 7.79-2000 (упрощённый, без диакритики) — кириллица → латиница.
# Применяется до slugify, чтобы получить читаемые имена вместо «голых цифр»
# (Django slugify с allow_unicode=False просто выкидывает кириллицу).
_CYRILLIC_TO_LATIN = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "j", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "eh", "ю": "yu", "я": "ya",
}


def _transliterate(text: str) -> str:
    out = []
    for ch in text:
        lower = ch.lower()
        if lower in _CYRILLIC_TO_LATIN:
            mapped = _CYRILLIC_TO_LATIN[lower]
            out.append(mapped.upper() if ch.isupper() else mapped)
        else:
            out.append(ch)
    return "".join(out)


def slugify_filename(filename: str, fallback: str = "file") -> str:
    """Преобразует имя файла к ASCII-slug, сохраняя расширение.

    >>> slugify_filename("Снимок_17.04.2026_215.53.png")
    'snimok_17-04-2026_215-53.png'
    >>> slugify_filename("Hello World.JPG")
    'hello-world.jpg'
    >>> slugify_filename(".png")
    'file.png'
    """
    base, ext = os.path.splitext(filename)
    base = _transliterate(base)
    safe_base = slugify(base, allow_unicode=False) or fallback
    return f"{safe_base}{ext.lower()}"


def _slugify_field_names(instance, field_names: Iterable[str]) -> None:
    """Применяет slugify_filename ко всем перечисленным FileField/ImageField,
    сохраняя directory часть `upload_to`."""
    for field_name in field_names:
        field = getattr(instance, field_name, None)
        if not field or not getattr(field, "name", ""):
            continue
        dirname, basename = os.path.split(field.name)
        if not basename:
            continue
        new_basename = slugify_filename(basename)
        if new_basename == basename:
            continue
        new_name = os.path.join(dirname, new_basename) if dirname else new_basename
        field.name = new_name


def register_filename_slugify(
    model_class: Type[models.Model], file_fields: list[str]
) -> None:
    """Регистрирует pre_save signal: транслит имени файла перед сохранением.

    Срабатывает только при upload нового файла — `field.name` содержит исходное
    имя из формы. Если файл уже на storage с прежним именем — повторный slugify
    идемпотентен (no-op).
    """
    fields_tuple = tuple(file_fields)

    def _on_pre_save(sender, instance, **kwargs):
        _slugify_field_names(instance, fields_tuple)

    pre_save.connect(
        _on_pre_save,
        sender=model_class,
        weak=False,
        dispatch_uid=f"{model_class.__module__}.{model_class.__name__}_filename_slugify",
    )
