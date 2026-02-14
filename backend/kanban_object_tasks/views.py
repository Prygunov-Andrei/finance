from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from kanban_object_tasks.models import ObjectTask
from kanban_object_tasks.serializers import ObjectTaskSerializer
from kanban_service.permissions import RolePermission


class ObjectTaskViewSet(viewsets.ModelViewSet):
    queryset = ObjectTask.objects.select_related('card', 'card__board', 'card__column').all()
    serializer_class = ObjectTaskSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), RolePermission.required('object_tasks')]
        return super().get_permissions()

