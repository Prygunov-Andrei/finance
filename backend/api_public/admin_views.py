"""
Admin API для операторов ERP — управление публичными запросами смет.

Все эндпоинты требуют JWT-аутентификации сотрудника ERP.
Подключаются в urls.py под /api/v1/portal/.
"""
import logging

from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    EstimateRequest, EstimateRequestFile,
    PublicPortalConfig, PublicPricingConfig, CallbackRequest,
)
from .tasks import generate_and_deliver
from .emails import send_estimate_error, send_operator_callback

logger = logging.getLogger(__name__)


# --- Serializers ---

class AdminEstimateRequestListSerializer(serializers.ModelSerializer):
    progress_percent = serializers.IntegerField(read_only=True)
    files_count = serializers.SerializerMethodField()

    class Meta:
        model = EstimateRequest
        fields = [
            'id', 'email', 'contact_name', 'company_name', 'phone',
            'project_name', 'status', 'progress_percent',
            'total_files', 'total_spec_items',
            'matched_exact', 'matched_analog', 'unmatched',
            'llm_cost', 'created_at', 'reviewed_at', 'files_count',
        ]

    def get_files_count(self, obj):
        return obj.total_files


class AdminEstimateRequestDetailSerializer(serializers.ModelSerializer):
    progress_percent = serializers.IntegerField(read_only=True)
    files = serializers.SerializerMethodField()
    versions = serializers.SerializerMethodField()
    callbacks = serializers.SerializerMethodField()
    estimate_id = serializers.IntegerField(source='estimate.id', read_only=True, allow_null=True)
    estimate_number = serializers.CharField(source='estimate.number', read_only=True, allow_null=True)

    class Meta:
        model = EstimateRequest
        fields = [
            'id', 'email', 'contact_name', 'company_name', 'phone',
            'project_name', 'project_description',
            'access_token', 'status', 'progress_percent',
            'error_message', 'task_id',
            'total_files', 'processed_files',
            'total_spec_items', 'matched_exact', 'matched_analog', 'unmatched',
            'llm_cost', 'notification_sent', 'downloaded_at',
            'reviewed_by', 'reviewed_at', 'expires_at',
            'created_at', 'updated_at',
            'estimate_id', 'estimate_number',
            'files', 'versions', 'callbacks',
        ]

    def get_files(self, obj):
        return list(obj.files.values(
            'id', 'original_filename', 'file_type', 'file_size',
            'parse_status', 'parse_error', 'pages_total', 'pages_processed',
        ))

    def get_versions(self, obj):
        return list(obj.versions.values(
            'id', 'version_number', 'generated_by', 'changes_description', 'created_at',
        ))

    def get_callbacks(self, obj):
        return list(obj.callbacks.values(
            'id', 'phone', 'preferred_time', 'comment', 'status',
            'processed_by_id', 'processed_at', 'created_at',
        ))


class PortalConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = PublicPortalConfig
        fields = [
            'auto_approve', 'operator_emails',
            'max_pages_per_request', 'max_files_per_request',
            'link_expiry_days', 'company_phone',
        ]


class PricingConfigSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)

    class Meta:
        model = PublicPricingConfig
        fields = ['id', 'category', 'category_name', 'markup_percent', 'is_default']


class CallbackAdminSerializer(serializers.ModelSerializer):
    request_project = serializers.CharField(source='request.project_name', read_only=True)
    request_email = serializers.CharField(source='request.email', read_only=True)
    request_company = serializers.CharField(source='request.company_name', read_only=True)

    class Meta:
        model = CallbackRequest
        fields = [
            'id', 'phone', 'preferred_time', 'comment', 'status',
            'processed_by', 'processed_at', 'created_at',
            'request_id', 'request_project', 'request_email', 'request_company',
        ]


# --- Views ---

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def request_list(request):
    """GET /api/v1/portal/requests/ — список публичных запросов."""
    qs = EstimateRequest.objects.all()

    # Фильтры
    status_filter = request.query_params.get('status')
    if status_filter:
        qs = qs.filter(status=status_filter)

    search = request.query_params.get('search')
    if search:
        from django.db.models import Q
        qs = qs.filter(
            Q(email__icontains=search) |
            Q(project_name__icontains=search) |
            Q(company_name__icontains=search)
        )

    serializer = AdminEstimateRequestListSerializer(qs[:100], many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def request_detail(request, pk):
    """GET /api/v1/portal/requests/{id}/ — детали запроса."""
    try:
        req = EstimateRequest.objects.get(pk=pk)
    except EstimateRequest.DoesNotExist:
        return Response({'detail': 'Не найден.'}, status=status.HTTP_404_NOT_FOUND)

    serializer = AdminEstimateRequestDetailSerializer(req)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def request_approve(request, pk):
    """POST /api/v1/portal/requests/{id}/approve/ — подтвердить и отправить."""
    try:
        req = EstimateRequest.objects.get(pk=pk)
    except EstimateRequest.DoesNotExist:
        return Response({'detail': 'Не найден.'}, status=status.HTTP_404_NOT_FOUND)

    if req.status != EstimateRequest.Status.REVIEW:
        return Response(
            {'detail': f'Нельзя подтвердить запрос в статусе "{req.get_status_display()}".'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not req.estimate_id:
        return Response(
            {'detail': 'Нет связанной сметы.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    req.reviewed_by = request.user
    req.reviewed_at = timezone.now()
    req.save(update_fields=['reviewed_by', 'reviewed_at'])

    generate_and_deliver(req, generated_by=request.user.username)

    return Response({'detail': 'Смета подтверждена и отправлена клиенту.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def request_reject(request, pk):
    """POST /api/v1/portal/requests/{id}/reject/ — отклонить."""
    try:
        req = EstimateRequest.objects.get(pk=pk)
    except EstimateRequest.DoesNotExist:
        return Response({'detail': 'Не найден.'}, status=status.HTTP_404_NOT_FOUND)

    reason = request.data.get('reason', '')
    req.status = EstimateRequest.Status.ERROR
    req.error_message = f'Отклонено оператором: {reason}' if reason else 'Отклонено оператором.'
    req.reviewed_by = request.user
    req.reviewed_at = timezone.now()
    req.save(update_fields=['status', 'error_message', 'reviewed_by', 'reviewed_at'])

    send_estimate_error(req, req.error_message)

    return Response({'detail': 'Запрос отклонён.'})


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def portal_config(request):
    """GET/PUT /api/v1/portal/config/ — настройки портала."""
    config = PublicPortalConfig.get()

    if request.method == 'GET':
        serializer = PortalConfigSerializer(config)
        return Response(serializer.data)

    serializer = PortalConfigSerializer(config, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def pricing_config_list(request):
    """GET/POST /api/v1/portal/pricing/ — настройки наценок."""
    if request.method == 'GET':
        qs = PublicPricingConfig.objects.select_related('category').all()
        serializer = PricingConfigSerializer(qs, many=True)
        return Response(serializer.data)

    serializer = PricingConfigSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def pricing_config_detail(request, pk):
    """PUT/DELETE /api/v1/portal/pricing/{id}/ — управление наценкой."""
    try:
        config = PublicPricingConfig.objects.get(pk=pk)
    except PublicPricingConfig.DoesNotExist:
        return Response({'detail': 'Не найден.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        config.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = PricingConfigSerializer(config, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def callback_list(request):
    """GET /api/v1/portal/callbacks/ — заявки на звонок."""
    qs = CallbackRequest.objects.select_related('request').all()

    status_filter = request.query_params.get('status')
    if status_filter:
        qs = qs.filter(status=status_filter)

    serializer = CallbackAdminSerializer(qs[:100], many=True)
    return Response(serializer.data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def callback_update_status(request, pk):
    """PATCH /api/v1/portal/callbacks/{id}/ — обновить статус заявки."""
    try:
        cb = CallbackRequest.objects.get(pk=pk)
    except CallbackRequest.DoesNotExist:
        return Response({'detail': 'Не найден.'}, status=status.HTTP_404_NOT_FOUND)

    new_status = request.data.get('status')
    if new_status not in dict(CallbackRequest.Status.choices):
        return Response(
            {'detail': f'Невалидный статус. Допустимые: {list(dict(CallbackRequest.Status.choices).keys())}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    cb.status = new_status
    if new_status in ('completed', 'in_progress'):
        cb.processed_by = request.user
        cb.processed_at = timezone.now()
    cb.save()

    return Response(CallbackAdminSerializer(cb).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def portal_stats(request):
    """GET /api/v1/portal/stats/ — статистика портала."""
    from django.db.models import Count, Avg, Sum
    from datetime import timedelta

    now = timezone.now()
    last_30_days = now - timedelta(days=30)

    qs = EstimateRequest.objects.filter(created_at__gte=last_30_days)

    stats = {
        'total_requests': qs.count(),
        'by_status': dict(qs.values_list('status').annotate(count=Count('id')).values_list('status', 'count')),
        'total_llm_cost': float(qs.aggregate(total=Sum('llm_cost'))['total'] or 0),
        'downloaded_count': qs.filter(downloaded_at__isnull=False).count(),
        'callback_count': CallbackRequest.objects.filter(created_at__gte=last_30_days).count(),
    }

    return Response(stats)
