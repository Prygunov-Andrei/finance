from rest_framework import serializers

from kanban_core.models import Board, Column, Card, CardEvent, Attachment
from kanban_files.models import FileObject


class ColumnSerializer(serializers.ModelSerializer):
    class Meta:
        model = Column
        fields = ['id', 'board', 'key', 'title', 'order', 'wip_limit', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def update(self, instance, validated_data):
        if 'key' in validated_data and validated_data['key'] != instance.key:
            raise serializers.ValidationError({'key': 'Column.key is immutable'})
        return super().update(instance, validated_data)


class BoardSerializer(serializers.ModelSerializer):
    columns = ColumnSerializer(many=True, read_only=True)

    class Meta:
        model = Board
        fields = ['id', 'key', 'title', 'is_active', 'columns', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class CardSerializer(serializers.ModelSerializer):
    column_key = serializers.CharField(source='column.key', read_only=True)
    board_key = serializers.CharField(source='board.key', read_only=True)

    class Meta:
        model = Card
        fields = [
            'id', 'board', 'board_key', 'column', 'column_key',
            'type', 'title', 'description', 'meta',
            'due_date', 'assignee_user_id', 'assignee_username',
            'created_by_user_id', 'created_by_username',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'created_by_user_id', 'created_by_username', 'created_at', 'updated_at',
            'board_key', 'column_key',
        ]


class CardMoveSerializer(serializers.Serializer):
    to_column_key = serializers.CharField()


class CardEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = CardEvent
        fields = ['id', 'card', 'event_type', 'data', 'actor_user_id', 'actor_username', 'created_at']
        read_only_fields = fields


class AttachmentSerializer(serializers.ModelSerializer):
    file_sha256 = serializers.CharField(source='file.sha256', read_only=True)
    file_mime_type = serializers.CharField(source='file.mime_type', read_only=True)
    file_original_filename = serializers.CharField(source='file.original_filename', read_only=True)

    class Meta:
        model = Attachment
        fields = [
            'id', 'card', 'file',
            'file_sha256', 'file_mime_type', 'file_original_filename',
            'invoice_ref_id', 'delivery_batch_id',
            'kind', 'document_type', 'title', 'meta',
            'created_by_user_id', 'created_by_username', 'created_at',
        ]
        read_only_fields = ['id', 'created_by_user_id', 'created_by_username', 'created_at']


class AttachmentCreateSerializer(serializers.Serializer):
    file_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=Attachment.Kind.choices, required=False, default=Attachment.Kind.DOCUMENT)
    document_type = serializers.CharField(required=False, allow_blank=True, default='')
    title = serializers.CharField(required=False, allow_blank=True, default='')
    meta = serializers.JSONField(required=False, default=dict)


class AttachmentRelinkSerializer(serializers.Serializer):
    invoice_ref_id = serializers.UUIDField(required=False, allow_null=True)
    delivery_batch_id = serializers.UUIDField(required=False, allow_null=True)

    def validate_file_id(self, value):
        if not FileObject.objects.filter(id=value, status=FileObject.Status.READY).exists():
            raise serializers.ValidationError('file not found or not ready')
        return value

