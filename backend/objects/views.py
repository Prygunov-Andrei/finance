from rest_framework import viewsets, filters, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
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
)
class ObjectViewSet(viewsets.ModelViewSet):
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
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ObjectListSerializer
        return ObjectSerializer
    
    @extend_schema(
        summary='Cash-flow объекта',
        description='Рассчитать cash-flow (поступления - расходы) для объекта за указанный период',
        tags=['Объекты'],
        parameters=[
            {
                'name': 'start_date',
                'in': 'query',
                'description': 'Начало периода (формат: YYYY-MM-DD)',
                'required': False,
                'schema': {'type': 'string', 'format': 'date'},
            },
            {
                'name': 'end_date',
                'in': 'query',
                'description': 'Конец периода (формат: YYYY-MM-DD)',
                'required': False,
                'schema': {'type': 'string', 'format': 'date'},
            },
        ],
    )
    @action(detail=True, methods=['get'])
    def cash_flow(self, request, pk=None):
        """Получить cash-flow для объекта"""
        from datetime import date
        from core.cashflow import CashFlowCalculator
        
        obj = self.get_object()
        start_date = request.query_params.get('start_date', None)
        end_date = request.query_params.get('end_date', None)
        
        # Преобразуем строки в date объекты
        if start_date:
            start_date = date.fromisoformat(start_date)
        if end_date:
            end_date = date.fromisoformat(end_date)
        
        result = obj.get_cash_flow(start_date=start_date, end_date=end_date)
        
        return Response({
            'object_id': obj.id,
            'object_name': obj.name,
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None,
            **{k: str(v) for k, v in result.items()}
        })
    
    @extend_schema(
        summary='Cash-flow по периодам',
        description='Получить cash-flow объекта с разбивкой по периодам (месяц/неделя/день)',
        tags=['Объекты'],
        parameters=[
            {
                'name': 'period_type',
                'in': 'query',
                'description': 'Тип периода: month, week или day',
                'required': False,
                'schema': {'type': 'string', 'enum': ['month', 'week', 'day'], 'default': 'month'},
            },
            {
                'name': 'start_date',
                'in': 'query',
                'description': 'Начало периода (формат: YYYY-MM-DD)',
                'required': False,
                'schema': {'type': 'string', 'format': 'date'},
            },
            {
                'name': 'end_date',
                'in': 'query',
                'description': 'Конец периода (формат: YYYY-MM-DD)',
                'required': False,
                'schema': {'type': 'string', 'format': 'date'},
            },
        ],
    )
    @action(detail=True, methods=['get'])
    def cash_flow_periods(self, request, pk=None):
        """Получить cash-flow с разбивкой по периодам"""
        from datetime import date
        from core.cashflow import CashFlowCalculator
        
        obj = self.get_object()
        period_type = request.query_params.get('period_type', 'month')
        start_date = request.query_params.get('start_date', None)
        end_date = request.query_params.get('end_date', None)
        
        # Преобразуем строки в date объекты
        if start_date:
            start_date = date.fromisoformat(start_date)
        if end_date:
            end_date = date.fromisoformat(end_date)
        
        periods = obj.get_cash_flow_by_periods(
            period_type=period_type,
            start_date=start_date,
            end_date=end_date
        )
        
        # Преобразуем Decimal и date в строки для JSON
        result = []
        for period in periods:
            result.append({
                'period': period['period'].isoformat() if period['period'] else None,
                'income': str(period['income']),
                'expense': str(period['expense']),
                'cash_flow': str(period['cash_flow']),
                'count': period['count'],
            })
        
        return Response({
            'object_id': obj.id,
            'object_name': obj.name,
            'period_type': period_type,
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None,
            'periods': result
        })
