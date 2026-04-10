import logging

from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    AvitoConfig,
    AvitoListing,
    AvitoPublishedListing,
    AvitoSearchKeyword,
    Campaign,
    CampaignRecipient,
    ContactHistory,
    ExecutorProfile,
    MarketingSyncLog,
    UnisenderConfig,
)
from .serializers import (
    AvitoConfigSerializer,
    AvitoListingCreateSerializer,
    AvitoListingDetailSerializer,
    AvitoListingListSerializer,
    AvitoPublishedListingSerializer,
    AvitoSearchKeywordSerializer,
    CampaignCreateSerializer,
    CampaignDetailSerializer,
    CampaignListSerializer,
    CampaignRecipientSerializer,
    ContactHistoryCreateSerializer,
    ContactHistorySerializer,
    ExecutorProfileCreateSerializer,
    ExecutorProfileDetailSerializer,
    ExecutorProfileListSerializer,
    ExecutorProfileUpdateSerializer,
    MarketingSyncLogSerializer,
    UnisenderConfigSerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# ExecutorProfile
# ---------------------------------------------------------------------------

class ExecutorProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ExecutorProfile.objects.select_related('counterparty').annotate(
            contact_history_count=Count('contact_history'),
        )

        # Фильтры
        city = self.request.query_params.get('city')
        if city:
            qs = qs.filter(city__icontains=city)

        specializations = self.request.query_params.getlist('specializations')
        if specializations:
            qs = qs.filter(specializations__overlap=specializations)

        is_potential = self.request.query_params.get('is_potential')
        if is_potential is not None:
            qs = qs.filter(is_potential=is_potential.lower() == 'true')

        is_available = self.request.query_params.get('is_available')
        if is_available is not None:
            qs = qs.filter(is_available=is_available.lower() == 'true')

        source = self.request.query_params.get('source')
        if source:
            qs = qs.filter(source=source)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                models_Q_or(
                    counterparty__name__icontains=search,
                    counterparty__short_name__icontains=search,
                    phone__icontains=search,
                    email__icontains=search,
                    city__icontains=search,
                )
            )

        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return ExecutorProfileListSerializer
        if self.action == 'create':
            return ExecutorProfileCreateSerializer
        if self.action in ('update', 'partial_update'):
            return ExecutorProfileUpdateSerializer
        return ExecutorProfileDetailSerializer

    @action(detail=True, methods=['get'], url_path='contact-history')
    def contact_history(self, request, pk=None):
        profile = self.get_object()
        contacts = ContactHistory.objects.filter(
            executor_profile=profile,
        ).select_related('created_by')
        serializer = ContactHistorySerializer(contacts, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='add-contact')
    def add_contact(self, request, pk=None):
        profile = self.get_object()
        serializer = ContactHistoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(executor_profile=profile, created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


def models_Q_or(**kwargs):
    """Построить Q-объект с OR для нескольких условий."""
    from django.db.models import Q

    q = Q()
    for key, value in kwargs.items():
        q |= Q(**{key: value})
    return q


# ---------------------------------------------------------------------------
# AvitoConfig (singleton)
# ---------------------------------------------------------------------------

class AvitoConfigView(generics.RetrieveUpdateAPIView):
    serializer_class = AvitoConfigSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return AvitoConfig.get()


# ---------------------------------------------------------------------------
# AvitoSearchKeyword
# ---------------------------------------------------------------------------

class AvitoSearchKeywordViewSet(viewsets.ModelViewSet):
    queryset = AvitoSearchKeyword.objects.all()
    serializer_class = AvitoSearchKeywordSerializer
    permission_classes = [IsAuthenticated]


# ---------------------------------------------------------------------------
# AvitoListing (входящие объявления)
# ---------------------------------------------------------------------------

class AvitoListingViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = AvitoListing.objects.select_related('keyword', 'executor_profile__counterparty')

        s = self.request.query_params.get('status')
        if s:
            qs = qs.filter(status=s)

        keyword_id = self.request.query_params.get('keyword')
        if keyword_id:
            qs = qs.filter(keyword_id=keyword_id)

        city = self.request.query_params.get('city')
        if city:
            qs = qs.filter(city__icontains=city)

        return qs

    def get_serializer_class(self):
        if self.action == 'create':
            return AvitoListingCreateSerializer
        if self.action == 'retrieve':
            return AvitoListingDetailSerializer
        return AvitoListingListSerializer

    @action(detail=True, methods=['patch'], url_path='update-status')
    def update_status(self, request, pk=None):
        listing = self.get_object()
        new_status = request.data.get('status')
        if new_status not in dict(AvitoListing.Status.choices):
            return Response(
                {'error': f'Недопустимый статус: {new_status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        listing.status = new_status
        listing.save(update_fields=['status', 'updated_at'])
        return Response(AvitoListingListSerializer(listing).data)

    @action(detail=True, methods=['post'], url_path='convert')
    def convert_to_executor(self, request, pk=None):
        listing = self.get_object()
        from marketing.services.executor_service import ExecutorService

        profile = ExecutorService().convert_listing_to_executor(listing.pk)
        return Response(
            ExecutorProfileDetailSerializer(profile).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# AvitoPublishedListing
# ---------------------------------------------------------------------------

class AvitoPublishedListingViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = AvitoPublishedListingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return AvitoPublishedListing.objects.select_related(
            'mounting_proposal', 'mounting_proposal__object',
        )

    @action(detail=True, methods=['post'], url_path='refresh-stats')
    def refresh_stats(self, request, pk=None):
        published = self.get_object()
        # Stub — в Фазе 3 будет реальный вызов Avito API
        published.last_stats_sync = timezone.now()
        published.save(update_fields=['last_stats_sync', 'updated_at'])
        return Response(AvitoPublishedListingSerializer(published).data)


# ---------------------------------------------------------------------------
# Campaign
# ---------------------------------------------------------------------------

class CampaignViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Campaign.objects.all()

    def get_serializer_class(self):
        if self.action == 'list':
            return CampaignListSerializer
        if self.action in ('create',):
            return CampaignCreateSerializer
        return CampaignDetailSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        campaign = self.get_object()
        if campaign.status not in (Campaign.Status.DRAFT, Campaign.Status.SCHEDULED):
            return Response(
                {'error': f'Нельзя отправить рассылку в статусе «{campaign.get_status_display()}»'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from marketing.tasks import execute_campaign_task

        execute_campaign_task.delay(campaign.pk)
        campaign.status = Campaign.Status.SENDING
        campaign.save(update_fields=['status', 'updated_at'])
        return Response({'status': 'sending', 'campaign_id': campaign.pk})

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        campaign = self.get_object()
        from marketing.services.campaign_service import CampaignService

        result = CampaignService().preview_campaign(campaign.pk)
        return Response(result)

    @action(detail=True, methods=['get'])
    def recipients(self, request, pk=None):
        campaign = self.get_object()
        recipients_qs = CampaignRecipient.objects.filter(
            campaign=campaign,
        ).select_related('executor_profile__counterparty')
        serializer = CampaignRecipientSerializer(recipients_qs, many=True)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# UnisenderConfig (singleton)
# ---------------------------------------------------------------------------

class UnisenderConfigView(generics.RetrieveUpdateAPIView):
    serializer_class = UnisenderConfigSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return UnisenderConfig.get()


# ---------------------------------------------------------------------------
# MarketingSyncLog
# ---------------------------------------------------------------------------

class MarketingSyncLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = MarketingSyncLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = MarketingSyncLog.objects.all()
        sync_type = self.request.query_params.get('sync_type')
        if sync_type:
            qs = qs.filter(sync_type=sync_type)
        s = self.request.query_params.get('status')
        if s:
            qs = qs.filter(status=s)
        return qs


# ---------------------------------------------------------------------------
# Standalone views
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def trigger_avito_scan(request):
    """Запустить ручное сканирование Avito (заглушка до Фазы 3)."""
    return Response({'status': 'stub', 'message': 'Ручное сканирование будет реализовано в Фазе 3'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def publish_mp_to_avito(request, mp_id):
    """Опубликовать МП на Avito вручную."""
    from marketing.tasks import publish_mp_to_avito as publish_task

    dry_run = request.data.get('dry_run', False)
    if dry_run:
        from marketing.services.avito_publisher import AvitoPublisherService
        result = AvitoPublisherService().publish_mounting_proposal(mp_id, dry_run=True)
        return Response(result)

    publish_task.delay(mp_id)
    return Response({'status': 'queued', 'mp_id': mp_id})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def marketing_dashboard(request):
    """Сводная статистика модуля маркетинга."""
    executor_stats = ExecutorProfile.objects.aggregate(
        total=Count('id'),
        potential=Count('id', filter=models_Q_or(is_potential=True)),
        available=Count('id', filter=models_Q_or(is_available=True)),
    )
    avito_stats = {
        'published_active': AvitoPublishedListing.objects.filter(status='published').count(),
        'total_views': AvitoPublishedListing.objects.aggregate(s=Sum('views_count'))['s'] or 0,
        'total_contacts': AvitoPublishedListing.objects.aggregate(s=Sum('contacts_count'))['s'] or 0,
        'incoming_new': AvitoListing.objects.filter(status='new').count(),
    }
    campaign_stats = {
        'total': Campaign.objects.count(),
        'sent_this_month': Campaign.objects.filter(
            status='completed',
            sent_at__month=timezone.now().month,
            sent_at__year=timezone.now().year,
        ).count(),
        'total_recipients_sent': CampaignRecipient.objects.filter(status='sent').count(),
    }
    recent = ContactHistory.objects.select_related(
        'executor_profile__counterparty', 'created_by',
    )[:10]

    return Response({
        'executors': executor_stats,
        'avito': avito_stats,
        'campaigns': campaign_stats,
        'recent_contacts': ContactHistorySerializer(recent, many=True).data,
    })
