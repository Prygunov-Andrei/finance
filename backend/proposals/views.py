from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db.models import Count
from django.utils import timezone

from core.version_mixin import VersioningMixin
from .models import (
    FrontOfWorkItem,
    MountingCondition,
    TechnicalProposal,
    TKPEstimateSection,
    TKPEstimateSubsection,
    TKPCharacteristic,
    TKPFrontOfWork,
    MountingProposal,
)
from .serializers import (
    FrontOfWorkItemSerializer,
    MountingConditionSerializer,
    TechnicalProposalListSerializer,
    TechnicalProposalDetailSerializer,
    TKPEstimateSectionSerializer,
    TKPEstimateSubsectionSerializer,
    TKPCharacteristicSerializer,
    TKPFrontOfWorkSerializer,
    MountingProposalListSerializer,
    MountingProposalDetailSerializer,
    TechnicalProposalAddEstimatesSerializer,
    TechnicalProposalRemoveEstimatesSerializer,
)


class FrontOfWorkItemViewSet(viewsets.ModelViewSet):
    """ViewSet для справочника "Фронт работ" """
    queryset = FrontOfWorkItem.objects.all()
    serializer_class = FrontOfWorkItemSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['name']
    ordering_fields = ['sort_order', 'name']
    ordering = ['sort_order', 'name']


class MountingConditionViewSet(viewsets.ModelViewSet):
    """ViewSet для справочника "Условия для МП" """
    queryset = MountingCondition.objects.all()
    serializer_class = MountingConditionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['sort_order', 'name']
    ordering = ['sort_order', 'name']


class TechnicalProposalViewSet(VersioningMixin, viewsets.ModelViewSet):
    """ViewSet для ТКП (с поддержкой версионирования через VersioningMixin)"""
    queryset = TechnicalProposal.objects.select_related(
        'object', 'legal_entity', 'created_by', 'checked_by', 
        'approved_by', 'parent_version'
    ).prefetch_related(
        'estimates',
        'estimates__projects',
        'estimate_sections',
        'estimate_sections__subsections',
        'characteristics',
        'front_of_work',
        'front_of_work__front_item'
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['object', 'legal_entity', 'status']
    search_fields = ['number', 'name']
    ordering_fields = ['date', 'created_at', 'number']
    ordering = ['-date', '-created_at']
    version_list_serializer_class = TechnicalProposalListSerializer
    
    def get_queryset(self):
        """Оптимизация: добавляем annotate для versions_count"""
        queryset = super().get_queryset()
        if self.action == 'list':
            queryset = queryset.annotate(annotated_versions_count=Count('child_versions'))
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'list':
            return TechnicalProposalListSerializer
        return TechnicalProposalDetailSerializer
    
    def perform_create(self, serializer):
        """Автоматически устанавливаем created_by из request.user"""
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'], url_path='add-estimates')
    def add_estimates(self, request, pk=None):
        """Добавить сметы к ТКП"""
        tkp = self.get_object()
        serializer = TechnicalProposalAddEstimatesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        estimate_ids = serializer.validated_data['estimate_ids']
        copy_data = serializer.validated_data.get('copy_data', True)
        
        from estimates.models import Estimate
        estimates = Estimate.objects.filter(id__in=estimate_ids)
        tkp.estimates.add(*estimates)
        
        if copy_data:
            tkp.copy_data_from_estimates()
        
        return Response({
            'message': f'Добавлено смет: {len(estimates)}',
            'estimates_count': tkp.estimates.count()
        })
    
    @action(detail=True, methods=['post'], url_path='remove-estimates')
    def remove_estimates(self, request, pk=None):
        """Удалить сметы из ТКП"""
        tkp = self.get_object()
        serializer = TechnicalProposalRemoveEstimatesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        estimate_ids = serializer.validated_data['estimate_ids']
        tkp.estimates.remove(*estimate_ids)
        
        # Очистить данные, связанные с удаленными сметами
        tkp.copy_data_from_estimates()
        
        return Response({
            'message': f'Удалено смет: {len(estimate_ids)}',
            'estimates_count': tkp.estimates.count()
        })
    
    @action(detail=True, methods=['post'], url_path='copy-from-estimates')
    def copy_from_estimates(self, request, pk=None):
        """Скопировать данные из привязанных смет"""
        tkp = self.get_object()
        tkp.copy_data_from_estimates()
        return Response({'message': 'Данные скопированы из смет'})
    
    # Метод create_version() наследуется от VersioningMixin
    
    @action(detail=True, methods=['post'], url_path='create-mp')
    def create_mp(self, request, pk=None):
        """Создать МП на основе ТКП"""
        tkp = self.get_object()
        created_by = request.user
        mp = MountingProposal.create_from_tkp(tkp, created_by)
        serializer = MountingProposalDetailSerializer(mp, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    # Метод versions() наследуется от VersioningMixin


class TKPEstimateSectionViewSet(viewsets.ModelViewSet):
    """ViewSet для разделов смет в ТКП"""
    queryset = TKPEstimateSection.objects.select_related(
        'tkp', 'source_estimate', 'source_section'
    ).prefetch_related('subsections')
    serializer_class = TKPEstimateSectionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['tkp']
    ordering_fields = ['sort_order']
    ordering = ['sort_order', 'id']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        tkp_id = self.request.query_params.get('tkp')
        if tkp_id:
            queryset = queryset.filter(tkp_id=tkp_id)
        return queryset


class TKPEstimateSubsectionViewSet(viewsets.ModelViewSet):
    """ViewSet для подразделов смет в ТКП"""
    queryset = TKPEstimateSubsection.objects.select_related(
        'section', 'section__tkp', 'source_subsection'
    )
    serializer_class = TKPEstimateSubsectionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['section']
    ordering_fields = ['sort_order']
    ordering = ['sort_order', 'id']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        section_id = self.request.query_params.get('section')
        if section_id:
            queryset = queryset.filter(section_id=section_id)
        return queryset


class TKPCharacteristicViewSet(viewsets.ModelViewSet):
    """ViewSet для характеристик ТКП"""
    queryset = TKPCharacteristic.objects.select_related(
        'tkp', 'source_estimate', 'source_characteristic'
    )
    serializer_class = TKPCharacteristicSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['tkp']
    ordering_fields = ['sort_order']
    ordering = ['sort_order', 'id']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        tkp_id = self.request.query_params.get('tkp')
        if tkp_id:
            queryset = queryset.filter(tkp_id=tkp_id)
        return queryset


class TKPFrontOfWorkViewSet(viewsets.ModelViewSet):
    """ViewSet для фронта работ в ТКП"""
    queryset = TKPFrontOfWork.objects.select_related('tkp', 'front_item')
    serializer_class = TKPFrontOfWorkSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['tkp', 'front_item']
    ordering_fields = ['sort_order']
    ordering = ['sort_order', 'id']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        tkp_id = self.request.query_params.get('tkp')
        if tkp_id:
            queryset = queryset.filter(tkp_id=tkp_id)
        return queryset


class MountingProposalViewSet(VersioningMixin, viewsets.ModelViewSet):
    """ViewSet для МП (с поддержкой версионирования через VersioningMixin)"""
    queryset = MountingProposal.objects.select_related(
        'object', 'counterparty', 'parent_tkp', 'mounting_estimate',
        'created_by', 'parent_version'
    ).prefetch_related('conditions')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['object', 'counterparty', 'parent_tkp', 'status', 'telegram_published']
    search_fields = ['number', 'name']
    ordering_fields = ['date', 'created_at', 'number']
    ordering = ['-date', '-created_at']
    version_list_serializer_class = MountingProposalListSerializer
    
    def get_queryset(self):
        """Оптимизация: добавляем annotate для versions_count"""
        queryset = super().get_queryset()
        if self.action == 'list':
            queryset = queryset.annotate(annotated_versions_count=Count('child_versions'))
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'list':
            return MountingProposalListSerializer
        return MountingProposalDetailSerializer
    
    def perform_create(self, serializer):
        """Автоматически устанавливаем created_by из request.user"""
        serializer.save(created_by=self.request.user)
    
    # Метод create_version() наследуется от VersioningMixin
    
    @action(detail=True, methods=['post'], url_path='mark-telegram-published')
    def mark_telegram_published(self, request, pk=None):
        """Отметить МП как опубликованное в Telegram"""
        mp = self.get_object()
        mp.telegram_published = True
        mp.telegram_published_at = timezone.now()
        mp.save()
        serializer = self.get_serializer(mp)
        return Response(serializer.data)
    
    # Метод versions() наследуется от VersioningMixin
