"""LLMProfile — конфигурация LLM провайдера для recognition (E18-2).

Глобальные (без workspace-scope) — один профиль виден всем пользователям ismeta.
api_key хранится зашифрованным через Fernet (см. encryption.py); при чтении
get_api_key() расшифровывает в memory только на момент proxy-call в recognition.

Ровно один профиль может иметь is_default=True; обеспечивается partial unique
index (Postgres) — два профиля с is_default=True вызовут IntegrityError на save.
Атомарное переключение дефолта — через ViewSet.set_default action.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models

from .encryption import decrypt_value, encrypt_value


class LLMProfile(models.Model):
    name = models.CharField(max_length=100, unique=True)
    base_url = models.URLField(default="https://api.openai.com")
    api_key_encrypted = models.BinaryField()
    extract_model = models.CharField(max_length=100)
    multimodal_model = models.CharField(max_length=100, blank=True, default="")
    classify_model = models.CharField(max_length=100, blank=True, default="")
    vision_supported = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_llm_profiles",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "llm_profile"
        ordering = ["-is_default", "name"]
        constraints = [
            # Гарантия что is_default=True единственный (Postgres partial unique).
            # Пытаемся через set_default action всегда; этот constraint —
            # safety-net на случай прямой записи.
            models.UniqueConstraint(
                fields=["is_default"],
                condition=models.Q(is_default=True),
                name="uniq_llm_profile_default",
            )
        ]

    def __str__(self) -> str:
        marker = " *" if self.is_default else ""
        return f"{self.name}{marker}"

    # ------------------------------------------------------------------
    # API key (encrypted at rest)
    # ------------------------------------------------------------------

    def get_api_key(self) -> str:
        """Расшифровать api_key. Только для proxy-вызовов на recognition.

        Бросает ImproperlyConfigured если LLM_PROFILE_ENCRYPTION_KEY не задан
        или token не расшифровывается (key rotation без re-encrypt).
        """
        return decrypt_value(self.api_key_encrypted)

    def set_api_key(self, plain: str) -> None:
        """Зашифровать и положить в api_key_encrypted (без save())."""
        self.api_key_encrypted = encrypt_value(plain)


class ImportLog(models.Model):
    """История import'ов в смету (E18-2).

    Создаётся после успешного recognition response: sync flow — сразу после
    apply_parsed_items; async flow — в _finalize_finished callback handler.

    Источник истины для UI «модель + цена» (см. specs/16-llm-profiles.md §3):
    - profile.name → название модели в badge
    - cost_usd → стоимость в alert/banner
    - llm_metadata → полная разбивка для popover (tokens, calls)
    """

    estimate = models.ForeignKey(
        "estimate.Estimate",
        on_delete=models.CASCADE,
        related_name="import_logs",
    )
    file_type = models.CharField(max_length=20, default="pdf")
    file_name = models.CharField(max_length=255, blank=True, default="")
    profile = models.ForeignKey(
        LLMProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="import_logs",
    )
    cost_usd = models.DecimalField(
        max_digits=10, decimal_places=6, null=True, blank=True
    )
    items_created = models.IntegerField(default=0)
    pages_processed = models.IntegerField(null=True, blank=True)
    llm_metadata = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "llm_import_log"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["estimate", "-created_at"], name="idx_implog_est_created"),
        ]
