from rest_framework import viewsets, filters, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Contract
from .serializers import ContractSerializer, ContractListSerializer


@extend_schema_view(
    list=extend_schema(
        summary='Список договоров',
        description='Получить список всех договоров с возможностью фильтрации и поиска',
        tags=['Договоры'],
    ),
    retrieve=extend_schema(
        summary='Детали договора',
        description='Получить подробную информацию о договоре',
        tags=['Договоры'],
    ),
    create=extend_schema(
        summary='Создать договор',
        description='Создать новый договор для объекта',
        tags=['Договоры'],
    ),
    update=extend_schema(
        summary='Обновить договор',
        description='Полностью обновить информацию о договоре',
        tags=['Договоры'],
    ),
    partial_update=extend_schema(
        summary='Частично обновить договор',
        description='Частично обновить информацию о договоре',
        tags=['Договоры'],
    ),
    destroy=extend_schema(
        summary='Удалить договор',
        description='Удалить договор (внимание: также удалятся все связанные платежи)',
        tags=['Договоры'],
    ),
)
class ContractViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления договорами
    
    list: Получить список договоров
    retrieve: Получить детали договора
    create: Создать новый договор
    update: Обновить договор
    partial_update: Частично обновить договор
    destroy: Удалить договор
    cash_flow: Получить cash-flow для договора
    """
    queryset = Contract.objects.select_related('object').all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['object', 'status', 'currency']
    search_fields = ['number', 'name', 'contractor', 'object__name']
    ordering_fields = ['contract_date', 'total_amount', 'created_at']
    ordering = ['-contract_date', '-created_at']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ContractListSerializer
        return ContractSerializer
    
    @extend_schema(
        summary='Cash-flow договора',
        description='Рассчитать cash-flow (поступления - расходы) для договора за указанный период',
        tags=['Договоры'],
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
        """Получить cash-flow для договора"""
        from datetime import date
        
        contract = self.get_object()
        start_date = request.query_params.get('start_date', None)
        end_date = request.query_params.get('end_date', None)
        
        # Преобразуем строки в date объекты
        if start_date:
            start_date = date.fromisoformat(start_date)
        if end_date:
            end_date = date.fromisoformat(end_date)
        
        result = contract.get_cash_flow(start_date=start_date, end_date=end_date)
        
        return Response({
            'contract_id': contract.id,
            'contract_number': contract.number,
            'contract_name': contract.name,
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None,
            **{k: str(v) for k, v in result.items()}
        })
    
    @extend_schema(
        summary='Cash-flow по периодам',
        description='Получить cash-flow договора с разбивкой по периодам (месяц/неделя/день)',
        tags=['Договоры'],
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
        
        contract = self.get_object()
        period_type = request.query_params.get('period_type', 'month')
        start_date = request.query_params.get('start_date', None)
        end_date = request.query_params.get('end_date', None)
        
        # Преобразуем строки в date объекты
        if start_date:
            start_date = date.fromisoformat(start_date)
        if end_date:
            end_date = date.fromisoformat(end_date)
        
        periods = contract.get_cash_flow_by_periods(
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
            'contract_id': contract.id,
            'contract_number': contract.number,
            'contract_name': contract.name,
            'period_type': period_type,
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None,
            'periods': result
        })
