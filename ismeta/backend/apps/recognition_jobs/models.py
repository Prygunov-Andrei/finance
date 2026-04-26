"""RecognitionJob — фоновая задача распознавания PDF (E19-2).

Жизненный цикл:
1. import_pdf endpoint создаёт RecognitionJob со статусом `queued` + сырыми
   байтами PDF в `file_blob`.
2. Worker (apps.recognition_jobs.worker) забирает job через
   select_for_update(skip_locked) → переводит в `running` → POST'ит на
   recognition `/v1/parse/spec/async` с callback URL.
3. Recognition шлёт callbacks `started` / `page_done` / `finished` / `failed`
   / `cancelled` на наш callback endpoint, который обновляет поля и в
   `finished` создаёт `EstimateItem`'ы.

E18 (LLM-профили) ещё не сделан — `profile_id` сейчас IntegerField без FK.
После E18-2 будет миграция: `profile_id` → ForeignKey(LLMProfile, SET_NULL).
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class RecognitionJob(models.Model):
    STATUS_QUEUED = "queued"
    STATUS_RUNNING = "running"
    STATUS_DONE = "done"
    STATUS_FAILED = "failed"
    STATUS_CANCELLED = "cancelled"

    STATUS_CHOICES = [
        (STATUS_QUEUED, "В очереди"),
        (STATUS_RUNNING, "В работе"),
        (STATUS_DONE, "Готово"),
        (STATUS_FAILED, "Ошибка"),
        (STATUS_CANCELLED, "Отменено"),
    ]

    ACTIVE_STATUSES = (STATUS_QUEUED, STATUS_RUNNING)
    TERMINAL_STATUSES = (STATUS_DONE, STATUS_FAILED, STATUS_CANCELLED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    estimate = models.ForeignKey(
        "estimate.Estimate",
        on_delete=models.CASCADE,
        related_name="recognition_jobs",
    )
    workspace = models.ForeignKey(
        "workspace.Workspace",
        on_delete=models.CASCADE,
        related_name="recognition_jobs",
    )
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=20, default="pdf")
    file_blob = models.BinaryField()

    # E18 (LLM-профили) ещё не запущен — пока IntegerField без FK constraint.
    # После E18-2 будет миграция → ForeignKey(LLMProfile, SET_NULL).
    profile_id = models.IntegerField(null=True, blank=True)

    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_QUEUED
    )
    pages_total = models.IntegerField(null=True, blank=True)
    pages_done = models.IntegerField(default=0)
    items_count = models.IntegerField(default=0)
    items = models.JSONField(default=list, blank=True)
    pages_summary = models.JSONField(default=list, blank=True)
    llm_costs = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default="")

    # Shared-secret для аутентификации callback'ов от recognition. Передаём
    # как X-Callback-Token при создании job'а; на handler'е сравниваем
    # constant-time. 32 байта urlsafe → 43 ASCII chars; берём с запасом.
    cancellation_token = models.CharField(max_length=64, default="")

    # Результат apply_parsed_items: id созданных EstimateItem'ов / sections.
    apply_result = models.JSONField(default=dict, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["created_by", "created_at"]),
            models.Index(fields=["estimate", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"RecognitionJob[{self.id}] {self.status} {self.file_name}"

    @property
    def is_active(self) -> bool:
        return self.status in self.ACTIVE_STATUSES

    @property
    def is_terminal(self) -> bool:
        return self.status in self.TERMINAL_STATUSES

    @property
    def duration_seconds(self) -> int | None:
        if self.started_at and self.completed_at:
            return int((self.completed_at - self.started_at).total_seconds())
        return None
