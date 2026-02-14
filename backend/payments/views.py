import logging
from datetime import date
from decimal import Decimal

from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Count, Sum, Q
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from .models import (
    Payment, PaymentRegistry, ExpenseCategory,
    Invoice, InvoiceItem, InvoiceEvent,
    RecurringPayment, IncomeRecord,
)
from personnel.permissions import ERPSectionPermission
from .serializers import (
    PaymentSerializer,
    PaymentListSerializer,
    PaymentRegistrySerializer,
    PaymentRegistryListSerializer,
    ExpenseCategorySerializer,
    InvoiceListSerializer,
    InvoiceDetailSerializer,
    InvoiceCreateSerializer,
    InvoiceActionSerializer,
    RecurringPaymentSerializer,
    IncomeRecordSerializer,
)
from .services import InvoiceService

logger = logging.getLogger(__name__)


@extend_schema_view(
    list=extend_schema(
        summary='Список платежей',
        description='Получить список фактических платежей (расходы и поступления)',
        tags=['Платежи'],
    ),
    retrieve=extend_schema(
        summary='Детали платежа',
        description='Получить подробную информацию о платеже',
        tags=['Платежи'],
    ),
    create=extend_schema(
        summary='Создать платёж',
        description='Создать новый фактический платёж',
        tags=['Платежи'],
    ),
    update=extend_schema(
        summary='Обновить платёж',
        description='Полностью обновить информацию о платеже',
        tags=['Платежи'],
    ),
    partial_update=extend_schema(
        summary='Частично обновить платёж',
        description='Частично обновить информацию о платеже',
        tags=['Платежи'],
    ),
    destroy=extend_schema(
        summary='Удалить платёж',
        description='Удалить платёж',
        tags=['Платежи'],
    ),
)
class PaymentViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления платежами
    
    list: Получить список платежей
    retrieve: Получить детали платежа
    create: Создать новый платёж
    update: Обновить платёж
    partial_update: Частично обновить платёж
    destroy: Удалить платёж
    """
    queryset = Payment.objects.select_related(
        'contract',
        'contract__object',
        'category',
        'category__parent',
        'account',
        'legal_entity'
    ).all()
    permission_classes = [permissions.IsAuthenticated, ERPSectionPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['contract', 'payment_type', 'contract__object', 'category', 'category__parent', 'account', 'legal_entity', 'status']
    search_fields = [
        'description',
        'account__number',
        'contract__number',
        'contract__object__name',
        'category__name',
        'category__code',
    ]
    ordering_fields = ['payment_date', 'amount', 'created_at']
    ordering = ['-payment_date', '-created_at']
    
    def get_queryset(self):
        """Оптимизация: добавляем annotate для count полей"""
        queryset = super().get_queryset()
        if self.action in ['list', 'retrieve']:
            queryset = queryset.annotate(annotated_items_count=Count('items'))
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PaymentListSerializer
        return PaymentSerializer


@extend_schema_view(
    list=extend_schema(
        summary='Список заявок на согласование',
        description='Получить список расходных платежей, ожидающих согласования',
        tags=['Реестр платежей'],
    ),
    retrieve=extend_schema(
        summary='Детали заявки',
        description='Получить подробную информацию о заявке на платёж',
        tags=['Реестр платежей'],
    ),
    update=extend_schema(
        summary='Обновить заявку',
        description='Обновить информацию о заявке (только для статуса planned)',
        tags=['Реестр платежей'],
    ),
    partial_update=extend_schema(
        summary='Частично обновить заявку',
        description='Частично обновить информацию о заявке (только для статуса planned)',
        tags=['Реестр платежей'],
    ),
)
class PaymentRegistryViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления Реестром платежей (согласование расходов).
    
    Заявки создаются автоматически при создании расходного платежа.
    Этот ViewSet предназначен только для:
    - Просмотра списка заявок
    - Согласования (approve)
    - Проведения оплаты (pay)
    - Отмены (cancel)
    """
    http_method_names = ['get', 'post', 'patch', 'head', 'options']  # POST нужен для actions
    
    def create(self, request, *args, **kwargs):
        """Запрещаем создание заявок напрямую через API"""
        return Response(
            {'error': 'Заявки создаются автоматически при создании расходного платежа'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )
    queryset = PaymentRegistry.objects.select_related(
        'contract',
        'contract__object',
        'category',
        'account',
        'approved_by',
        'act'
    ).all()
    permission_classes = [permissions.IsAuthenticated, ERPSectionPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['contract', 'status', 'contract__object', 'account', 'category']
    search_fields = ['comment', 'initiator', 'contract__number', 'contract__object__name']
    ordering_fields = ['planned_date', 'amount', 'created_at']
    ordering = ['planned_date', '-created_at']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PaymentRegistryListSerializer
        return PaymentRegistrySerializer

    @extend_schema(summary='Согласовать платёж', tags=['Плановые платежи'])
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Переводит заявку в статус 'Утверждено'"""
        payment_request = self.get_object()
        
        if payment_request.status != PaymentRegistry.Status.PLANNED:
            return Response(
                {'error': 'Можно согласовать только запланированный платёж'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        payment_request.status = PaymentRegistry.Status.APPROVED
        payment_request.approved_by = request.user
        payment_request.approved_at = timezone.now()
        payment_request.save()
        
        serializer = self.get_serializer(payment_request)
        return Response(serializer.data)

    @extend_schema(summary='Провести оплату', tags=['Плановые платежи'])
    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        """Переводит заявку в статус 'Оплачено' (создает платеж)"""
        payment_request = self.get_object()
        
        if payment_request.status != PaymentRegistry.Status.APPROVED:
            return Response(
                {'error': 'Можно оплатить только согласованный платёж'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Проверяем достаточность средств (просто предупреждение или блок? По ТЗ - не блокируем)
        # Но если мы хотим вернуть предупреждение, то это сложнее через REST.
        # Просто проводим.
            
        payment_request.status = PaymentRegistry.Status.PAID
        payment_request.save()
        
        serializer = self.get_serializer(payment_request)
        return Response(serializer.data)

    @extend_schema(summary='Отменить заявку', tags=['Плановые платежи'])
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Отменяет заявку"""
        payment_request = self.get_object()
        
        if payment_request.status == PaymentRegistry.Status.PAID:
            return Response(
                {'error': 'Нельзя отменить уже оплаченную заявку'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        payment_request.status = PaymentRegistry.Status.CANCELLED
        payment_request.save()
        
        serializer = self.get_serializer(payment_request)
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(
        summary='Список категорий',
        description='Получить список категорий расходов/доходов',
        tags=['Категории'],
    ),
    retrieve=extend_schema(
        summary='Детали категории',
        description='Получить подробную информацию о категории',
        tags=['Категории'],
    ),
    create=extend_schema(
        summary='Создать категорию',
        description='Создать новую категорию расходов/доходов',
        tags=['Категории'],
    ),
    update=extend_schema(
        summary='Обновить категорию',
        description='Полностью обновить информацию о категории',
        tags=['Категории'],
    ),
    partial_update=extend_schema(
        summary='Частично обновить категорию',
        description='Частично обновить информацию о категории',
        tags=['Категории'],
    ),
    destroy=extend_schema(
        summary='Удалить категорию',
        description='Удалить категорию (если нет связанных платежей)',
        tags=['Категории'],
    ),
)
class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления категориями расходов/доходов
    
    list: Получить список категорий
    retrieve: Получить детали категории
    create: Создать новую категорию
    update: Обновить категорию
    partial_update: Частично обновить категорию
    destroy: Удалить категорию
    """
    permission_classes = [permissions.IsAuthenticated, ERPSectionPermission]
    queryset = ExpenseCategory.objects.select_related('parent').filter(is_active=True)
    serializer_class = ExpenseCategorySerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['parent', 'is_active', 'requires_contract']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['sort_order', 'name', 'created_at']
    ordering = ['sort_order', 'name']
    
    def get_queryset(self):
        """Возвращает все категории для администраторов, активные для остальных"""
        queryset = ExpenseCategory.objects.select_related('parent').all()
        if not self.request.user.is_staff:
            queryset = queryset.filter(is_active=True)
        return queryset


# =============================================================================
# Invoice — новые ViewSets
# =============================================================================

class InvoiceViewSet(viewsets.ModelViewSet):
    """
    CRUD для счетов на оплату (Invoice).

    Включает actions для workflow:
    - submit_to_registry: оператор подтвердил
    - approve: директор одобрил
    - reject: директор отклонил
    - reschedule: директор перенёс дату
    - dashboard: сводная аналитика
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'source', 'object', 'counterparty', 'category', 'account']
    search_fields = ['invoice_number', 'counterparty__name', 'description']
    ordering_fields = ['created_at', 'due_date', 'amount_gross', 'invoice_date']
    ordering = ['-created_at']

    def get_queryset(self):
        return (
            Invoice.objects
            .select_related(
                'counterparty', 'object', 'contract', 'category',
                'account', 'legal_entity', 'supply_request',
                'recurring_payment', 'bank_payment_order',
                'created_by', 'reviewed_by', 'approved_by',
                'parsed_document',
            )
            .prefetch_related('items', 'items__product', 'events')
            .order_by('-created_at')
        )

    def get_serializer_class(self):
        if self.action == 'list':
            return InvoiceListSerializer
        if self.action == 'create':
            return InvoiceCreateSerializer
        return InvoiceDetailSerializer

    def perform_create(self, serializer):
        """Создание счёта вручную."""
        invoice = InvoiceService.create_manual(
            validated_data=serializer.validated_data,
            user=self.request.user,
        )
        # Если есть файл — запустить распознавание
        if invoice.invoice_file:
            from supply.tasks import recognize_invoice
            recognize_invoice.delay(invoice.id)
        serializer.instance = invoice

    @action(detail=True, methods=['post'])
    def submit_to_registry(self, request, pk=None):
        """Оператор подтвердил: REVIEW → IN_REGISTRY."""
        try:
            InvoiceService.submit_to_registry(int(pk), request.user)
            invoice = self.get_object()
            return Response(InvoiceDetailSerializer(invoice).data)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Директор одобрил: IN_REGISTRY → APPROVED."""
        serializer = InvoiceActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            InvoiceService.approve(
                int(pk), request.user,
                comment=serializer.validated_data.get('comment', ''),
            )
            invoice = self.get_object()
            return Response(InvoiceDetailSerializer(invoice).data)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Директор отклонил: IN_REGISTRY → CANCELLED."""
        serializer = InvoiceActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = serializer.validated_data.get('comment', '')
        if not comment:
            return Response(
                {'error': 'Необходимо указать причину отклонения'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            InvoiceService.reject(int(pk), request.user, comment=comment)
            invoice = self.get_object()
            return Response(InvoiceDetailSerializer(invoice).data)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reschedule(self, request, pk=None):
        """Директор перенёс дату."""
        serializer = InvoiceActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_date = serializer.validated_data.get('new_date')
        comment = serializer.validated_data.get('comment', '')
        if not new_date:
            return Response(
                {'error': 'Необходимо указать новую дату'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not comment:
            return Response(
                {'error': 'Необходимо указать причину переноса'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            InvoiceService.reschedule(int(pk), request.user, new_date, comment)
            invoice = self.get_object()
            return Response(InvoiceDetailSerializer(invoice).data)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Сводная аналитика для директора."""
        from accounting.models import Account, AccountBalance

        today = date.today()

        # Остатки на счетах
        accounts = Account.objects.filter(is_active=True)
        account_balances = []
        for acc in accounts:
            # Попытка получить банковский баланс
            latest_bank_balance = (
                AccountBalance.objects
                .filter(account=acc, source=AccountBalance.Source.BANK_TOCHKA)
                .order_by('-balance_date')
                .first()
            )
            account_balances.append({
                'id': acc.id,
                'name': acc.name,
                'number': acc.number,
                'currency': acc.currency,
                'internal_balance': str(acc.get_current_balance()),
                'bank_balance': str(latest_bank_balance.balance) if latest_bank_balance else None,
                'bank_balance_date': str(latest_bank_balance.balance_date) if latest_bank_balance else None,
            })

        # Сводка по реестру
        registry_qs = Invoice.objects.filter(status=Invoice.Status.IN_REGISTRY)
        overdue_qs = registry_qs.filter(due_date__lt=today)
        today_qs = registry_qs.filter(due_date=today)

        from datetime import timedelta
        week_end = today + timedelta(days=7)
        month_end = today + timedelta(days=30)
        week_qs = registry_qs.filter(due_date__lte=week_end)
        month_qs = registry_qs.filter(due_date__lte=month_end)

        def sum_amount(qs):
            return qs.aggregate(total=Sum('amount_gross'))['total'] or Decimal('0')

        registry_summary = {
            'total_amount': str(sum_amount(registry_qs)),
            'total_count': registry_qs.count(),
            'overdue_amount': str(sum_amount(overdue_qs)),
            'overdue_count': overdue_qs.count(),
            'today_amount': str(sum_amount(today_qs)),
            'today_count': today_qs.count(),
            'this_week_amount': str(sum_amount(week_qs)),
            'this_week_count': week_qs.count(),
            'this_month_amount': str(sum_amount(month_qs)),
            'this_month_count': month_qs.count(),
        }

        # Группировка по объектам
        by_object = list(
            registry_qs
            .values('object__id', 'object__name')
            .annotate(total=Sum('amount_gross'), count=Count('id'))
            .order_by('-total')
        )

        # Группировка по категориям
        by_category = list(
            registry_qs
            .values('category__id', 'category__name')
            .annotate(total=Sum('amount_gross'), count=Count('id'))
            .order_by('-total')
        )

        return Response({
            'account_balances': account_balances,
            'registry_summary': registry_summary,
            'by_object': by_object,
            'by_category': by_category,
        })


class RecurringPaymentViewSet(viewsets.ModelViewSet):
    """CRUD для периодических платежей."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = RecurringPaymentSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'frequency', 'counterparty']
    search_fields = ['name', 'counterparty__name', 'description']
    ordering = ['name']

    def get_queryset(self):
        return RecurringPayment.objects.select_related(
            'counterparty', 'category', 'account', 'contract',
            'object', 'legal_entity',
        )


class IncomeRecordViewSet(viewsets.ModelViewSet):
    """CRUD для поступлений (доходы)."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = IncomeRecordSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['account', 'category', 'counterparty']
    search_fields = ['description', 'counterparty__name']
    ordering = ['-payment_date', '-created_at']

    def get_queryset(self):
        return IncomeRecord.objects.select_related(
            'account', 'contract', 'category', 'legal_entity', 'counterparty',
        )
