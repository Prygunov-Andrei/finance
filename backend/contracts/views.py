from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from core.mixins import CashFlowMixin
from .models import Contract, ContractAmendment, WorkScheduleItem, Act, ActPaymentAllocation, FrameworkContract
from .serializers import (
    ContractSerializer, ContractListSerializer, 
    ContractAmendmentSerializer, WorkScheduleItemSerializer, 
    ActSerializer, ActPaymentAllocationSerializer,
    FrameworkContractSerializer, FrameworkContractListSerializer
)
from communications.models import Correspondence
from communications.serializers import CorrespondenceSerializer


@extend_schema_view(
    list=extend_schema(tags=['Договоры']),
    retrieve=extend_schema(tags=['Договоры']),
    create=extend_schema(tags=['Договоры']),
    update=extend_schema(tags=['Договоры']),
    partial_update=extend_schema(tags=['Договоры']),
    destroy=extend_schema(tags=['Договоры']),
    cash_flow=extend_schema(tags=['Договоры']),
    cash_flow_periods=extend_schema(tags=['Договоры']),
    correspondence=extend_schema(tags=['Договоры']),
    schedule=extend_schema(tags=['Договоры']),
    amendments=extend_schema(tags=['Договоры']),
)
class ContractViewSet(CashFlowMixin, viewsets.ModelViewSet):
    """ViewSet для управления договорами"""
    queryset = Contract.objects.select_related('object', 'counterparty', 'legal_entity', 'technical_proposal', 'mounting_proposal').all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['object', 'status', 'currency', 'contract_type', 'legal_entity', 'counterparty', 'framework_contract', 'responsible_manager', 'responsible_engineer']
    search_fields = ['number', 'name', 'counterparty__name', 'object__name']
    ordering_fields = ['contract_date', 'total_amount', 'created_at']
    ordering = ['-contract_date', '-created_at']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ContractListSerializer
        return ContractSerializer
    
    def get_cash_flow_params(self):
        contract = self.get_object()
        return {
            'entity_id': contract.id,
            'entity_name': f"{contract.number} — {contract.name}",
            'entity_id_key': 'contract_id',
            'entity_name_key': 'contract_name',
        }

    @extend_schema(summary='Получить текущий баланс договора')
    @action(detail=True, methods=['get'])
    def balance(self, request, pk=None):
        """Возвращает сальдо расчетов по договору (Акты - Платежи)"""
        contract = self.get_object()
        balance = contract.get_balance()
        return Response({'balance': balance, 'currency': contract.currency})

    @extend_schema(summary='Скачать график работ (PDF)')
    @action(detail=True, methods=['get'], url_path='schedule/export_pdf')
    def export_schedule_pdf(self, request, pk=None):
        """
        Генерация PDF с графиком работ.
        
        Статус: Не реализовано. Планируется использование reportlab.
        """
        return Response(
            {'detail': 'Экспорт PDF графика работ пока не реализован'},
            status=status.HTTP_501_NOT_IMPLEMENTED
        )

    @extend_schema(
        summary='Переписка по договору',
        description='Получить список переписки, связанной с договором',
        tags=['Договоры'],
    )
    @action(detail=True, methods=['get'], url_path='correspondence')
    def correspondence(self, request, pk=None):
        """Возвращает список переписки по договору"""
        contract = self.get_object()
        correspondence = Correspondence.objects.filter(contract=contract).order_by('-date', '-created_at')
        serializer = CorrespondenceSerializer(correspondence, many=True)
        return Response(serializer.data)

    @extend_schema(
        summary='График работ по договору',
        description='Получить график работ (WorkScheduleItem) для договора',
        tags=['Договоры'],
    )
    @action(detail=True, methods=['get'], url_path='schedule')
    def schedule(self, request, pk=None):
        """Возвращает график работ по договору"""
        contract = self.get_object()
        schedule_items = WorkScheduleItem.objects.filter(contract=contract).order_by('start_date')
        serializer = WorkScheduleItemSerializer(schedule_items, many=True)
        return Response(serializer.data)

    @extend_schema(
        summary='Создать доп. соглашение',
        description='Создать дополнительное соглашение к договору',
        tags=['Договоры'],
        request=ContractAmendmentSerializer,
    )
    @action(detail=True, methods=['post'], url_path='amendments')
    def amendments(self, request, pk=None):
        """Создать дополнительное соглашение к договору"""
        contract = self.get_object()
        serializer = ContractAmendmentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(contract=contract)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ContractAmendmentViewSet(viewsets.ModelViewSet):
    """ViewSet для Дополнительных соглашений"""
    queryset = ContractAmendment.objects.all()
    serializer_class = ContractAmendmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['contract']


class WorkScheduleItemViewSet(viewsets.ModelViewSet):
    """ViewSet для Графика работ"""
    queryset = WorkScheduleItem.objects.all()
    serializer_class = WorkScheduleItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['contract', 'status']


class ActViewSet(viewsets.ModelViewSet):
    """ViewSet для Актов выполненных работ"""
    queryset = Act.objects.select_related('contract').prefetch_related('payment_allocations')
    serializer_class = ActSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['contract', 'status']
    search_fields = ['number', 'description']
    
    def get_queryset(self):
        """Добавляем annotate для вычисления unpaid_amount на уровне БД"""
        from django.db.models import Sum
        from django.db.models.functions import Coalesce
        from decimal import Decimal
        
        return super().get_queryset().annotate(
            paid_amount=Coalesce(Sum('payment_allocations__amount'), Decimal('0'))
        )
    
    @extend_schema(summary='Подписать акт')
    @action(detail=True, methods=['post'])
    def sign(self, request, pk=None):
        """Перевод акта в статус 'Подписан'"""
        act = self.get_object()
        if act.status != Act.Status.DRAFT:
            return Response({'detail': 'Акт уже не в черновике'}, status=status.HTTP_400_BAD_REQUEST)
        
        act.status = Act.Status.SIGNED
        act.save()
        return Response({'status': 'signed'})


class ActPaymentAllocationViewSet(viewsets.ReadOnlyModelViewSet):
    """Просмотр распределений оплат по актам"""
    queryset = ActPaymentAllocation.objects.all()
    serializer_class = ActPaymentAllocationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['act', 'payment']


@extend_schema_view(
    list=extend_schema(tags=['Рамочные договоры']),
    retrieve=extend_schema(tags=['Рамочные договоры']),
    create=extend_schema(tags=['Рамочные договоры']),
    update=extend_schema(tags=['Рамочные договоры']),
    partial_update=extend_schema(tags=['Рамочные договоры']),
    destroy=extend_schema(tags=['Рамочные договоры']),
)
class FrameworkContractViewSet(viewsets.ModelViewSet):
    """ViewSet для управления рамочными договорами"""
    queryset = FrameworkContract.objects.select_related('legal_entity', 'counterparty', 'created_by').prefetch_related('price_lists').all()
    serializer_class = FrameworkContractSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['counterparty', 'legal_entity', 'status']
    search_fields = ['number', 'name']
    ordering_fields = ['date', 'valid_from', 'valid_until', 'created_at']
    ordering = ['-date', '-created_at']
    
    def get_queryset(self):
        """Добавляем annotate для list view"""
        from django.db.models import Count
        queryset = super().get_queryset()
        if self.action == 'list':
            queryset = queryset.annotate(contracts_count=Count('contracts'))
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'list':
            return FrameworkContractListSerializer
        return FrameworkContractSerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @extend_schema(summary='Получить список договоров под рамочный')
    @action(detail=True, methods=['get'])
    def contracts(self, request, pk=None):
        """Список договоров под этот рамочный"""
        framework = self.get_object()
        contracts = framework.contracts.all()
        serializer = ContractListSerializer(contracts, many=True)
        return Response(serializer.data)
    
    @extend_schema(summary='Добавить прайс-листы к рамочному договору')
    @action(detail=True, methods=['post'])
    def add_price_lists(self, request, pk=None):
        """Добавить прайс-листы"""
        framework = self.get_object()
        price_list_ids = request.data.get('price_list_ids', [])
        if price_list_ids:
            framework.price_lists.add(*price_list_ids)
        return Response({'status': 'success'})
    
    @extend_schema(summary='Удалить прайс-листы из рамочного договора')
    @action(detail=True, methods=['post'])
    def remove_price_lists(self, request, pk=None):
        """Удалить прайс-листы"""
        framework = self.get_object()
        price_list_ids = request.data.get('price_list_ids', [])
        if price_list_ids:
            framework.price_lists.remove(*price_list_ids)
        return Response({'status': 'success'})
    
    @extend_schema(summary='Активировать рамочный договор')
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Перевести в статус Действующий"""
        framework = self.get_object()
        if framework.status == FrameworkContract.Status.DRAFT:
            framework.status = FrameworkContract.Status.ACTIVE
            framework.save()
            return Response({'status': 'activated'})
        return Response(
            {'error': 'Можно активировать только черновик'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    @extend_schema(summary='Расторгнуть рамочный договор')
    @action(detail=True, methods=['post'])
    def terminate(self, request, pk=None):
        """Расторгнуть договор"""
        framework = self.get_object()
        framework.status = FrameworkContract.Status.TERMINATED
        framework.save()
        return Response({'status': 'terminated'})
    
    def destroy(self, request, *args, **kwargs):
        """Удаление только если нет связанных договоров"""
        framework = self.get_object()
        if framework.contracts.exists():
            return Response(
                {'error': 'Нельзя удалить рамочный договор с существующими договорами'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)


