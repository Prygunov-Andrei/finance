from rest_framework import viewsets, filters, permissions
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count
from drf_spectacular.utils import extend_schema, extend_schema_view
from core.mixins import CashFlowMixin
from .models import Object
from .serializers import ObjectSerializer, ObjectListSerializer


@extend_schema_view(
    list=extend_schema(
        summary='Список объектов',
        description='Получить список всех строительных объектов с возможностью фильтрации и поиска',
        tags=['Объекты'],
    ),
    retrieve=extend_schema(
        summary='Детали объекта',
        description='Получить подробную информацию об объекте',
        tags=['Объекты'],
    ),
    create=extend_schema(
        summary='Создать объект',
        description='Создать новый строительный объект',
        tags=['Объекты'],
    ),
    update=extend_schema(
        summary='Обновить объект',
        description='Полностью обновить информацию об объекте',
        tags=['Объекты'],
    ),
    partial_update=extend_schema(
        summary='Частично обновить объект',
        description='Частично обновить информацию об объекте',
        tags=['Объекты'],
    ),
    destroy=extend_schema(
        summary='Удалить объект',
        description='Удалить объект (внимание: также удалятся все связанные договоры)',
        tags=['Объекты'],
    ),
    cash_flow=extend_schema(
        summary='Cash-flow объекта',
        description='Рассчитать cash-flow (поступления - расходы) для объекта за указанный период',
        tags=['Объекты'],
    ),
    cash_flow_periods=extend_schema(
        summary='Cash-flow по периодам',
        description='Получить cash-flow объекта с разбивкой по периодам (месяц/неделя/день)',
        tags=['Объекты'],
    ),
)
class ObjectViewSet(CashFlowMixin, viewsets.ModelViewSet):
    """
    ViewSet для управления объектами
    
    list: Получить список объектов
    retrieve: Получить детали объекта
    create: Создать новый объект
    update: Обновить объект
    partial_update: Частично обновить объект
    destroy: Удалить объект
    cash_flow: Получить cash-flow для объекта
    """
    queryset = Object.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = []
    search_fields = ['name', 'address', 'description']
    ordering_fields = ['name', 'created_at', 'updated_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Оптимизация: добавляем annotate для contracts_count только для list"""
        queryset = Object.objects.all()
        if self.action == 'list':
            queryset = queryset.annotate(contracts_count=Count('contracts'))
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ObjectListSerializer
        return ObjectSerializer
    
    def get_cash_flow_params(self):
        """Возвращает параметры для расчёта cash-flow объекта"""
        obj = self.get_object()
        return {
            'entity_id': obj.id,
            'entity_name': obj.name,
            'entity_id_key': 'object_id',
            'entity_name_key': 'object_name',
        }
