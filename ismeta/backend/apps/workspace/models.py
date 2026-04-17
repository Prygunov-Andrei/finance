"""Модели multi-tenancy: Workspace + WorkspaceMember (ADR-0003)."""

import uuid

from django.conf import settings
from django.db import models

from .schemas import WorkspaceSettings


class Workspace(models.Model):
    """Изолированный tenant. UUID PK с первого дня (ADR-0003)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=64, unique=True)
    settings = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "workspace"
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.slug})"

    def clean(self) -> None:
        """Валидация JSONB settings через Pydantic (CONTRIBUTING §10.1)."""
        super().clean()
        WorkspaceSettings.model_validate(self.settings)

    def get_settings(self) -> WorkspaceSettings:
        """Типизированный доступ к settings."""
        return WorkspaceSettings.model_validate(self.settings)


class MemberRole(models.TextChoices):
    OWNER = "owner", "Владелец"
    ADMIN = "admin", "Администратор"
    ESTIMATOR = "estimator", "Сметчик"
    VIEWER = "viewer", "Наблюдатель"


class WorkspaceMember(models.Model):
    """Членство пользователя в workspace."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="members",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_memberships",
    )
    role = models.CharField(
        max_length=16,
        choices=MemberRole.choices,
        default=MemberRole.ESTIMATOR,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "workspace_member"
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user"],
                name="uq_workspace_member",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user} @ {self.workspace.slug} ({self.role})"
