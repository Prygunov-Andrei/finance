from rest_framework import viewsets, filters, permissions
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Correspondence
from .serializers import CorrespondenceSerializer, CorrespondenceListSerializer

@extend_schema_view(
    list=extend_schema(summary='Список корреспонденции', tags=['Коммуникации']),
    retrieve=extend_schema(summary='Детали письма', tags=['Коммуникации']),
    create=extend_schema(summary='Создать письмо', tags=['Коммуникации']),
    update=extend_schema(summary='Обновить письмо', tags=['Коммуникации']),
    partial_update=extend_schema(summary='Частично обновить письмо', tags=['Коммуникации']),
    destroy=extend_schema(summary='Удалить письмо', tags=['Коммуникации']),
)
class CorrespondenceViewSet(viewsets.ModelViewSet):
    queryset = Correspondence.objects.select_related('contract', 'counterparty').all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['type', 'category', 'status', 'contract', 'counterparty']
    search_fields = ['number', 'subject', 'description', 'counterparty__name', 'contract__number']
    ordering_fields = ['date', 'created_at']
    ordering = ['-date', '-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return CorrespondenceListSerializer
        return CorrespondenceSerializer
