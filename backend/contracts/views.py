from rest_framework import viewsets, filters, permissions
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from core.mixins import CashFlowMixin
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
    cash_flow=extend_schema(
        summary='Cash-flow договора',
        description='Рассчитать cash-flow (поступления - расходы) для договора за указанный период',
        tags=['Договоры'],
    ),
    cash_flow_periods=extend_schema(
        summary='Cash-flow по периодам',
        description='Получить cash-flow договора с разбивкой по периодам (месяц/неделя/день)',
        tags=['Договоры'],
    ),
)
class ContractViewSet(CashFlowMixin, viewsets.ModelViewSet):
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
    
    def get_cash_flow_params(self):
        """Возвращает параметры для расчёта cash-flow договора"""
        contract = self.get_object()
        return {
            'entity_id': contract.id,
            'entity_name': f"{contract.number} — {contract.name}",
            'entity_id_key': 'contract_id',
            'entity_name_key': 'contract_name',
        }
