"""
Модуль безопасности публичного API.

- Валидация файлов (magic bytes)
- Безопасная распаковка ZIP
- Honeypot-валидация
"""
import logging
import zipfile
import tempfile
from pathlib import Path
from typing import List

from django.core.exceptions import ValidationError

logger = logging.getLogger(__name__)

ALLOWED_MIMES = {
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # .xlsx
    'application/vnd.ms-excel',  # .xls
    'application/zip',
    'application/x-zip-compressed',
    'image/png',
    'image/jpeg',
}

ALLOWED_EXTENSIONS = {'.pdf', '.xlsx', '.xls', '.zip', '.png', '.jpg', '.jpeg'}

MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024  # 500 MB
MAX_FILES_IN_ZIP = 100
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB per file


def validate_file_magic(file_content: bytes, filename: str = '') -> str:
    """Проверка MIME-типа по magic bytes.

    Returns:
        Определённый MIME-тип.

    Raises:
        ValidationError: если тип файла не в белом списке.
    """
    try:
        import magic
        mime = magic.from_buffer(file_content[:2048], mime=True)
    except (ImportError, OSError):
        # libmagic не установлен — fallback на проверку расширения
        logger.warning('libmagic not available, skipping magic bytes validation')
        return 'application/octet-stream'

    if mime not in ALLOWED_MIMES:
        raise ValidationError(
            f'Тип файла "{mime}" не поддерживается. '
            f'Допустимые форматы: PDF, XLSX, XLS, ZIP, PNG, JPG.'
        )
    return mime


def validate_file_extension(filename: str):
    """Проверка расширения файла."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            f'Расширение "{ext}" не поддерживается. '
            f'Допустимые: {", ".join(sorted(ALLOWED_EXTENSIONS))}.'
        )


def validate_file_size(size: int, filename: str = ''):
    """Проверка размера файла."""
    if size > MAX_FILE_SIZE:
        raise ValidationError(
            f'Файл "{filename}" ({size // (1024*1024)} МБ) превышает лимит '
            f'{MAX_FILE_SIZE // (1024*1024)} МБ.'
        )


def safe_extract_zip(zip_content: bytes) -> List[dict]:
    """Безопасная распаковка ZIP с проверкой лимитов.

    Returns:
        Список dict: {'filename': str, 'content': bytes, 'size': int}

    Raises:
        ValidationError: при нарушении лимитов.
    """
    import io

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_content), 'r')
    except zipfile.BadZipFile:
        raise ValidationError('Файл повреждён или не является ZIP-архивом.')

    with zf:
        entries = zf.infolist()

        # Проверка количества файлов
        if len(entries) > MAX_FILES_IN_ZIP:
            raise ValidationError(
                f'ZIP содержит {len(entries)} файлов, '
                f'максимум — {MAX_FILES_IN_ZIP}.'
            )

        # Проверка суммарного размера (по заголовкам)
        total_size = sum(info.file_size for info in entries)
        if total_size > MAX_UNCOMPRESSED_SIZE:
            raise ValidationError(
                f'Размер распакованного архива ({total_size // (1024*1024)} МБ) '
                f'превышает лимит {MAX_UNCOMPRESSED_SIZE // (1024*1024)} МБ.'
            )

        files = []
        for info in entries:
            # Пропускаем директории
            if info.is_dir():
                continue

            # Защита от path traversal
            if info.filename.startswith('/') or '..' in info.filename:
                raise ValidationError(
                    f'Небезопасное имя файла в архиве: {info.filename}'
                )

            # Фильтрация по расширению
            ext = Path(info.filename).suffix.lower()
            if ext not in ALLOWED_EXTENSIONS or ext == '.zip':
                continue  # пропускаем неподдерживаемые и вложенные ZIP

            content = zf.read(info.filename)
            files.append({
                'filename': Path(info.filename).name,
                'content': content,
                'size': len(content),
            })

        return files


def validate_honeypot(value: str) -> None:
    """Проверка honeypot-поля. Бот заполняет скрытое поле → reject."""
    if value:
        raise ValidationError('Bot detected.')
