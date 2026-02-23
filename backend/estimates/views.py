from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone

from core.version_mixin import VersioningMixin
from .models import (
    Project, ProjectNote, Estimate, EstimateSection,
    EstimateSubsection, EstimateCharacteristic, EstimateItem,
    MountingEstimate
)
from .serializers import (
    ProjectSerializer, ProjectListSerializer, ProjectNoteSerializer,
    EstimateSerializer, EstimateCreateSerializer,
    EstimateSectionSerializer, EstimateSubsectionSerializer,
    EstimateCharacteristicSerializer,
    EstimateItemSerializer, EstimateItemBulkCreateSerializer,
    MountingEstimateSerializer, MountingEstimateCreateFromEstimateSerializer
)


class ProjectViewSet(VersioningMixin, viewsets.ModelViewSet):
    """ViewSet для проектов (с поддержкой версионирования через VersioningMixin)"""
    
    queryset = Project.objects.select_related(
        'object', 'primary_check_by', 'secondary_check_by', 'parent_version'
    ).prefetch_related('project_notes', 'project_notes__author')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        'object', 'stage', 'is_approved_for_production',
        'primary_check_done', 'secondary_check_done'
    ]
    search_fields = ['cipher', 'name']
    version_list_serializer_class = ProjectListSerializer
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ProjectListSerializer
        return ProjectSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        # По умолчанию показываем только актуальные версии
        if 'is_current' not in self.request.query_params:
            queryset = queryset.filter(is_current=True)
        return queryset
    
    # Методы versions() и create_version() наследуются от VersioningMixin
    
    @action(detail=True, methods=['post'], url_path='primary-check')
    def primary_check(self, request, pk=None):
        """Отметить первичную проверку"""
        project = self.get_object()
        project.primary_check_done = True
        project.primary_check_by = request.user
        project.primary_check_date = timezone.now().date()
        project.save()
        serializer = ProjectSerializer(project)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='secondary-check')
    def secondary_check(self, request, pk=None):
        """Отметить вторичную проверку"""
        project = self.get_object()
        project.secondary_check_done = True
        project.secondary_check_by = request.user
        project.secondary_check_date = timezone.now().date()
        project.save()
        serializer = ProjectSerializer(project)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='approve-production')
    def approve_production(self, request, pk=None):
        """Разрешить "В производство работ" """
        project = self.get_object()
        project.is_approved_for_production = True
        project.production_approval_date = timezone.now().date()
        if 'production_approval_file' in request.FILES:
            project.production_approval_file = request.FILES['production_approval_file']
        project.save()
        serializer = ProjectSerializer(project)
        return Response(serializer.data)


class ProjectNoteViewSet(viewsets.ModelViewSet):
    """ViewSet для замечаний к проектам"""
    
    queryset = ProjectNote.objects.select_related('project', 'author')
    serializer_class = ProjectNoteSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['project']
    
    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


class EstimateViewSet(VersioningMixin, viewsets.ModelViewSet):
    """ViewSet для смет (с поддержкой версионирования через VersioningMixin)"""
    
    queryset = Estimate.objects.select_related(
        'object', 'legal_entity', 'price_list', 'created_by', 
        'checked_by', 'approved_by', 'parent_version'
    ).prefetch_related(
        'projects',
        'sections',
        'sections__subsections',
        'characteristics'
    )
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        'object', 'legal_entity', 'status', 'approved_by_customer'
    ]
    search_fields = ['number', 'name']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return EstimateCreateSerializer
        return EstimateSerializer
    
    # Методы versions() и create_version() наследуются от VersioningMixin
    
    @action(detail=True, methods=['post'], url_path='create-mounting-estimate')
    def create_mounting_estimate(self, request, pk=None):
        """Создать монтажную смету из обычной сметы"""
        estimate = self.get_object()
        created_by = request.user
        mounting_estimate = MountingEstimate.create_from_estimate(estimate, created_by)
        serializer = MountingEstimateSerializer(mounting_estimate)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class EstimateSectionViewSet(viewsets.ModelViewSet):
    """ViewSet для разделов сметы"""
    
    queryset = EstimateSection.objects.select_related('estimate').prefetch_related('subsections')
    serializer_class = EstimateSectionSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['estimate']


class EstimateSubsectionViewSet(viewsets.ModelViewSet):
    """ViewSet для подразделов сметы"""
    
    queryset = EstimateSubsection.objects.select_related('section', 'section__estimate')
    serializer_class = EstimateSubsectionSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['section']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        # Фильтрация по смете через раздел
        estimate_id = self.request.query_params.get('estimate')
        if estimate_id:
            queryset = queryset.filter(section__estimate_id=estimate_id)
        return queryset


class EstimateCharacteristicViewSet(viewsets.ModelViewSet):
    """ViewSet для характеристик сметы"""
    
    queryset = EstimateCharacteristic.objects.select_related('estimate')
    serializer_class = EstimateCharacteristicSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['estimate']


class EstimateItemViewSet(viewsets.ModelViewSet):
    """ViewSet для строк сметы"""
    
    queryset = EstimateItem.objects.select_related(
        'estimate', 'section', 'subsection',
        'product', 'work_item', 'source_price_history',
    )
    serializer_class = EstimateItemSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'estimate', 'section', 'subsection', 'product',
        'work_item', 'is_analog',
    ]
    search_fields = ['name', 'model_name', 'original_name']
    ordering_fields = ['sort_order', 'item_number', 'name', 'material_unit_price', 'work_unit_price']
    ordering = ['sort_order', 'item_number']

    @action(detail=False, methods=['post'], url_path='bulk-create')
    def bulk_create(self, request):
        """Создать множество строк сметы за одну операцию"""
        serializer = EstimateItemBulkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        items = serializer.save()
        return Response(
            EstimateItemSerializer(items, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'], url_path='bulk-update')
    def bulk_update_items(self, request):
        """Обновить множество строк сметы за одну операцию.
        Ожидает массив объектов с обязательным полем 'id'."""
        items_data = request.data
        if not isinstance(items_data, list):
            return Response(
                {'error': 'Ожидается массив объектов'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = [item.get('id') for item in items_data if item.get('id')]
        existing = {item.id: item for item in EstimateItem.objects.filter(id__in=ids)}
        updated = []

        for item_data in items_data:
            item_id = item_data.get('id')
            if not item_id or item_id not in existing:
                continue
            obj = existing[item_id]
            for field, value in item_data.items():
                if field == 'id':
                    continue
                setattr(obj, field, value)
            updated.append(obj)

        if updated:
            update_fields = [
                k for k in items_data[0].keys() if k != 'id'
            ]
            EstimateItem.objects.bulk_update(updated, update_fields)

        return Response(
            EstimateItemSerializer(updated, many=True).data,
        )

    @action(detail=False, methods=['post'], url_path='auto-match')
    def auto_match(self, request):
        """Автоматический подбор цен и работ для строк сметы"""
        estimate_id = request.data.get('estimate_id')
        price_list_id = request.data.get('price_list_id')

        if not estimate_id:
            return Response(
                {'error': 'Не указан estimate_id'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            estimate = Estimate.objects.get(pk=estimate_id)
        except Estimate.DoesNotExist:
            return Response(
                {'error': 'Смета не найдена'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from .services.estimate_auto_matcher import EstimateAutoMatcher
        matcher = EstimateAutoMatcher()
        result = matcher.auto_fill(estimate, price_list_id=price_list_id)
        return Response(result)


class MountingEstimateViewSet(viewsets.ModelViewSet):
    """ViewSet для монтажных смет"""
    
    queryset = MountingEstimate.objects.select_related(
        'object', 'source_estimate', 'agreed_counterparty', 
        'created_by', 'parent_version'
    )
    serializer_class = MountingEstimateSerializer
    
    def perform_create(self, serializer):
        """Автоматически устанавливаем created_by из текущего пользователя"""
        serializer.save(created_by=self.request.user)
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        'object', 'source_estimate', 'status', 'agreed_counterparty'
    ]
    search_fields = ['number', 'name']
    
    @action(detail=False, methods=['post'], url_path='from-estimate')
    def from_estimate(self, request):
        """Создать монтажную смету из обычной сметы"""
        serializer = MountingEstimateCreateFromEstimateSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        mounting_estimate = serializer.save()
        return Response(
            MountingEstimateSerializer(mounting_estimate).data,
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['post'], url_path='create-version')
    def create_version(self, request, pk=None):
        """Создать новую версию монтажной сметы"""
        mounting_estimate = self.get_object()
        new_version = mounting_estimate.create_new_version()
        serializer = MountingEstimateSerializer(new_version)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def agree(self, request, pk=None):
        """Согласовать с Исполнителем"""
        mounting_estimate = self.get_object()
        counterparty_id = request.data.get('counterparty_id')
        
        if not counterparty_id:
            return Response(
                {'error': 'Не указан ID контрагента'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from accounting.models import Counterparty
        try:
            counterparty = Counterparty.objects.get(id=counterparty_id)
            if counterparty.type not in [Counterparty.Type.VENDOR, Counterparty.Type.BOTH]:
                return Response(
                    {'error': 'Контрагент должен быть типа "Исполнитель/Поставщик" или "Заказчик и Исполнитель"'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            mounting_estimate.agreed_counterparty = counterparty
            mounting_estimate.agreed_date = timezone.now().date()
            mounting_estimate.status = MountingEstimate.Status.APPROVED
            mounting_estimate.save()
            serializer = MountingEstimateSerializer(mounting_estimate)
            return Response(serializer.data)
        except Counterparty.DoesNotExist:
            return Response(
                {'error': 'Контрагент не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
