"""
Public Cabinet API — CRUD сметы для внешних пользователей.

Авторизация: ExternalUserTokenAuth (Authorization: Token <session_token>)
Все endpoints скоупированы на external_user — пользователь видит только свою смету.
"""
from decimal import Decimal

from django.db.models import F, ExpressionWrapper, DecimalField
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from estimates.models import Estimate, EstimateSection, EstimateItem, suppress_item_signals
from estimates.serializers import (
    EstimateSerializer, EstimateItemSerializer, EstimateSectionSerializer,
    EstimateItemBulkCreateSerializer,
)
from estimates.views.mixins import EstimateItemLearningMixin, EstimateItemBulkMixin
from .authentication import ExternalUserTokenAuth


class PublicEstimateThrottle(UserRateThrottle):
    rate = '100/hour'


class PublicEstimateViewSet(viewsets.ModelViewSet):
    """CRUD сметы для внешнего пользователя. Max 1 активная смета."""

    authentication_classes = [ExternalUserTokenAuth]
    throttle_classes = [PublicEstimateThrottle]
    serializer_class = EstimateSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head']

    def get_queryset(self):
        return Estimate.objects.filter(
            external_user=self.request.user,
            public_source=True,
        )

    def perform_create(self, serializer):
        # Max 1 active estimate per user
        existing = Estimate.objects.filter(
            external_user=self.request.user, public_source=True,
        ).count()
        if existing >= 1:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('У вас уже есть активная смета. Удалите или используйте существующую.')

        serializer.save(
            external_user=self.request.user,
            public_source=True,
        )

    @action(detail=False, methods=['get'], url_path='active')
    def active_estimate(self, request):
        """Получить активную смету пользователя."""
        estimate = self.get_queryset().first()
        if not estimate:
            return Response({'detail': 'Нет активной сметы'}, status=status.HTTP_404_NOT_FOUND)
        return Response(EstimateSerializer(estimate).data)


class PublicEstimateSectionViewSet(viewsets.ModelViewSet):
    """CRUD секций для публичной сметы."""

    authentication_classes = [ExternalUserTokenAuth]
    throttle_classes = [PublicEstimateThrottle]
    serializer_class = EstimateSectionSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head']

    def get_queryset(self):
        return EstimateSection.objects.filter(
            estimate__external_user=self.request.user,
            estimate__public_source=True,
        )


class PublicEstimateItemViewSet(EstimateItemLearningMixin, EstimateItemBulkMixin, viewsets.ModelViewSet):
    """CRUD строк сметы для публичного портала.

    Наследует learning loop и bulk операции от shared mixins.
    """

    authentication_classes = [ExternalUserTokenAuth]
    throttle_classes = [PublicEstimateThrottle]
    serializer_class = EstimateItemSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head']

    MAX_ITEMS = 500  # Лимит позиций для публичного портала

    def get_queryset(self):
        return EstimateItem.objects.filter(
            estimate__external_user=self.request.user,
            estimate__public_source=True,
        ).select_related('estimate', 'section', 'product', 'work_item').annotate(
            _material_total=ExpressionWrapper(
                F('quantity') * F('material_unit_price'),
                output_field=DecimalField(max_digits=15, decimal_places=2),
            ),
            _work_total=ExpressionWrapper(
                F('quantity') * F('work_unit_price'),
                output_field=DecimalField(max_digits=15, decimal_places=2),
            ),
            _line_total=ExpressionWrapper(
                F('quantity') * F('material_unit_price') + F('quantity') * F('work_unit_price'),
                output_field=DecimalField(max_digits=15, decimal_places=2),
            ),
        )

    def perform_create(self, serializer):
        # Проверка лимита
        estimate = serializer.validated_data.get('estimate')
        if estimate and EstimateItem.objects.filter(estimate=estimate).count() >= self.MAX_ITEMS:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(f'Максимум {self.MAX_ITEMS} позиций в смете.')
        serializer.save()

    @action(detail=False, methods=['post'], url_path='bulk-create')
    def bulk_create(self, request):
        """Массовое создание строк с лимитом."""
        estimate_id = request.data.get('estimate_id')
        items_data = request.data.get('items', [])

        if not estimate_id or not items_data:
            return Response({'error': 'estimate_id и items обязательны'}, status=status.HTTP_400_BAD_REQUEST)

        # Проверка доступа
        estimate = Estimate.objects.filter(
            pk=estimate_id, external_user=self.request.user, public_source=True,
        ).first()
        if not estimate:
            return Response({'error': 'Смета не найдена'}, status=status.HTTP_404_NOT_FOUND)

        current_count = EstimateItem.objects.filter(estimate=estimate).count()
        if current_count + len(items_data) > self.MAX_ITEMS:
            return Response(
                {'error': f'Превышен лимит: {current_count} + {len(items_data)} > {self.MAX_ITEMS}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with suppress_item_signals():
            created_items = EstimateItem.objects.bulk_create([
                EstimateItem(estimate=estimate, **item) for item in items_data
            ])

        return Response({'created': len(created_items)}, status=status.HTTP_201_CREATED)


class PublicWorkMatchingViewSet(viewsets.ViewSet):
    """Подбор работ для публичного портала."""

    authentication_classes = [ExternalUserTokenAuth]

    @action(detail=False, methods=['post'], url_path='start')
    def start(self, request):
        estimate_id = request.data.get('estimate_id')
        estimate = Estimate.objects.filter(
            pk=estimate_id, external_user=request.user, public_source=True,
        ).first()
        if not estimate:
            return Response({'error': 'Смета не найдена'}, status=status.HTTP_404_NOT_FOUND)

        from estimates.services.work_matching import WorkMatchingService
        svc = WorkMatchingService()
        try:
            result = svc.start_matching(estimate_id, user_id=0)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_409_CONFLICT)
        return Response(result, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=['get'], url_path='progress/(?P<session_id>[a-f0-9]+)')
    def progress(self, request, session_id=None):
        include_results = request.query_params.get('include_results', '').lower() == 'true'
        from estimates.services.work_matching import WorkMatchingService
        svc = WorkMatchingService()
        data = svc.get_progress(session_id, include_results=include_results)
        if not data:
            return Response({'error': 'Сессия не найдена'}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)

    @action(detail=False, methods=['post'], url_path='apply')
    def apply(self, request):
        session_id = request.data.get('session_id')
        items = request.data.get('items', [])
        if not session_id or not items:
            return Response({'error': 'session_id и items обязательны'}, status=status.HTTP_400_BAD_REQUEST)

        from estimates.services.work_matching import WorkMatchingService
        svc = WorkMatchingService()
        result = svc.apply_results(session_id=session_id, items=items)
        return Response(result)


class PublicExportViewSet(viewsets.ViewSet):
    """Экспорт сметы для публичного портала."""

    authentication_classes = [ExternalUserTokenAuth]

    @action(detail=False, methods=['get'], url_path='excel/(?P<estimate_id>[0-9]+)')
    def export_excel(self, request, estimate_id=None):
        estimate = Estimate.objects.filter(
            pk=estimate_id, external_user=request.user, public_source=True,
        ).first()
        if not estimate:
            return Response({'error': 'Смета не найдена'}, status=status.HTTP_404_NOT_FOUND)

        from django.http import HttpResponse
        from estimates.services.estimate_excel_exporter import EstimateExcelExporter

        exporter = EstimateExcelExporter(estimate)
        buffer = exporter.export_with_column_config(mode='external')

        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="estimate_{estimate.number}.xlsx"'
        return response
