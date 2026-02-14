from rest_framework import serializers

from kanban_rules.models import Rule


class RuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rule
        fields = [
            'id', 'board', 'is_active', 'event_type', 'title',
            'conditions', 'actions', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

