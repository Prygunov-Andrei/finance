from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from core.mixins import CashFlowMixin
from .models import (
    Contract, ContractAmendment, WorkScheduleItem, Act,
    ActPaymentAllocation, FrameworkContract,
    ContractEstimate, ContractEstimateSection, ContractEstimateItem,
    ContractText, EstimatePurchaseLink,
)
from .serializers import (
    ContractSerializer, ContractListSerializer, 
    ContractAmendmentSerializer, WorkScheduleItemSerializer, 
    ActSerializer, ActPaymentAllocationSerializer,
    FrameworkContractSerializer, FrameworkContractListSerializer,
    ContractEstimateSerializer, ContractEstimateListSerializer,
    ContractEstimateSectionSerializer, ContractEstimateItemSerializer,
    ContractTextSerializer, EstimatePurchaseLinkSerializer,
    ActItemSerializer,
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

    @action(detail=True, methods=['get'], url_path='accumulative-estimate')
    def accumulative_estimate(self, request, pk=None):
        """Накопительная смета по договору"""
        contract = self.get_object()
        ce = ContractEstimate.objects.filter(
            contract=contract,
            status__in=[ContractEstimate.Status.AGREED, ContractEstimate.Status.SIGNED],
        ).order_by('-version_number').first()
        if not ce:
            return Response({'error': 'Нет подписанной сметы'}, status=status.HTTP_404_NOT_FOUND)
        from .services.accumulative_estimate import AccumulativeEstimateService
        data = AccumulativeEstimateService.get_accumulative(ce.id)
        return Response(data)

    @action(detail=True, methods=['get'], url_path='estimate-remainder')
    def estimate_remainder(self, request, pk=None):
        """Остатки по смете (смета минус закуплено)"""
        contract = self.get_object()
        ce = ContractEstimate.objects.filter(
            contract=contract,
            status__in=[ContractEstimate.Status.AGREED, ContractEstimate.Status.SIGNED],
        ).order_by('-version_number').first()
        if not ce:
            return Response({'error': 'Нет подписанной сметы'}, status=status.HTTP_404_NOT_FOUND)
        from .services.accumulative_estimate import AccumulativeEstimateService
        data = AccumulativeEstimateService.get_remainder(ce.id)
        return Response(data)

    @action(detail=True, methods=['get'], url_path='estimate-deviations')
    def estimate_deviations(self, request, pk=None):
        """Отклонения от сметы (аналоги, допработы, превышения)"""
        contract = self.get_object()
        ce = ContractEstimate.objects.filter(
            contract=contract,
            status__in=[ContractEstimate.Status.AGREED, ContractEstimate.Status.SIGNED],
        ).order_by('-version_number').first()
        if not ce:
            return Response({'error': 'Нет подписанной сметы'}, status=status.HTTP_404_NOT_FOUND)
        from .services.accumulative_estimate import AccumulativeEstimateService
        data = AccumulativeEstimateService.get_deviations(ce.id)
        return Response(data)

    @action(detail=True, methods=['get'], url_path='accumulative-estimate/export')
    def accumulative_estimate_export(self, request, pk=None):
        """Экспорт накопительной сметы в Excel"""
        contract = self.get_object()
        ce = ContractEstimate.objects.filter(
            contract=contract,
            status__in=[ContractEstimate.Status.AGREED, ContractEstimate.Status.SIGNED],
        ).order_by('-version_number').first()
        if not ce:
            return Response({'error': 'Нет подписанной сметы'}, status=status.HTTP_404_NOT_FOUND)
        from .services.accumulative_estimate import AccumulativeEstimateService
        data = AccumulativeEstimateService.export_accumulative_data(ce.id)
        
        import openpyxl
        from django.http import HttpResponse
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Накопительная смета'
        headers = [
            '№', 'Раздел', 'Наименование', 'Модель', 'Ед.', 
            'Кол-во (смета)', 'Цена мат.', 'Цена работ',
            'Закуплено кол.', 'Закуплено сумма', 'Остаток кол.',
        ]
        ws.append(headers)
        for row in data:
            ws.append([
                row['item_number'], row['section_name'], row['name'],
                row['model_name'], row['unit'],
                row['estimate_quantity'], row['estimate_material_price'],
                row['estimate_work_price'], row['purchased_quantity'],
                row['purchased_amount'], row['remaining_quantity'],
            ])
        
        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="accumulative_{contract.number}.xlsx"'
        wb.save(response)
        return response

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
    queryset = Act.objects.select_related(
        'contract', 'contract_estimate',
    ).prefetch_related('payment_allocations', 'act_items')
    serializer_class = ActSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['contract', 'status', 'act_type']
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
        if act.status not in [Act.Status.DRAFT, Act.Status.AGREED]:
            return Response(
                {'detail': 'Акт должен быть в статусе "Черновик" или "Согласован"'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        act.status = Act.Status.SIGNED
        act.save()
        return Response({'status': 'signed'})

    @action(detail=True, methods=['post'])
    def agree(self, request, pk=None):
        """Перевод акта в статус 'Согласован'"""
        act = self.get_object()
        if act.status != Act.Status.DRAFT:
            return Response(
                {'detail': 'Только черновик можно согласовать'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        act.status = Act.Status.AGREED
        act.save()
        return Response({'status': 'agreed'})

    @action(detail=False, methods=['post'], url_path='from-accumulative')
    def from_accumulative(self, request):
        """Сформировать акт КС-2 из накопительной сметы"""
        contract_estimate_id = request.data.get('contract_estimate_id')
        items_data = request.data.get('items', [])
        act_kwargs = {
            'number': request.data.get('number', ''),
            'date': request.data.get('date'),
        }
        if request.data.get('period_start'):
            act_kwargs['period_start'] = request.data['period_start']
        if request.data.get('period_end'):
            act_kwargs['period_end'] = request.data['period_end']

        if not contract_estimate_id or not items_data:
            return Response(
                {'error': 'Укажите contract_estimate_id и items'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ce = ContractEstimate.objects.get(pk=contract_estimate_id)
        except ContractEstimate.DoesNotExist:
            return Response(
                {'error': 'Смета к договору не найдена'},
                status=status.HTTP_404_NOT_FOUND,
            )

        act = Act.create_from_accumulative(ce, items_data, **act_kwargs)
        return Response(ActSerializer(act).data, status=status.HTTP_201_CREATED)


class ActPaymentAllocationViewSet(viewsets.ReadOnlyModelViewSet):
    """Просмотр распределений оплат по актам"""
    queryset = ActPaymentAllocation.objects.all()
    serializer_class = ActPaymentAllocationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['act', 'payment']


class ContractTextViewSet(viewsets.ModelViewSet):
    """ViewSet для текстов договоров (md)"""
    queryset = ContractText.objects.select_related(
        'contract', 'amendment', 'created_by',
    )
    serializer_class = ContractTextSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['contract', 'amendment']
    search_fields = ['content_md']

    def perform_create(self, serializer):
        contract = serializer.validated_data['contract']
        amendment = serializer.validated_data.get('amendment')
        last_version = ContractText.objects.filter(
            contract=contract, amendment=amendment,
        ).order_by('-version').first()
        next_version = (last_version.version + 1) if last_version else 1
        serializer.save(
            created_by=self.request.user,
            version=next_version,
        )


class ContractEstimateViewSet(viewsets.ModelViewSet):
    """ViewSet для смет к договорам"""
    queryset = ContractEstimate.objects.select_related(
        'contract', 'source_estimate', 'parent_version', 'amendment',
    ).prefetch_related('sections', 'items')
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['contract', 'status']
    search_fields = ['number', 'name']
    ordering = ['-version_number', '-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return ContractEstimateListSerializer
        return ContractEstimateSerializer

    @action(detail=False, methods=['post'], url_path='from-estimate')
    def from_estimate(self, request):
        """Создать смету к договору из estimates.Estimate."""
        estimate_id = request.data.get('estimate_id')
        contract_id = request.data.get('contract_id')
        if not estimate_id or not contract_id:
            return Response(
                {'error': 'Укажите estimate_id и contract_id'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from estimates.models import Estimate
        try:
            estimate = Estimate.objects.get(pk=estimate_id)
            contract = Contract.objects.get(pk=contract_id)
        except (Estimate.DoesNotExist, Contract.DoesNotExist):
            return Response(
                {'error': 'Смета или договор не найдены'},
                status=status.HTTP_404_NOT_FOUND,
            )
        ce = ContractEstimate.create_from_estimate(estimate, contract)
        return Response(
            ContractEstimateSerializer(ce).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='create-version')
    def create_version(self, request, pk=None):
        """Создать новую версию сметы (при ДОП)."""
        ce = self.get_object()
        amendment_id = request.data.get('amendment_id')
        amendment = None
        if amendment_id:
            amendment = ContractAmendment.objects.filter(pk=amendment_id).first()
        new_ce = ce.create_new_version(amendment=amendment)
        return Response(
            ContractEstimateSerializer(new_ce).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='split')
    def split(self, request, pk=None):
        """Разбить смету на несколько для разных Исполнителей."""
        ce = self.get_object()
        sections_mapping = request.data.get('sections_mapping', {})
        if not sections_mapping:
            return Response(
                {'error': 'Укажите sections_mapping: {contract_id: [section_id, ...]}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            new_estimates = ce.split_by_sections(sections_mapping)
            return Response(
                ContractEstimateSerializer(new_estimates, many=True).data,
                status=status.HTTP_201_CREATED,
            )
        except Contract.DoesNotExist:
            return Response(
                {'error': 'Один из указанных договоров не найден'},
                status=status.HTTP_404_NOT_FOUND,
            )


class ContractEstimateSectionViewSet(viewsets.ModelViewSet):
    """ViewSet для разделов смет к договорам"""
    queryset = ContractEstimateSection.objects.select_related('contract_estimate').prefetch_related('items')
    serializer_class = ContractEstimateSectionSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['contract_estimate']


class ContractEstimateItemViewSet(viewsets.ModelViewSet):
    """ViewSet для строк смет к договорам"""
    queryset = ContractEstimateItem.objects.select_related(
        'contract_estimate', 'section', 'product', 'work_item', 'source_item',
    )
    serializer_class = ContractEstimateItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['contract_estimate', 'section', 'product', 'item_type', 'is_analog']
    search_fields = ['name', 'model_name']


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


class EstimatePurchaseLinkViewSet(viewsets.ModelViewSet):
    """ViewSet для сопоставлений закупок со сметами"""
    queryset = EstimatePurchaseLink.objects.select_related(
        'contract_estimate_item', 'invoice_item',
    )
    serializer_class = EstimatePurchaseLinkSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = [
        'contract_estimate_item', 'invoice_item',
        'match_type', 'price_exceeds', 'quantity_exceeds',
    ]

    @action(detail=False, methods=['post'], url_path='check-invoice')
    def check_invoice(self, request):
        """Проверить счёт на соответствие смете"""
        invoice_id = request.data.get('invoice_id')
        if not invoice_id:
            return Response(
                {'error': 'Укажите invoice_id'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from payments.models import Invoice
        try:
            invoice = Invoice.objects.get(pk=invoice_id)
        except Invoice.DoesNotExist:
            return Response(
                {'error': 'Счёт не найден'},
                status=status.HTTP_404_NOT_FOUND,
            )
        from .services.estimate_compliance_checker import EstimateComplianceChecker
        checker = EstimateComplianceChecker()
        result = checker.check_invoice(invoice)
        return Response(result)

    @action(detail=False, methods=['post'], url_path='auto-link')
    def auto_link(self, request):
        """Автоматически сопоставить позиции счёта со сметой"""
        invoice_id = request.data.get('invoice_id')
        if not invoice_id:
            return Response(
                {'error': 'Укажите invoice_id'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from payments.models import Invoice
        try:
            invoice = Invoice.objects.get(pk=invoice_id)
        except Invoice.DoesNotExist:
            return Response(
                {'error': 'Счёт не найден'},
                status=status.HTTP_404_NOT_FOUND,
            )
        from .services.estimate_compliance_checker import EstimateComplianceChecker
        checker = EstimateComplianceChecker()
        result = checker.auto_link_invoice(invoice)
        return Response(result, status=status.HTTP_201_CREATED)
