from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from kanban_core.models import Board, Column, Card, CardEvent, Attachment
from kanban_core.serializers import (
    BoardSerializer,
    ColumnSerializer,
    CardSerializer,
    CardMoveSerializer,
    CardEventSerializer,
    AttachmentSerializer,
    AttachmentCreateSerializer,
    AttachmentRelinkSerializer,
)
from kanban_core.services import log_card_event
from kanban_service.permissions import RolePermission
from kanban_files.models import FileObject


class BoardViewSet(viewsets.ModelViewSet):
    queryset = Board.objects.prefetch_related('columns').all()
    serializer_class = BoardSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        key = self.request.query_params.get('key')
        if key:
            qs = qs.filter(key=key)
        return qs

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), RolePermission('kanban_admin')]
        return super().get_permissions()


class ColumnViewSet(viewsets.ModelViewSet):
    queryset = Column.objects.select_related('board').all()
    serializer_class = ColumnSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        board_id = self.request.query_params.get('board_id')
        if board_id:
            qs = qs.filter(board_id=board_id)
        return qs

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), RolePermission('kanban_admin')]
        return super().get_permissions()


class CardViewSet(viewsets.ModelViewSet):
    queryset = (
        Card.objects
        .select_related('board', 'column')
        .prefetch_related('events', 'attachments')
        .all()
    )
    serializer_class = CardSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        board_id = self.request.query_params.get('board_id')
        if board_id:
            qs = qs.filter(board_id=board_id)
        column_id = self.request.query_params.get('column_id')
        if column_id:
            qs = qs.filter(column_id=column_id)
        card_type = self.request.query_params.get('type')
        if card_type:
            qs = qs.filter(type=card_type)
        return qs

    def perform_create(self, serializer):
        card = serializer.save(
            created_by_user_id=getattr(self.request.user, 'user_id', None),
            created_by_username=getattr(self.request.user, 'username', '') or '',
        )
        log_card_event(card, 'card_created', self.request.user, data={'column_key': card.column.key})

    def perform_update(self, serializer):
        card = serializer.save()
        log_card_event(card, 'card_updated', self.request.user, data={})

    @action(detail=True, methods=['post'])
    def move(self, request, pk=None):
        card = self.get_object()
        serializer = CardMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        to_key = serializer.validated_data['to_column_key']

        try:
            to_col = Column.objects.get(board=card.board, key=to_key)
        except Column.DoesNotExist:
            return Response({'error': 'column not found'}, status=status.HTTP_400_BAD_REQUEST)

        from_key = card.column.key
        if from_key == to_key:
            return Response(CardSerializer(card).data)

        with transaction.atomic():
            card.column = to_col
            card.save(update_fields=['column', 'updated_at'])
            log_card_event(card, 'card_moved', request.user, data={'from': from_key, 'to': to_key})

        return Response(CardSerializer(card).data)

    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        card = self.get_object()
        qs = CardEvent.objects.filter(card=card).order_by('created_at')
        return Response(CardEventSerializer(qs, many=True).data)

    @action(detail=True, methods=['get'])
    def attachments(self, request, pk=None):
        card = self.get_object()
        qs = Attachment.objects.filter(card=card).select_related('file').order_by('created_at')
        return Response(AttachmentSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def attach_file(self, request, pk=None):
        card = self.get_object()
        serializer = AttachmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        file_id = serializer.validated_data['file_id']
        file_obj = FileObject.objects.get(id=file_id)

        att = Attachment.objects.create(
            card=card,
            file=file_obj,
            kind=serializer.validated_data.get('kind', Attachment.Kind.DOCUMENT),
            document_type=serializer.validated_data.get('document_type', ''),
            title=serializer.validated_data.get('title', ''),
            meta=serializer.validated_data.get('meta', {}),
            created_by_user_id=getattr(request.user, 'user_id', None),
            created_by_username=getattr(request.user, 'username', '') or '',
        )
        log_card_event(card, 'attachment_added', request.user, data={'attachment_id': str(att.id), 'file_id': str(file_id)})
        return Response(AttachmentSerializer(att).data, status=status.HTTP_201_CREATED)


class AttachmentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Attachment.objects.select_related('card', 'file').all()
    serializer_class = AttachmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        card_id = self.request.query_params.get('card_id')
        if card_id:
            qs = qs.filter(card_id=card_id)
        return qs

    @action(detail=True, methods=['post'])
    def detach(self, request, pk=None):
        att = self.get_object()
        card = att.card
        att_id = str(att.id)
        att.delete()
        log_card_event(card, 'attachment_removed', request.user, data={'attachment_id': att_id})
        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'])
    def relink(self, request, pk=None):
        """
        Перепривязка вложения (V1): к invoice_ref или delivery_batch.
        Сам файл не копируется.
        """
        att = self.get_object()
        serializer = AttachmentRelinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        att.invoice_ref_id = serializer.validated_data.get('invoice_ref_id')
        att.delivery_batch_id = serializer.validated_data.get('delivery_batch_id')
        att.save(update_fields=['invoice_ref_id', 'delivery_batch_id'])
        log_card_event(att.card, 'attachment_relinked', request.user, data={
            'attachment_id': str(att.id),
            'invoice_ref_id': str(att.invoice_ref_id) if att.invoice_ref_id else None,
            'delivery_batch_id': str(att.delivery_batch_id) if att.delivery_batch_id else None,
        })
        return Response(AttachmentSerializer(att).data)

