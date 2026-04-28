"""Unit-тесты LLMProfile модели и encryption (E18-2)."""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet
from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError, transaction

from apps.llm_profiles.encryption import decrypt_value, encrypt_value
from apps.llm_profiles.models import LLMProfile

# Фиксированный ключ для тестов — детерминированный, не из env. settings.py
# берёт LLM_PROFILE_ENCRYPTION_KEY из config(), pytest-django копирует
# settings из ismeta.settings; для override используем django_settings.

TEST_FERNET_KEY = Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def _set_fernet_key(settings):
    settings.LLM_PROFILE_ENCRYPTION_KEY = TEST_FERNET_KEY


@pytest.mark.django_db
def test_encrypt_decrypt_roundtrip():
    plain = "sk-test-secret-12345"
    token = encrypt_value(plain)
    assert isinstance(token, bytes)
    assert plain.encode() not in token  # plain text не в ciphertext
    assert decrypt_value(token) == plain


@pytest.mark.django_db
def test_encrypt_without_key_raises(settings):
    settings.LLM_PROFILE_ENCRYPTION_KEY = ""
    with pytest.raises(ImproperlyConfigured):
        encrypt_value("anything")


@pytest.mark.django_db
def test_decrypt_with_wrong_key_raises(settings):
    plain = "sk-foo"
    token = encrypt_value(plain)
    # Сменили ключ — token должен быть нечитаем.
    settings.LLM_PROFILE_ENCRYPTION_KEY = Fernet.generate_key().decode()
    with pytest.raises(ImproperlyConfigured):
        decrypt_value(token)


@pytest.mark.django_db
def test_set_get_api_key():
    p = LLMProfile(
        name="Test OpenAI",
        base_url="https://api.openai.com",
        extract_model="gpt-4o-mini",
    )
    p.set_api_key("sk-secret-abcd")
    p.save()
    p.refresh_from_db()
    # api_key_encrypted в БД — не plain text
    assert isinstance(bytes(p.api_key_encrypted), bytes)
    assert b"sk-secret-abcd" not in bytes(p.api_key_encrypted)
    # get_api_key возвращает оригинал
    assert p.get_api_key() == "sk-secret-abcd"


@pytest.mark.django_db
def test_unique_default_constraint():
    """Postgres partial unique index не даёт двум профилям быть default
    одновременно (без atomic set_default action)."""
    p1 = LLMProfile(
        name="A",
        base_url="https://a.com",
        extract_model="m",
        is_default=True,
    )
    p1.set_api_key("k1")
    p1.save()

    p2 = LLMProfile(
        name="B",
        base_url="https://b.com",
        extract_model="m",
        is_default=True,
    )
    p2.set_api_key("k2")
    with pytest.raises(IntegrityError), transaction.atomic():
        p2.save()


@pytest.mark.django_db
def test_unique_name():
    p1 = LLMProfile(name="dup", base_url="https://a.com", extract_model="m")
    p1.set_api_key("k1")
    p1.save()

    p2 = LLMProfile(name="dup", base_url="https://b.com", extract_model="m")
    p2.set_api_key("k2")
    with pytest.raises(IntegrityError), transaction.atomic():
        p2.save()
