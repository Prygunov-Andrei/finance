from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Count
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view

from .models import Payment, PaymentRegistry, ExpenseCategory
from personnel.permissions import ERPSectionPermission
from .serializers import (
    PaymentSerializer,
    PaymentListSerializer,
    PaymentRegistrySerializer,
    PaymentRegistryListSerializer,
    ExpenseCategorySerializer,
)


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
