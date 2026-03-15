from collections import defaultdict
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema, extend_schema_view

from .models import Category, Product, ProductAlias, ProductPriceHistory, SupplierCatalog
from .serializers import (
    CategorySerializer,
    ProductSerializer, ProductListSerializer, ProductMergeSerializer,
    ProductPriceHistorySerializer,
    SupplierCatalogSerializer, SupplierCatalogUploadSerializer,
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
        Включает product_count — кол-во товаров в каждой категории (без вложенных).
        """
        # Загружаем ВСЕ активные категории ОДНИМ запросом
        all_categories = list(
            Category.objects.filter(is_active=True)
            .annotate(product_count=Count('products', filter=Q(products__status__in=['new', 'verified'])))
            .order_by('level', 'sort_order', 'name')
            .values('id', 'name', 'code', 'level', 'parent_id', 'product_count')
        )

        # Строим дерево в памяти
        categories_by_parent = defaultdict(list)
        for cat in all_categories:
            categories_by_parent[cat['parent_id']].append(cat)

        def build_tree(parent_id):
            result = []
            for cat in categories_by_parent.get(parent_id, []):
                children = build_tree(cat['id'])
                # total_count = свои товары + товары всех вложенных категорий
                total_count = cat['product_count'] + sum(c['total_count'] for c in children)
                result.append({
                    'id': cat['id'],
                    'name': cat['name'],
                    'code': cat['code'],
                    'level': cat['level'],
                    'product_count': cat['product_count'],
                    'total_count': total_count,
                    'children': children,
                })
            return result

        tree = build_tree(None)

        # Количество товаров без категории
        uncategorized_count = Product.objects.filter(
            category__isnull=True,
            status__in=['new', 'verified'],
        ).count()

        return Response({
            'tree': tree,
            'uncategorized_count': uncategorized_count,
        })


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
    filterset_fields = ['status', 'is_service']
    search_fields = ['name', 'normalized_name']
    ordering_fields = ['name', 'created_at', 'status']
    ordering = ['name']

    def get_queryset(self):
        """Оптимизация: annotate + фильтрация по категории с вложенными"""
        queryset = super().get_queryset()
        if self.action in ['list', 'retrieve']:
            queryset = queryset.annotate(
                annotated_aliases_count=Count('aliases')
            )

        # Фильтрация по категории с учётом вложенных подкатегорий
        category_id = self.request.query_params.get('category')
        if category_id == 'uncategorized':
            queryset = queryset.filter(category__isnull=True)
        elif category_id:
            try:
                category = Category.objects.get(pk=int(category_id))
                descendant_ids = self._get_descendant_ids(category)
                queryset = queryset.filter(category_id__in=descendant_ids)
            except (Category.DoesNotExist, ValueError):
                queryset = queryset.filter(category_id=category_id)

        # Фильтр по поставщику (Counterparty ID)
        supplier_id = self.request.query_params.get('supplier')
        if supplier_id:
            queryset = queryset.filter(
                supplier_products__integration__counterparty_id=supplier_id
            ).distinct()

        # Фильтр по наличию на складе
        in_stock = self.request.query_params.get('in_stock')
        if in_stock and in_stock.lower() in ('true', '1'):
            queryset = queryset.filter(
                supplier_products__stocks__quantity__gt=0
            ).distinct()

        return queryset

    @staticmethod
    def _get_descendant_ids(category):
        """Рекурсивно собирает id категории и всех потомков."""
        ids = {category.id}
        children = Category.objects.filter(parent=category, is_active=True)
        for child in children:
            ids.update(ProductViewSet._get_descendant_ids(child))
        return ids

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
        ).select_related('counterparty', 'invoice').order_by('-invoice_date')
        
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


# ── Каталоги поставщиков ────────────────────────────────────


@extend_schema_view(
    list=extend_schema(summary='Список каталогов поставщиков', tags=['Каталоги поставщиков']),
    retrieve=extend_schema(summary='Детали каталога поставщика', tags=['Каталоги поставщиков']),
    destroy=extend_schema(summary='Удалить каталог поставщика', tags=['Каталоги поставщиков']),
)
class SupplierCatalogViewSet(viewsets.ModelViewSet):
    """ViewSet для управления PDF-каталогами поставщиков."""

    queryset = SupplierCatalog.objects.all()
    serializer_class = SupplierCatalogSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete']

    @extend_schema(
        summary='Загрузить каталог поставщика',
        request=SupplierCatalogUploadSerializer,
        tags=['Каталоги поставщиков'],
    )
    def create(self, request, *args, **kwargs):
        """Загрузка нового PDF-каталога поставщика."""
        import fitz

        upload_serializer = SupplierCatalogUploadSerializer(data=request.data)
        upload_serializer.is_valid(raise_exception=True)

        pdf_file = upload_serializer.validated_data['pdf_file']

        # Считаем страницы
        content = pdf_file.read()
        pdf_file.seek(0)
        try:
            doc = fitz.open(stream=content, filetype='pdf')
            total_pages = len(doc)
            doc.close()
        except Exception:
            return Response(
                {'error': 'Не удалось открыть PDF-файл'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        catalog = SupplierCatalog.objects.create(
            name=upload_serializer.validated_data['name'],
            supplier_name=upload_serializer.validated_data['supplier_name'],
            pdf_file=pdf_file,
            total_pages=total_pages,
        )

        serializer = SupplierCatalogSerializer(catalog, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(summary='Определить оглавление каталога', tags=['Каталоги поставщиков'])
    @action(detail=True, methods=['post'], url_path='detect-toc')
    def detect_toc(self, request, pk=None):
        """Запускает определение оглавления через LLM (синхронно)."""
        from .services.catalog_parser import CatalogParserService

        catalog = self.get_object()

        if catalog.status not in (
            SupplierCatalog.Status.UPLOADED,
            SupplierCatalog.Status.TOC_READY,
            SupplierCatalog.Status.ERROR,
        ):
            return Response(
                {'error': f'Невозможно определить оглавление в статусе "{catalog.get_status_display()}"'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        catalog.status = SupplierCatalog.Status.DETECTING_TOC
        catalog.error_message = ''
        catalog.save(update_fields=['status', 'error_message'])

        try:
            toc_pages = int(request.data.get('toc_pages', 6))
            service = CatalogParserService(catalog)
            sections = service.detect_toc(toc_pages=toc_pages)

            catalog.status = SupplierCatalog.Status.TOC_READY
            catalog.save(update_fields=['status'])

            serializer = SupplierCatalogSerializer(catalog, context={'request': request})
            return Response(serializer.data)

        except Exception as e:
            catalog.status = SupplierCatalog.Status.ERROR
            catalog.error_message = str(e)
            catalog.save(update_fields=['status', 'error_message'])
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @extend_schema(summary='Обновить секции каталога', tags=['Каталоги поставщиков'])
    @action(detail=True, methods=['patch'], url_path='update-sections')
    def update_sections(self, request, pk=None):
        """Ручное редактирование секций (оглавления) каталога."""
        catalog = self.get_object()
        sections = request.data.get('sections', [])

        if not isinstance(sections, list):
            return Response(
                {'error': 'sections должен быть массивом'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        catalog.sections = sections
        catalog.total_sections = len(sections)
        catalog.save(update_fields=['sections', 'total_sections'])

        serializer = SupplierCatalogSerializer(catalog, context={'request': request})
        return Response(serializer.data)

    @extend_schema(summary='Запустить парсинг каталога', tags=['Каталоги поставщиков'])
    @action(detail=True, methods=['post'])
    def parse(self, request, pk=None):
        """Запускает асинхронный парсинг каталога через Celery."""
        from .tasks import parse_supplier_catalog_task

        catalog = self.get_object()

        if catalog.status in (
            SupplierCatalog.Status.PARSING,
            SupplierCatalog.Status.DETECTING_TOC,
            SupplierCatalog.Status.IMPORTING,
        ):
            return Response(
                {'error': f'Каталог уже в процессе: "{catalog.get_status_display()}"'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        detect_toc = not catalog.sections
        task = parse_supplier_catalog_task.delay(catalog.id, detect_toc=detect_toc)

        catalog.task_id = task.id
        catalog.save(update_fields=['task_id'])

        serializer = SupplierCatalogSerializer(catalog, context={'request': request})
        return Response(serializer.data)

    @extend_schema(summary='Импортировать каталог в БД', tags=['Каталоги поставщиков'])
    @action(detail=True, methods=['post'], url_path='import-to-db')
    def import_to_db(self, request, pk=None):
        """Запускает импорт распарсенного JSON в таблицу Product."""
        from .tasks import import_catalog_to_db_task

        catalog = self.get_object()

        if not catalog.json_file:
            return Response(
                {'error': 'Каталог ещё не распарсен'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reset = request.data.get('reset', False)
        task = import_catalog_to_db_task.delay(catalog.id, reset=reset)

        catalog.task_id = task.id
        catalog.save(update_fields=['task_id'])

        serializer = SupplierCatalogSerializer(catalog, context={'request': request})
        return Response(serializer.data)

    @extend_schema(summary='Отменить задачу каталога', tags=['Каталоги поставщиков'])
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Отменяет текущую задачу (парсинг/импорт)."""
        catalog = self.get_object()

        if catalog.status not in (
            SupplierCatalog.Status.DETECTING_TOC,
            SupplierCatalog.Status.PARSING,
            SupplierCatalog.Status.IMPORTING,
        ):
            return Response(
                {'error': 'Нет активной задачи для отмены'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Ставим статус, который задача проверит перед следующим батчем
        prev_status = catalog.status
        if catalog.sections:
            catalog.status = SupplierCatalog.Status.TOC_READY
        else:
            catalog.status = SupplierCatalog.Status.UPLOADED
        catalog.save(update_fields=['status'])

        # Отменяем задачу Celery
        if catalog.task_id:
            from celery.result import AsyncResult
            AsyncResult(catalog.task_id).revoke(terminate=False)

        serializer = SupplierCatalogSerializer(catalog, context={'request': request})
        return Response(serializer.data)
