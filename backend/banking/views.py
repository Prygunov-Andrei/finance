"""
REST API views для банковского модуля.
"""

import logging

from django.http import HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters

from banking.models import (
    BankAccount,
    BankConnection,
    BankPaymentOrder,
    BankPaymentOrderEvent,
    BankTransaction,
)
from banking.serializers import (
    ApproveSerializer,
    BankAccountSerializer,
    BankConnectionCreateSerializer,
    BankConnectionListSerializer,
    BankPaymentOrderCreateSerializer,
    BankPaymentOrderEventSerializer,
    BankPaymentOrderListSerializer,
    BankTransactionSerializer,
    ReconcileSerializer,
    RejectSerializer,
    RescheduleSerializer,
)
from banking import services
from banking.clients.tochka import TochkaAPIClient, TochkaAPIError
from personnel.permissions import ERPSectionPermission

logger = logging.getLogger(__name__)


# =============================================================================
# BankConnection
# =============================================================================

class BankConnectionViewSet(viewsets.ModelViewSet):
    """CRUD для банковских подключений."""
    queryset = BankConnection.objects.select_related('legal_entity').all()
    permission_classes = [permissions.IsAuthenticated, ERPSectionPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'legal_entity__name']

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return BankConnectionCreateSerializer
        return BankConnectionListSerializer

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Тестировать подключение к банку."""
        connection = self.get_object()
        try:
            with TochkaAPIClient(connection) as client:
                client.authenticate()
            return Response({'status': 'ok', 'message': 'Подключение успешно'})
        except TochkaAPIError as exc:
            return Response(
                {'status': 'error', 'message': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=['post'], url_path='sync-accounts')
    def sync_accounts(self, request, pk=None):
        """Подтянуть список счетов из банка."""
        connection = self.get_object()
        try:
            with TochkaAPIClient(connection) as client:
                data = client.get_accounts_list()
            return Response({'status': 'ok', 'accounts': data})
        except TochkaAPIError as exc:
            return Response(
                {'status': 'error', 'message': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )


# =============================================================================
# BankAccount
# =============================================================================

class BankAccountViewSet(viewsets.ModelViewSet):
    """CRUD для привязанных банковских счетов."""
    queryset = BankAccount.objects.select_related(
        'account', 'bank_connection',
    ).all()
    serializer_class = BankAccountSerializer
    permission_classes = [permissions.IsAuthenticated, ERPSectionPermission]

    @action(detail=True, methods=['post'], url_path='sync-statements')
    def sync_statements(self, request, pk=None):
        """Ручная синхронизация выписки."""
        bank_account = self.get_object()
        date_from = request.data.get('date_from')
        date_to = request.data.get('date_to')

        from datetime import date as dt_date
        if date_from:
            date_from = dt_date.fromisoformat(date_from)
        if date_to:
            date_to = dt_date.fromisoformat(date_to)

        try:
            count = services.sync_statements(bank_account, date_from, date_to)
            return Response({
                'status': 'ok',
                'new_transactions': count,
            })
        except Exception as exc:
            return Response(
                {'status': 'error', 'message': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )


# =============================================================================
# BankTransaction
# =============================================================================

class BankTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """Список банковских транзакций (только чтение)."""
    queryset = BankTransaction.objects.select_related(
        'bank_account__account', 'payment',
    ).all()
    serializer_class = BankTransactionSerializer
    permission_classes = [permissions.IsAuthenticated, ERPSectionPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['bank_account', 'transaction_type', 'reconciled', 'date']
    search_fields = ['counterparty_name', 'counterparty_inn', 'purpose']
    ordering_fields = ['date', 'amount', 'created_at']
    ordering = ['-date']

    @action(detail=True, methods=['post'])
    def reconcile(self, request, pk=None):
        """Привязать транзакцию к внутреннему платежу."""
        transaction = self.get_object()
        serializer = ReconcileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        success = services.reconcile_transaction(
            transaction=transaction,
            payment_id=serializer.validated_data['payment_id'],
        )

        if success:
            return Response({'status': 'ok'})
        return Response(
            {'status': 'error', 'message': 'Не удалось привязать'},
            status=status.HTTP_400_BAD_REQUEST,
        )


# =============================================================================
# BankPaymentOrder
# =============================================================================

class BankPaymentOrderViewSet(viewsets.ModelViewSet):
    """CRUD и workflow для платёжных поручений."""
    queryset = BankPaymentOrder.objects.select_related(
        'bank_account__account',
        'bank_account__bank_connection',
        'payment_registry',
        'created_by',
        'approved_by',
    ).all()
    permission_classes = [permissions.IsAuthenticated, ERPSectionPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'bank_account', 'payment_date']
    search_fields = ['recipient_name', 'recipient_inn', 'purpose']
    ordering_fields = ['payment_date', 'amount', 'created_at']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return BankPaymentOrderCreateSerializer
        return BankPaymentOrderListSerializer

    def perform_create(self, serializer):
        """Создание через сервисный слой."""
        data = serializer.validated_data
        order = services.create_payment_order(
            bank_account=data['bank_account'],
            user=self.request.user,
            recipient_name=data['recipient_name'],
            recipient_inn=data['recipient_inn'],
            recipient_kpp=data.get('recipient_kpp', ''),
            recipient_account=data['recipient_account'],
            recipient_bank_name=data['recipient_bank_name'],
            recipient_bik=data['recipient_bik'],
            recipient_corr_account=data.get('recipient_corr_account', ''),
            amount=data['amount'],
            purpose=data['purpose'],
            vat_info=data.get('vat_info', ''),
            payment_date=data.get('payment_date'),
            payment_registry_id=data.get('payment_registry'),
        )
        serializer.instance = order

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Отправить на согласование."""
        order = self.get_object()
        try:
            services.submit_for_approval(order, request.user)
            return Response(BankPaymentOrderListSerializer(order).data)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Одобрить платёжное поручение."""
        order = self.get_object()
        serializer = ApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            services.approve_order(
                order=order,
                user=request.user,
                payment_date=serializer.validated_data.get('payment_date'),
                comment=serializer.validated_data.get('comment', ''),
            )
            return Response(BankPaymentOrderListSerializer(order).data)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Отклонить платёжное поручение."""
        order = self.get_object()
        serializer = RejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            services.reject_order(
                order=order,
                user=request.user,
                comment=serializer.validated_data.get('comment', ''),
            )
            return Response(BankPaymentOrderListSerializer(order).data)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reschedule(self, request, pk=None):
        """Перенести дату оплаты (только approved)."""
        order = self.get_object()
        serializer = RescheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            services.reschedule_order(
                order=order,
                user=request.user,
                new_payment_date=serializer.validated_data['payment_date'],
                comment=serializer.validated_data['comment'],
            )
            return Response(BankPaymentOrderListSerializer(order).data)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def execute(self, request, pk=None):
        """Отправить в банк."""
        order = self.get_object()
        try:
            services.execute_payment_order(order)
            return Response(BankPaymentOrderListSerializer(order).data)
        except (ValueError, TochkaAPIError) as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='status')
    def check_status(self, request, pk=None):
        """Проверить статус в банке."""
        order = self.get_object()
        services.check_payment_order_status(order)
        return Response(BankPaymentOrderListSerializer(order).data)

    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        """Аудит-лог (история всех действий)."""
        order = self.get_object()
        events = order.events.select_related('user').all()
        serializer = BankPaymentOrderEventSerializer(events, many=True)
        return Response(serializer.data)


# =============================================================================
# Webhook endpoint (публичный, без JWT-авторизации Django)
# =============================================================================

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def tochka_webhook(request):
    """
    Публичный webhook-эндпоинт для Точка Банка.

    Тело запроса — JWT-строка, подписанная RS256.
    Верификация через публичный ключ Точки.
    """
    jwt_token = request.body.decode('utf-8').strip()

    if not jwt_token:
        return HttpResponse(status=200)  # Пустой запрос — тестовый пинг

    try:
        tx = services.process_webhook(jwt_token)
        if tx:
            logger.info('Webhook обработан: транзакция %s', tx.external_id)
        return HttpResponse(status=200)
    except Exception as exc:
        logger.error('Ошибка обработки webhook: %s', exc, exc_info=True)
        # Возвращаем 200 чтобы банк не ретраил
        return HttpResponse(status=200)
