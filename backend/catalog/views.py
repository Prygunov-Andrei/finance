from collections import defaultdict
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema, extend_schema_view

from .models import Category, Product, ProductAlias, ProductPriceHistory
from .serializers import (
    CategorySerializer,
    ProductSerializer, ProductListSerializer, ProductMergeSerializer,
    ProductPriceHistorySerializer
)
from .services import ProductMatcher


@extend_schema_view(
    list=extend_schema(summary='Список категорий', tags=['Каталог']),
    retrieve=extend_schema(summary='Детали категории', tags=['Каталог']),
    create=extend_schema(summary='Создать категорию', tags=['Каталог']),
    update=extend_schema(summary='Обновить категорию', tags=['Каталог']),
    partial_update=extend_schema(summary='Частично обновить категорию', tags=['Каталог']),
    destroy=extend_schema(summary='Удалить категорию', tags=['Каталог']),
)
class CategoryViewSet(viewsets.ModelViewSet):
    """ViewSet для управления категориями товаров"""
    
    queryset = Category.objects.select_related('parent').all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['parent', 'is_active', 'level']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'sort_order', 'level']
    ordering = ['level', 'sort_order', 'name']
    
    def get_queryset(self):
        """Оптимизация: добавляем annotate для count полей в list"""
        queryset = super().get_queryset()
        if self.action == 'list':
            queryset = queryset.annotate(
                annotated_children_count=Count('children', filter=Q(children__is_active=True))
            )
        return queryset

    @extend_schema(summary='Дерево категорий', tags=['Каталог'])
    @action(detail=False, methods=['get'])
    def tree(self, request):
        """
        Возвращает иерархическое дерево категорий.
        Оптимизировано: загружает всё дерево одним запросом.
        """
        # Загружаем ВСЕ активные категории ОДНИМ запросом
        all_categories = list(
            Category.objects.filter(is_active=True)
            .order_by('level', 'sort_order', 'name')
            .values('id', 'name', 'code', 'level', 'parent_id')
        )
        
        # Строим дерево в памяти
        categories_by_parent = defaultdict(list)
        for cat in all_categories:
            categories_by_parent[cat['parent_id']].append(cat)
        
        def build_tree(parent_id):
            result = []
            for cat in categories_by_parent.get(parent_id, []):
                result.append({
                    'id': cat['id'],
                    'name': cat['name'],
                    'code': cat['code'],
                    'level': cat['level'],
                    'children': build_tree(cat['id'])
                })
            return result
        
        return Response(build_tree(None))


@extend_schema_view(
    list=extend_schema(summary='Список товаров', tags=['Каталог']),
    retrieve=extend_schema(summary='Детали товара', tags=['Каталог']),
    create=extend_schema(summary='Создать товар', tags=['Каталог']),
    update=extend_schema(summary='Обновить товар', tags=['Каталог']),
    partial_update=extend_schema(summary='Частично обновить товар', tags=['Каталог']),
    destroy=extend_schema(summary='Удалить товар', tags=['Каталог']),
)
class ProductViewSet(viewsets.ModelViewSet):
    """ViewSet для управления товарами/услугами"""
    
    queryset = Product.objects.select_related('category', 'merged_into').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'status', 'is_service']
    search_fields = ['name', 'normalized_name']
    ordering_fields = ['name', 'created_at', 'status']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Оптимизация: добавляем annotate для count полей"""
        queryset = super().get_queryset()
        if self.action in ['list', 'retrieve']:
            queryset = queryset.annotate(
                annotated_aliases_count=Count('aliases')
            )
        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return ProductListSerializer
        return ProductSerializer

    @extend_schema(summary='Поиск дубликатов', tags=['Каталог'])
    @action(detail=False, methods=['get'])
    def duplicates(self, request):
        """Находит потенциальные дубликаты товаров"""
        threshold = float(request.query_params.get('threshold', 0.8))
        limit = int(request.query_params.get('limit', 50))
        
        matcher = ProductMatcher()
        duplicates = matcher.find_duplicates(threshold=threshold, limit=limit)
        
        return Response(duplicates)

    @extend_schema(summary='Объединить товары', tags=['Каталог'])
    @action(detail=False, methods=['post'])
    def merge(self, request):
        """Объединяет несколько товаров в один (атомарная операция)"""
        serializer = ProductMergeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        source_ids = serializer.validated_data['source_ids']
        target_id = serializer.validated_data['target_id']
        
        try:
            target = Product.objects.get(pk=target_id)
            sources = Product.objects.filter(pk__in=source_ids)
            
            merged_count = 0
            # Используем транзакцию для атомарности операции
            with transaction.atomic():
                for source in sources:
                    # Переносим алиасы
                    ProductAlias.objects.filter(product=source).update(product=target)
                    
                    # Добавляем название как алиас
                    ProductAlias.objects.get_or_create(
                        product=target,
                        normalized_alias=source.normalized_name,
                        defaults={'alias_name': source.name}
                    )
                    
                    # Переносим историю цен
                    ProductPriceHistory.objects.filter(product=source).update(product=target)
                    
                    # Помечаем как объединённый
                    source.status = Product.Status.MERGED
                    source.merged_into = target
                    source.save()
                    merged_count += 1
            
            return Response({
                'message': f'Объединено {merged_count} товаров в "{target.name}"',
                'target': ProductSerializer(target).data
            })
        except Product.DoesNotExist:
            return Response(
                {'error': 'Товар не найден'},
                status=status.HTTP_404_NOT_FOUND
            )

    @extend_schema(summary='История цен товара', tags=['Каталог'])
    @action(detail=True, methods=['get'])
    def prices(self, request, pk=None):
        """Возвращает историю цен товара"""
        product = self.get_object()
        prices = ProductPriceHistory.objects.filter(
            product=product
        ).select_related('counterparty').order_by('-invoice_date')
        
        serializer = ProductPriceHistorySerializer(prices, many=True)
        return Response(serializer.data)

    @extend_schema(summary='Подтвердить товар', tags=['Каталог'])
    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        """Переводит товар в статус 'verified'"""
        product = self.get_object()
        product.status = Product.Status.VERIFIED
        product.save()
        return Response(ProductSerializer(product).data)

    @extend_schema(summary='Архивировать товар', tags=['Каталог'])
    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Переводит товар в архив"""
        product = self.get_object()
        product.status = Product.Status.ARCHIVED
        product.save()
        return Response(ProductSerializer(product).data)
