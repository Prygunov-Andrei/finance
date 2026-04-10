from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from core.version_mixin import VersioningMixin
from estimates.models import Project, ProjectNote, ProjectFileType, ProjectFile
from estimates.serializers import (
    ProjectSerializer, ProjectListSerializer, ProjectNoteSerializer,
    ProjectFileTypeSerializer, ProjectFileSerializer,
)
from estimates.services.project_service import (
    mark_primary_check,
    mark_secondary_check,
    approve_production as approve_production_svc,
)


class ProjectViewSet(VersioningMixin, viewsets.ModelViewSet):
    """ViewSet для проектов (с поддержкой версионирования через VersioningMixin)"""

    queryset = Project.objects.select_related(
        'object', 'primary_check_by', 'secondary_check_by', 'parent_version'
    ).prefetch_related(
        'project_notes', 'project_notes__author',
        'project_files', 'project_files__file_type', 'project_files__uploaded_by',
    )
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
        mark_primary_check(project, request.user)
        serializer = ProjectSerializer(project)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='secondary-check')
    def secondary_check(self, request, pk=None):
        """Отметить вторичную проверку"""
        project = self.get_object()
        mark_secondary_check(project, request.user)
        serializer = ProjectSerializer(project)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='approve-production')
    def approve_production(self, request, pk=None):
        """Разрешить "В производство работ" """
        project = self.get_object()
        approve_production_svc(
            project,
            file=request.FILES.get('production_approval_file'),
        )
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


class ProjectFileTypeViewSet(viewsets.ModelViewSet):
    """ViewSet для справочника типов файлов проекта"""

    queryset = ProjectFileType.objects.all()
    serializer_class = ProjectFileTypeSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'code']


class ProjectFileViewSet(viewsets.ModelViewSet):
    """ViewSet для файлов проекта"""

    queryset = ProjectFile.objects.select_related(
        'project', 'file_type', 'uploaded_by'
    )
    serializer_class = ProjectFileSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['project', 'file_type']

    def perform_create(self, serializer):
        file_obj = self.request.FILES.get('file')
        serializer.save(
            uploaded_by=self.request.user,
            original_filename=file_obj.name if file_obj else '',
        )
