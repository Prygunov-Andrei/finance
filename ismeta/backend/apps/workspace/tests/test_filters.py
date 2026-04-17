"""Тесты WorkspaceFilterBackend — multi-tenancy isolation."""

import uuid

import pytest
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from rest_framework import serializers, status, viewsets
from rest_framework.test import APIRequestFactory

from apps.workspace.filters import WorkspaceFilterBackend
from apps.workspace.models import MemberRole, Workspace, WorkspaceMember

User = get_user_model()


# Минимальный ViewSet для тестирования фильтра.
# В E4 будет полноценный WorkspaceViewSet — здесь достаточно работать
# с WorkspaceMember, у которой есть workspace_id FK.
class _MemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkspaceMember
        fields = ["id", "workspace", "user", "role"]


class _MemberViewSet(viewsets.ModelViewSet):
    queryset = WorkspaceMember.objects.all()
    serializer_class = _MemberSerializer
    filter_backends = [WorkspaceFilterBackend]
    pagination_class = None  # тестируем фильтрацию, не пагинацию
    authentication_classes = []
    permission_classes = []


@pytest.mark.django_db
class TestMultiTenancyIsolation:
    """Ключевой тест: запрос с workspace_id=A НЕ видит данные workspace_id=B."""

    @pytest.fixture()
    def setup_two_workspaces(self):
        ws_a = Workspace.objects.create(name="WS-A", slug="ws-a")
        ws_b = Workspace.objects.create(name="WS-B", slug="ws-b")
        user_a = User.objects.create_user(username="user-a", password="pass")
        user_b = User.objects.create_user(username="user-b", password="pass")
        WorkspaceMember.objects.create(workspace=ws_a, user=user_a, role=MemberRole.ADMIN)
        WorkspaceMember.objects.create(workspace=ws_b, user=user_b, role=MemberRole.ESTIMATOR)
        return ws_a, ws_b

    def test_multi_tenancy_isolation(self, setup_two_workspaces):
        """Запрос с workspace_id=A возвращает ТОЛЬКО members workspace A."""
        ws_a, ws_b = setup_two_workspaces
        factory = APIRequestFactory()

        # Запрос с workspace_id = ws_a
        request = factory.get("/", HTTP_X_WORKSPACE_ID=str(ws_a.id))
        view = _MemberViewSet.as_view({"get": "list"})
        response = view(request)

        assert response.status_code == status.HTTP_200_OK
        ids = {str(m["workspace"]) for m in response.data}
        assert str(ws_a.id) in ids
        assert str(ws_b.id) not in ids

    def test_missing_workspace_id_returns_400(self):
        """Без workspace_id — 400 Bad Request."""
        factory = APIRequestFactory()
        request = factory.get("/")
        view = _MemberViewSet.as_view({"get": "list"})
        response = view(request)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
