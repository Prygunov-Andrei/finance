from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from kanban_rules.models import Rule
from kanban_rules.serializers import RuleSerializer
from kanban_service.permissions import RolePermission


class RuleViewSet(viewsets.ModelViewSet):
    queryset = Rule.objects.select_related('board').all()
    serializer_class = RuleSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), RolePermission('kanban_admin')]
        return super().get_permissions()

