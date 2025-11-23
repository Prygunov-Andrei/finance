from rest_framework import viewsets, filters, permissions
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Payment, PaymentRegistry, ExpenseCategory
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
        'category__parent'
    ).all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['contract', 'payment_type', 'contract__object', 'category', 'category__parent']
    search_fields = [
        'description',
        'company_account',
        'contract__number',
        'contract__object__name',
        'category__name',
        'category__code',
    ]
    ordering_fields = ['payment_date', 'amount', 'created_at']
    ordering = ['-payment_date', '-created_at']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PaymentListSerializer
        return PaymentSerializer


@extend_schema_view(
    list=extend_schema(
        summary='Список плановых платежей',
        description='Получить список плановых платежей из реестра',
        tags=['Плановые платежи'],
    ),
    retrieve=extend_schema(
        summary='Детали планового платежа',
        description='Получить подробную информацию о плановом платеже',
        tags=['Плановые платежи'],
    ),
    create=extend_schema(
        summary='Создать плановый платёж',
        description='Создать новую запись в реестре плановых платежей',
        tags=['Плановые платежи'],
    ),
    update=extend_schema(
        summary='Обновить плановый платёж',
        description='Полностью обновить информацию о плановом платеже',
        tags=['Плановые платежи'],
    ),
    partial_update=extend_schema(
        summary='Частично обновить плановый платёж',
        description='Частично обновить информацию о плановом платеже',
        tags=['Плановые платежи'],
    ),
    destroy=extend_schema(
        summary='Удалить плановый платёж',
        description='Удалить запись из реестра плановых платежей',
        tags=['Плановые платежи'],
    ),
)
class PaymentRegistryViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления плановыми платежами
    
    list: Получить список плановых платежей
    retrieve: Получить детали планового платежа
    create: Создать новый плановый платёж
    update: Обновить плановый платёж
    partial_update: Частично обновить плановый платёж
    destroy: Удалить плановый платёж
    """
    queryset = PaymentRegistry.objects.select_related('contract', 'contract__object').all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['contract', 'status', 'contract__object']
    search_fields = ['comment', 'initiator', 'contract__number', 'contract__object__name']
    ordering_fields = ['planned_date', 'amount', 'created_at']
    ordering = ['planned_date', '-created_at']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PaymentRegistryListSerializer
        return PaymentRegistrySerializer


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
    queryset = ExpenseCategory.objects.select_related('parent').filter(is_active=True)
    serializer_class = ExpenseCategorySerializer
    permission_classes = [permissions.IsAuthenticated]
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
