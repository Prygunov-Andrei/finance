"""
Шифрование банковских секретов с использованием Fernet (AES-128-CBC).

Ключ шифрования хранится в переменной окружения BANK_ENCRYPTION_KEY,
отдельно от Django SECRET_KEY, чтобы ротация SECRET_KEY не затрагивала
зашифрованные банковские данные.
"""

import base64
import logging
import os

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FERNET_INSTANCE = None


def _get_fernet() -> Fernet:
    """Возвращает (кэшированный) экземпляр Fernet."""
    global _FERNET_INSTANCE
    if _FERNET_INSTANCE is not None:
        return _FERNET_INSTANCE

    key = getattr(settings, 'BANK_ENCRYPTION_KEY', None) or os.environ.get('BANK_ENCRYPTION_KEY', '')
    if not key:
        raise RuntimeError(
            'BANK_ENCRYPTION_KEY не задан. '
            'Сгенерируйте ключ командой: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" '
            'и добавьте его в .env'
        )
    try:
        _FERNET_INSTANCE = Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as exc:
        raise RuntimeError(f'Некорректный BANK_ENCRYPTION_KEY: {exc}') from exc
    return _FERNET_INSTANCE


def encrypt_value(plaintext: str) -> str:
    """Шифрует строку и возвращает base64-encoded ciphertext."""
    if not plaintext:
        return ''
    f = _get_fernet()
    return f.encrypt(plaintext.encode('utf-8')).decode('utf-8')


def decrypt_value(ciphertext: str) -> str:
    """Дешифрует base64-encoded ciphertext и возвращает plaintext."""
    if not ciphertext:
        return ''
    f = _get_fernet()
    try:
        return f.decrypt(ciphertext.encode('utf-8')).decode('utf-8')
    except InvalidToken:
        logger.error('Не удалось расшифровать значение — возможно, ключ был изменён.')
        return ''


# ---------------------------------------------------------------------------
# Custom Django model fields
# ---------------------------------------------------------------------------

class EncryptedCharField(models.CharField):
    """
    CharField, значение которого шифруется при записи в БД
    и дешифруется при чтении.

    В БД хранится зашифрованный текст (base64), поэтому max_length
    должен быть достаточным для ciphertext (~= len(plaintext) * 2 + 100).
    """

    def __init__(self, *args, **kwargs):
        # Увеличиваем max_length для хранения ciphertext
        kwargs.setdefault('max_length', 500)
        super().__init__(*args, **kwargs)

    def get_prep_value(self, value):
        """Шифруем перед записью в БД."""
        value = super().get_prep_value(value)
        if value is None or value == '':
            return value
        return encrypt_value(value)

    def from_db_value(self, value, expression, connection):
        """Дешифруем при чтении из БД."""
        if value is None or value == '':
            return value
        return decrypt_value(value)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        # Убираем дефолтный max_length чтобы миграции были чистыми
        if kwargs.get('max_length') == 500:
            del kwargs['max_length']
        return name, path, args, kwargs


class EncryptedTextField(models.TextField):
    """
    TextField, значение которого шифруется при записи в БД
    и дешифруется при чтении.
    """

    def get_prep_value(self, value):
        """Шифруем перед записью в БД."""
        value = super().get_prep_value(value)
        if value is None or value == '':
            return value
        return encrypt_value(value)

    def from_db_value(self, value, expression, connection):
        """Дешифруем при чтении из БД."""
        if value is None or value == '':
            return value
        return decrypt_value(value)
