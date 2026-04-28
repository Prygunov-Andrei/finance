"""Fernet-симметричное шифрование api_key для LLMProfile (E18-2).

Ключ — `LLM_PROFILE_ENCRYPTION_KEY` (env var, base64-urlsafe 32 байта). Генерация:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Без ключа миграции применяются (BinaryField создаётся), но любая попытка
encrypt/decrypt бросает ImproperlyConfigured — серверу видно, на этапе CRUD,
а не в момент import-pdf где debug меньше.
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def _fernet() -> Fernet:
    key = getattr(settings, "LLM_PROFILE_ENCRYPTION_KEY", "") or ""
    if not key:
        raise ImproperlyConfigured(
            "LLM_PROFILE_ENCRYPTION_KEY not set; cannot encrypt/decrypt LLM api_keys"
        )
    if isinstance(key, str):
        key = key.encode("utf-8")
    try:
        return Fernet(key)
    except (ValueError, TypeError) as e:
        raise ImproperlyConfigured(
            f"LLM_PROFILE_ENCRYPTION_KEY invalid (must be 32-byte base64-urlsafe): {e}"
        ) from e


def encrypt_value(plain: str) -> bytes:
    return _fernet().encrypt(plain.encode("utf-8"))


def decrypt_value(token: bytes | memoryview) -> str:
    if isinstance(token, memoryview):
        token = bytes(token)
    try:
        return _fernet().decrypt(bytes(token)).decode("utf-8")
    except InvalidToken as e:
        raise ImproperlyConfigured(
            "LLM_PROFILE_ENCRYPTION_KEY mismatch — token cannot be decrypted "
            "with current key (key was rotated?)"
        ) from e
