from django.db.models import Sum
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from catalog.models import Product
from .models import (
    SupplierIntegration,
    SupplierCategory,
    SupplierBrand,
    SupplierProduct,
    SupplierSyncLog,
    SupplierRFQ,
    SupplierRFQItem,
    SupplierRFQResponse,
    SupplierRFQResponseItem,
)
from .serializers import (
    SupplierIntegrationSerializer,
    SupplierCategorySerializer,
    SupplierBrandSerializer,
    SupplierProductListSerializer,
    SupplierProductDetailSerializer,
    SupplierProductLinkSerializer,
    SupplierSyncLogSerializer,
)
from .services.product_linker import SupplierProductLinker
from .tasks import sync_breez_catalog, sync_breez_stock


class SupplierIntegrationViewSet(viewsets.ModelViewSet):
    """CRUD + действия для подключений к поставщикам"""

    queryset = SupplierIntegration.objects.all()
    serializer_class = SupplierIntegrationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SupplierIntegration.objects.select_related('counterparty')

    @action(detail=True, methods=['post'], url_path='sync-catalog')
    def sync_catalog(self, request, pk=None):
        """Запуск полного импорта каталога (Celery task)"""
        integration = self.get_object()
        if not integration.is_active:
            return Response(
                {'detail': 'Интеграция неактивна'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        task = sync_breez_catalog.delay(integration.pk)
        return Response({
            'task_id': task.id,
            'message': 'Импорт каталога запущен',
        })

    @action(detail=True, methods=['post'], url_path='sync-stock')
    def sync_stock(self, request, pk=None):
        """Запуск синхронизации остатков/цен (Celery task)"""
        integration = self.get_object()
        if not integration.is_active:
            return Response(
                {'detail': 'Интеграция неактивна'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        task = sync_breez_stock.delay(integration.pk)
        return Response({
            'task_id': task.id,
            'message': 'Синхронизация остатков запущена',
        })

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """Статус последних синхронизаций"""
        integration = self.get_object()
        latest_catalog = SupplierSyncLog.objects.filter(
            integration=integration,
            sync_type=SupplierSyncLog.SyncType.CATALOG_FULL,
        ).first()
        latest_stock = SupplierSyncLog.objects.filter(
            integration=integration,
            sync_type=SupplierSyncLog.SyncType.STOCK_SYNC,
        ).first()
        return Response({
            'last_catalog_sync': SupplierSyncLogSerializer(latest_catalog).data if latest_catalog else None,
            'last_stock_sync': SupplierSyncLogSerializer(latest_stock).data if latest_stock else None,
            'products_count': integration.products.filter(is_active=True).count(),
            'categories_count': integration.categories.count(),
            'brands_count': integration.brands.count(),
        })


class SupplierProductViewSet(viewsets.ReadOnlyModelViewSet):
    """Товары поставщиков (только чтение + привязка)"""

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = {
        'supplier_category': ['exact'],
        'brand': ['exact'],
        'is_active': ['exact'],
        'product': ['exact', 'isnull'],
        'integration': ['exact'],
        'for_marketplace': ['exact'],
    }
    search_fields = ['title', 'nc_code', 'articul']
    ordering_fields = ['title', 'base_price', 'ric_price', 'created_at']
    ordering = ['title']

    def get_queryset(self):
        qs = SupplierProduct.objects.select_related(
            'brand', 'supplier_category', 'product', 'integration',
            'integration__counterparty',
        ).prefetch_related(
            'stocks',
        ).annotate(
            annotated_total_stock=Sum('stocks__quantity'),
        )
        # Фильтр наличия
        in_stock = self.request.query_params.get('in_stock')
        if in_stock == 'true':
            qs = qs.filter(annotated_total_stock__gt=0)
        # Фильтр привязки
        linked = self.request.query_params.get('linked')
        if linked == 'true':
            qs = qs.filter(product__isnull=False)
        elif linked == 'false':
            qs = qs.filter(product__isnull=True)
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return SupplierProductDetailSerializer
        return SupplierProductListSerializer

    @action(detail=True, methods=['post'])
    def link(self, request, pk=None):
        """Привязка товара поставщика к нашему каталогу"""
        supplier_product = self.get_object()
        serializer = SupplierProductLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product_id = serializer.validated_data['product_id']
        try:
            product = Product.objects.get(pk=product_id)
        except Product.DoesNotExist:
            return Response(
                {'detail': f'Товар #{product_id} не найден'},
                status=status.HTTP_404_NOT_FOUND,
            )

        linker = SupplierProductLinker()
        linker.link_and_enrich(supplier_product, product)

        return Response(
            SupplierProductDetailSerializer(supplier_product).data,
            status=status.HTTP_200_OK,
        )


class SupplierCategoryViewSet(viewsets.ModelViewSet):
    """Категории поставщика с маппингом на наши категории"""

    serializer_class = SupplierCategorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['integration', 'our_category']
    search_fields = ['title']
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_queryset(self):
        return SupplierCategory.objects.select_related('our_category', 'parent')


class SupplierBrandViewSet(viewsets.ReadOnlyModelViewSet):
    """Бренды поставщика"""

    serializer_class = SupplierBrandSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['integration']
    search_fields = ['title']

    def get_queryset(self):
        return SupplierBrand.objects.all()


class SupplierSyncLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Логи синхронизаций"""

    serializer_class = SupplierSyncLogSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = {
        'integration': ['exact'],
        'sync_type': ['exact'],
        'status': ['exact'],
    }

    def get_queryset(self):
        return SupplierSyncLog.objects.select_related('integration')


class SupplierRFQViewSet(viewsets.ModelViewSet):
    """CRUD для запросов поставщикам (RFQ)."""

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['estimate', 'status']
    search_fields = ['number', 'name']

    def get_queryset(self):
        return SupplierRFQ.objects.select_related(
            'estimate', 'created_by',
        ).prefetch_related(
            'counterparties', 'items', 'responses',
        ).order_by('-created_at')

    def get_serializer_class(self):
        from rest_framework import serializers

        class RFQItemSerializer(serializers.ModelSerializer):
            class Meta:
                model = SupplierRFQItem
                fields = '__all__'

        class RFQResponseItemSerializer(serializers.ModelSerializer):
            class Meta:
                model = SupplierRFQResponseItem
                fields = '__all__'

        class RFQResponseSerializer(serializers.ModelSerializer):
            items = RFQResponseItemSerializer(many=True, read_only=True)
            counterparty_name = serializers.CharField(source='counterparty.name', read_only=True)

            class Meta:
                model = SupplierRFQResponse
                fields = '__all__'

        class RFQSerializer(serializers.ModelSerializer):
            items = RFQItemSerializer(many=True, read_only=True)
            responses = RFQResponseSerializer(many=True, read_only=True)
            created_by_name = serializers.CharField(
                source='created_by.get_full_name', read_only=True,
            )

            class Meta:
                model = SupplierRFQ
                fields = '__all__'
                read_only_fields = ['number', 'created_by']

        return RFQSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='add-items')
    def add_items(self, request, pk=None):
        """Добавить позиции из сметы в запрос."""
        rfq = self.get_object()
        estimate_item_ids = request.data.get('estimate_item_ids', [])
        if not estimate_item_ids:
            return Response({'error': 'estimate_item_ids обязателен'}, status=status.HTTP_400_BAD_REQUEST)

        from estimates.models import EstimateItem
        items = EstimateItem.objects.filter(pk__in=estimate_item_ids)
        created = []
        for item in items:
            rfq_item, was_created = SupplierRFQItem.objects.get_or_create(
                rfq=rfq, estimate_item=item,
                defaults={
                    'name': item.name,
                    'model_name': item.model_name or '',
                    'unit': item.unit or 'шт',
                    'quantity': item.quantity or 1,
                    'sort_order': item.sort_order,
                },
            )
            if was_created:
                created.append(rfq_item.id)

        return Response({'added': len(created)})

    @action(detail=True, methods=['post'], url_path='send')
    def send_rfq(self, request, pk=None):
        """Отправить запрос поставщикам по email."""
        rfq = self.get_object()
        if rfq.status != SupplierRFQ.Status.DRAFT:
            return Response({'error': 'Можно отправить только черновик'}, status=status.HTTP_400_BAD_REQUEST)

        from django.core.mail import send_mail
        from django.conf import settings as django_settings

        sent_count = 0
        for cp in rfq.counterparties.all():
            if not cp.email:
                continue
            try:
                items_text = '\n'.join(
                    f'{i+1}. {item.name} ({item.model_name}) — {item.quantity} {item.unit}'
                    for i, item in enumerate(rfq.items.all())
                )
                send_mail(
                    subject=f'Запрос цен #{rfq.number} — {rfq.name}',
                    message=f'Просим предоставить коммерческое предложение:\n\n{items_text}\n\nСрок: {rfq.due_date or "по возможности"}\n\n{rfq.message}',
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[cp.email],
                    fail_silently=True,
                )
                sent_count += 1
            except Exception:
                pass

        rfq.status = SupplierRFQ.Status.SENT
        rfq.save(update_fields=['status'])
        return Response({'sent': sent_count})

    @action(detail=True, methods=['get'], url_path='compare')
    def compare(self, request, pk=None):
        """Сравнение цен от разных поставщиков."""
        rfq = self.get_object()
        rfq_items = rfq.items.all()
        responses = rfq.responses.prefetch_related('items__rfq_item', 'counterparty').all()

        comparison = []
        for rfq_item in rfq_items:
            row = {
                'rfq_item_id': rfq_item.id,
                'name': rfq_item.name,
                'quantity': str(rfq_item.quantity),
                'unit': rfq_item.unit,
                'offers': [],
            }
            for resp in responses:
                resp_item = resp.items.filter(rfq_item=rfq_item).first()
                if resp_item:
                    row['offers'].append({
                        'counterparty_id': resp.counterparty_id,
                        'counterparty_name': resp.counterparty.name,
                        'price': str(resp_item.price),
                        'available': resp_item.available,
                        'total': str(resp_item.price * rfq_item.quantity),
                    })
            comparison.append(row)

        return Response(comparison)

    @action(detail=True, methods=['post'], url_path='apply')
    def apply_prices(self, request, pk=None):
        """Применить выбранные цены к смете."""
        rfq = self.get_object()
        selections = request.data.get('selections', [])
        # selections: [{rfq_item_id: 1, response_item_id: 5}, ...]

        from estimates.models import EstimateItem
        applied = 0
        for sel in selections:
            try:
                resp_item = SupplierRFQResponseItem.objects.select_related(
                    'rfq_item__estimate_item',
                ).get(pk=sel['response_item_id'])
            except SupplierRFQResponseItem.DoesNotExist:
                continue

            est_item = resp_item.rfq_item.estimate_item
            if est_item:
                est_item.material_unit_price = resp_item.price
                est_item.save(update_fields=['material_unit_price'])
                applied += 1

        rfq.status = SupplierRFQ.Status.APPLIED
        rfq.save(update_fields=['status'])

        return Response({'applied': applied})
