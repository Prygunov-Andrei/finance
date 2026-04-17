"""WorkspaceFilterBackend — обязательная фильтрация queryset по workspace_id.

Каждый ViewSet в ISMeta обязан использовать этот backend (CONCEPT §4.5).
Workspace_id извлекается из заголовка X-Workspace-Id или query param ?workspace_id.
Если ни то, ни другое не передано — 400 Bad Request.
"""

from rest_framework import exceptions, filters


class WorkspaceFilterBackend(filters.BaseFilterBackend):
    """Фильтрация по workspace_id. Без него — 400."""

    HEADER = "HTTP_X_WORKSPACE_ID"
    QUERY_PARAM = "workspace_id"

    def _get_workspace_id(self, request):
        workspace_id = request.META.get(self.HEADER) or request.query_params.get(
            self.QUERY_PARAM
        )
        if not workspace_id:
            raise exceptions.ValidationError(
                {"workspace_id": "Обязательный параметр. Передайте X-Workspace-Id заголовок или ?workspace_id query param."}
            )
        return workspace_id

    def filter_queryset(self, request, queryset, view):
        workspace_id = self._get_workspace_id(request)
        return queryset.filter(workspace_id=workspace_id)
