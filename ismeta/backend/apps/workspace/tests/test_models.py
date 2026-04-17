"""Тесты моделей Workspace и WorkspaceMember."""

import uuid

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from apps.workspace.models import MemberRole, Workspace, WorkspaceMember

User = get_user_model()


@pytest.mark.django_db
class TestWorkspace:
    def test_create_workspace(self):
        """Создание workspace с UUID — базовый smoke."""
        ws = Workspace.objects.create(
            name="Август Климат",
            slug="avgust-klimat",
        )
        assert isinstance(ws.id, uuid.UUID)
        assert ws.name == "Август Климат"
        assert ws.slug == "avgust-klimat"
        assert ws.is_active is True
        assert ws.settings == {}
        assert ws.created_at is not None

    def test_create_workspace_with_settings(self):
        """Settings сохраняются как JSONB и валидируются Pydantic."""
        ws = Workspace(
            name="Тест",
            slug="test-settings",
            settings={"default_material_markup_percent": 25},
        )
        ws.full_clean()
        ws.save()
        s = ws.get_settings()
        assert s.default_material_markup_percent == 25
        assert s.default_work_markup_percent == 300  # default

    def test_workspace_slug_unique(self):
        """Slug уникален."""
        Workspace.objects.create(name="A", slug="unique-slug")
        with pytest.raises(IntegrityError):
            Workspace.objects.create(name="B", slug="unique-slug")


@pytest.mark.django_db
class TestWorkspaceMember:
    @pytest.fixture()
    def workspace(self):
        return Workspace.objects.create(name="WS", slug="ws-member-test")

    @pytest.fixture()
    def user(self):
        return User.objects.create_user(
            username="testuser",
            password="testpass123",
        )

    def test_create_member(self, workspace, user):
        """Создание члена workspace."""
        member = WorkspaceMember.objects.create(
            workspace=workspace,
            user=user,
            role=MemberRole.ADMIN,
        )
        assert isinstance(member.id, uuid.UUID)
        assert member.workspace == workspace
        assert member.role == MemberRole.ADMIN

    def test_workspace_member_unique(self, workspace, user):
        """Нельзя добавить user дважды в один workspace."""
        WorkspaceMember.objects.create(
            workspace=workspace,
            user=user,
            role=MemberRole.ESTIMATOR,
        )
        with pytest.raises(IntegrityError):
            WorkspaceMember.objects.create(
                workspace=workspace,
                user=user,
                role=MemberRole.VIEWER,
            )
