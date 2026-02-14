from rest_framework import serializers

from kanban_object_tasks.models import ObjectTask
from kanban_core.models import Card


class ObjectTaskSerializer(serializers.ModelSerializer):
    card = serializers.PrimaryKeyRelatedField(queryset=Card.objects.all())

    class Meta:
        model = ObjectTask
        fields = ['id', 'card', 'erp_object_id', 'priority', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

