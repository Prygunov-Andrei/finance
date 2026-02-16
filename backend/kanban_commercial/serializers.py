from rest_framework import serializers

from kanban_commercial.models import CommercialCase
from kanban_core.models import Card


class CommercialCaseSerializer(serializers.ModelSerializer):
    card = serializers.PrimaryKeyRelatedField(queryset=Card.objects.all())

    class Meta:
        model = CommercialCase
        fields = [
            'id', 'card', 'erp_object_id', 'erp_object_name',
            'system_name', 'erp_counterparty_id', 'erp_counterparty_name',
            'erp_tkp_ids', 'contacts_info', 'comments',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
