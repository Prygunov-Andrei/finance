"""LLMProfile + ImportLog ViewSets (E18-2).

URL: /api/v1/llm-profiles/, /api/v1/import-logs/.
"""

from __future__ import annotations

import logging

import httpx
from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import CursorPagination
from rest_framework.request import Request
from rest_framework.response import Response

from .models import ImportLog, LLMProfile
from .serializers import ImportLogSerializer, LLMProfileSerializer

logger = logging.getLogger(__name__)


class LLMProfileViewSet(viewsets.ModelViewSet):
    """CRUD для LLMProfile.

    Permission_classes намеренно НЕ переопределены — берём global из
    settings.REST_FRAMEWORK (IsAuthenticated в prod, AllowAny в DEV через
    ISMETA_AUTH_DISABLED=true). Профили в MVP — глобальные (без workspace
    scope), workspace filter через DjangoFilterBackend не применяется
    потому что у LLMProfile нет workspace FK.
    """

    serializer_class = LLMProfileSerializer
    queryset = LLMProfile.objects.all().order_by("-is_default", "name")
    # Workspace filter не нужен — профили глобальные. Отключаем явно
    # чтобы DEFAULT_FILTER_BACKENDS=WorkspaceFilterBackend не пытался
    # фильтровать.
    filter_backends: list = []
    pagination_class = None  # MVP: профилей мало (≤10), pagination не нужен

    def perform_create(self, serializer: LLMProfileSerializer) -> None:
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(created_by=user)

    def destroy(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        if instance.is_default:
            return Response(
                {"detail": "Сначала переустановите default на другой профиль"},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="set-default")
    def set_default(self, request: Request, pk: str | None = None) -> Response:
        """Атомарно: сбросить is_default у всех + установить у этого."""
        with transaction.atomic():
            LLMProfile.objects.filter(is_default=True).exclude(pk=pk).update(
                is_default=False
            )
            profile = self.get_object()
            if not profile.is_default:
                profile.is_default = True
                profile.save(update_fields=["is_default", "updated_at"])
        return Response({"id": profile.id, "is_default": True})

    @action(detail=False, methods=["get"], url_path="default")
    def default(self, request: Request) -> Response:
        profile = LLMProfile.objects.filter(is_default=True).first()
        if not profile:
            return Response(
                {"detail": "Default profile not configured"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(LLMProfileSerializer(profile).data)

    @action(detail=False, methods=["post"], url_path="test-connection")
    def test_connection(self, request: Request) -> Response:
        """Проверить connectivity к base_url + api_key.

        Body: {"base_url": "...", "api_key": "..."}.
        Делает GET base_url/v1/models с Bearer auth (OpenAI-compat).

        Контракт frontend: LLMProfileTestResult = {ok, status_code?, models?, error?}.
        Сетевые ошибки/таймауты возвращаются как 200 + {ok: false, error: "..."}
        чтобы UI показал понятный message без HTTP-error toast.
        """
        base = (request.data.get("base_url") or "").rstrip("/")
        key = request.data.get("api_key") or ""
        if not base or not key:
            return Response(
                {"ok": False, "error": "base_url и api_key обязательны"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        url = f"{base}/v1/models"
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(url, headers={"Authorization": f"Bearer {key}"})
        except httpx.HTTPError as exc:
            logger.info(
                "llm_profiles test_connection transport error",
                extra={"base_url": base, "error": str(exc)[:200]},
            )
            return Response({"ok": False, "error": f"Соединение не установлено: {exc}"})

        models: list[str] = []
        if resp.status_code == 200:
            try:
                payload = resp.json()
                # OpenAI-compat: {"data": [{"id": "gpt-4o", ...}, ...]}
                if isinstance(payload, dict):
                    data = payload.get("data") or []
                    if isinstance(data, list):
                        models = [
                            m.get("id", "") for m in data if isinstance(m, dict)
                        ][:50]
            except ValueError:
                pass

        return Response(
            {
                "ok": resp.status_code == 200,
                "status_code": resp.status_code,
                "models": models or None,
                "error": None
                if resp.status_code == 200
                else f"HTTP {resp.status_code}: {resp.text[:200]}",
            }
        )


class ImportLogCursorPagination(CursorPagination):
    ordering = "-created_at"
    page_size = 100


class ImportLogViewSet(viewsets.ReadOnlyModelViewSet):
    """История import'ов. Read-only; запись — из flow import-pdf."""

    serializer_class = ImportLogSerializer
    queryset = ImportLog.objects.select_related("estimate", "profile", "created_by")
    pagination_class = ImportLogCursorPagination
    filter_backends: list = []  # workspace filter через estimate filter ниже

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        estimate_id = self.request.query_params.get("estimate_id")
        if estimate_id:
            queryset = queryset.filter(estimate_id=estimate_id)
        # Workspace filter: ImportLog не имеет своего workspace, но через
        # estimate FK можно ограничить. Если X-Workspace-Id передан — фильтруем.
        ws_id = self.request.headers.get("X-Workspace-Id") or self.request.query_params.get(
            "workspace_id"
        )
        if ws_id:
            queryset = queryset.filter(estimate__workspace_id=ws_id)
        return queryset
