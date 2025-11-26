from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from core.mixins import CashFlowMixin
from .models import Contract, ContractAmendment, WorkScheduleItem, Act, ActPaymentAllocation, CommercialProposal
from .serializers import (
    ContractSerializer, ContractListSerializer, 
    ContractAmendmentSerializer, WorkScheduleItemSerializer, 
    ActSerializer, ActPaymentAllocationSerializer, CommercialProposalSerializer
)


@extend_schema_view(
    list=extend_schema(tags=['Договоры']),
    retrieve=extend_schema(tags=['Договоры']),
    create=extend_schema(tags=['Договоры']),
    update=extend_schema(tags=['Договоры']),
    partial_update=extend_schema(tags=['Договоры']),
    destroy=extend_schema(tags=['Договоры']),
    cash_flow=extend_schema(tags=['Договоры']),
    cash_flow_periods=extend_schema(tags=['Договоры']),
)
class ContractViewSet(CashFlowMixin, viewsets.ModelViewSet):
    """ViewSet для управления договорами"""
    queryset = Contract.objects.select_related('object', 'counterparty', 'legal_entity', 'commercial_proposal').all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['object', 'status', 'currency', 'contract_type', 'legal_entity', 'counterparty']
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
        """Генерация PDF с графиком работ (Заглушка)"""
        # TODO: Implement PDF generation using reportlab or similar
        return Response({'detail': 'PDF export not implemented yet'}, status=status.HTTP_501_NOT_IMPLEMENTED)


class CommercialProposalViewSet(viewsets.ModelViewSet):
    """ViewSet для Коммерческих предложений (ТКП/МП)"""
    queryset = CommercialProposal.objects.all()
    serializer_class = CommercialProposalSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['object', 'status', 'proposal_type', 'counterparty']
    search_fields = ['number', 'description', 'counterparty__name']
    ordering_fields = ['date', 'total_amount', 'created_at']
    ordering = ['-date']

    @extend_schema(summary='Согласовать КП')
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        proposal = self.get_object()
        if proposal.status != CommercialProposal.Status.DRAFT:
             return Response({'detail': 'Можно согласовать только черновик'}, status=status.HTTP_400_BAD_REQUEST)
        
        proposal.status = CommercialProposal.Status.APPROVED
        proposal.save()
        return Response({'status': 'approved'})

    @extend_schema(summary='Создать договор на основании КП')
    @action(detail=True, methods=['post'])
    def create_contract(self, request, pk=None):
        proposal = self.get_object()
        
        if proposal.status != CommercialProposal.Status.APPROVED:
             return Response({'detail': 'КП должно быть согласовано'}, status=status.HTTP_400_BAD_REQUEST)
        
        if hasattr(proposal, 'contract') and proposal.contract:
             return Response({'detail': 'Договор по этому КП уже создан'}, status=status.HTTP_400_BAD_REQUEST)

        # Определяем тип договора на основе типа КП
        contract_type = Contract.Type.INCOME if proposal.proposal_type == CommercialProposal.Type.INCOME else Contract.Type.EXPENSE

        contract = Contract.objects.create(
            object=proposal.object,
            counterparty=proposal.counterparty,
            contract_type=contract_type,
            commercial_proposal=proposal,
            number=f"Договор по КП {proposal.number}",
            name=f"Договор на основании КП №{proposal.number}",
            contract_date=proposal.date, # Используем дату КП как дефолтную
            total_amount=proposal.total_amount,
            status=Contract.Status.PLANNED
        )
        
        return Response(ContractSerializer(contract).data, status=status.HTTP_201_CREATED)


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
    queryset = Act.objects.all()
    serializer_class = ActSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['contract', 'status']
    search_fields = ['number', 'description']
    
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
