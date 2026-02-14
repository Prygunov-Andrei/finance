import logging

from django.conf import settings
from django.db.models import Count
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from supply.models import BitrixIntegration, SupplyRequest
from supply.serializers import (
    BitrixIntegrationSerializer,
    BitrixIntegrationListSerializer,
    SupplyRequestSerializer,
    SupplyRequestDetailSerializer,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Bitrix24 Webhook — принимает события из Битрикс24
# =============================================================================

class BitrixWebhookView(APIView):
    """
    POST /api/v1/supply/webhook/bitrix/

    Принимает outgoing webhook от Битрикс24 (onCrmDealUpdate).
    Верифицирует application_token, ставит задачу в Celery.
    Отвечает 200 OK немедленно.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        if not getattr(settings, 'BITRIX_WEBHOOK_ENABLED', True):
            # Cutover: не импортируем новые кейсы из Bitrix, но отвечаем 200,
            # чтобы Bitrix не делал ретраи и не копил ошибки.
            return Response({'status': 'disabled'})

        data = request.data
        app_token = data.get('auth[application_token]') or data.get('application_token', '')

        # Поддержка формата x-www-form-urlencoded от Битрикс
        if not app_token and hasattr(data, 'get'):
            # Bitrix может слать auth[application_token] как вложенный ключ
            auth = data.get('auth', {})
            if isinstance(auth, dict):
                app_token = auth.get('application_token', '')

        if not app_token:
            logger.warning('Bitrix webhook: missing application_token')
            return Response(
                {'error': 'Missing application_token'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Найти подходящую интеграцию по токену
        try:
            integration = BitrixIntegration.objects.get(
                outgoing_webhook_token=app_token,
                is_active=True,
            )
        except BitrixIntegration.DoesNotExist:
            logger.warning('Bitrix webhook: invalid token')
            return Response(
                {'error': 'Invalid token or integration not active'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Извлечь deal_id
        deal_id = None
        fields = data.get('data', {}).get('FIELDS', {})
        if isinstance(fields, dict):
            deal_id = fields.get('ID')
        if not deal_id:
            # Битрикс иногда шлёт ID напрямую
            deal_id = data.get('data[FIELDS][ID]')
        if not deal_id:
            logger.warning('Bitrix webhook: missing deal_id in payload')
            return Response(
                {'error': 'Missing deal ID'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            deal_id = int(deal_id)
        except (ValueError, TypeError):
            return Response(
                {'error': 'Invalid deal ID'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Запуск Celery-задачи
        from supply.tasks import process_bitrix_deal
        process_bitrix_deal.delay(deal_id, integration.id)

        logger.info('Bitrix webhook: queued deal_id=%s integration=%s', deal_id, integration.id)
        return Response({'status': 'ok'})


# =============================================================================
# Supply Request CRUD
# =============================================================================

class SupplyRequestViewSet(viewsets.ModelViewSet):
    """CRUD для запросов на снабжение."""
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return SupplyRequestDetailSerializer
        return SupplyRequestSerializer

    def get_queryset(self):
        return (
            SupplyRequest.objects
            .select_related('object', 'contract', 'operator', 'bitrix_integration')
            .annotate(invoices_count=Count('invoices'))
            .order_by('-created_at')
        )


# =============================================================================
# Bitrix Integration CRUD
# =============================================================================

class BitrixIntegrationViewSet(viewsets.ModelViewSet):
    """CRUD для настроек интеграции Битрикс24."""
    permission_classes = [IsAuthenticated]
    queryset = BitrixIntegration.objects.all()

    def get_serializer_class(self):
        if self.action == 'list':
            return BitrixIntegrationListSerializer
        return BitrixIntegrationSerializer
