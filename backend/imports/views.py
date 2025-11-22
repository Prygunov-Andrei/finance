from rest_framework import viewsets, filters, permissions
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema_view, extend_schema
from .models import ImportLog
from .serializers import ImportLogSerializer, ImportLogListSerializer


@extend_schema_view(
    list=extend_schema(
        summary='Список импортов',
        description='Получить список всех импортов данных с возможностью фильтрации',
        tags=['Импорты'],
    ),
    retrieve=extend_schema(
        summary='Детали импорта',
        description='Получить подробную информацию об импорте, включая статистику и ошибки',
        tags=['Импорты'],
    ),
)
class ImportLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet для просмотра журнала импортов (только чтение)
    
    list: Получить список импортов
    retrieve: Получить детали импорта
    """
    queryset = ImportLog.objects.select_related('user').all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'file_type', 'user']
    search_fields = ['file_name', 'import_batch_id', 'file_path']
    ordering_fields = ['import_date', 'created_at']
    ordering = ['-import_date', '-created_at']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ImportLogListSerializer
        return ImportLogSerializer
