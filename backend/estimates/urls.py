from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProjectViewSet, ProjectNoteViewSet,
    ProjectFileTypeViewSet, ProjectFileViewSet,
    EstimateViewSet, EstimateSectionViewSet,
    EstimateSubsectionViewSet, EstimateCharacteristicViewSet,
    EstimateItemViewSet,
    MountingEstimateViewSet, ColumnConfigTemplateViewSet,
    EstimateMarkupDefaultsViewSet,
)

router = DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')
router.register(r'project-notes', ProjectNoteViewSet, basename='project-note')
router.register(r'project-file-types', ProjectFileTypeViewSet, basename='project-file-type')
router.register(r'project-files', ProjectFileViewSet, basename='project-file')
router.register(r'estimates', EstimateViewSet, basename='estimate')
router.register(r'estimate-sections', EstimateSectionViewSet, basename='estimate-section')
router.register(r'estimate-subsections', EstimateSubsectionViewSet, basename='estimate-subsection')
router.register(r'estimate-characteristics', EstimateCharacteristicViewSet, basename='estimate-characteristic')
router.register(r'estimate-items', EstimateItemViewSet, basename='estimate-item')
router.register(r'mounting-estimates', MountingEstimateViewSet, basename='mounting-estimate')
router.register(r'column-config-templates', ColumnConfigTemplateViewSet, basename='column-config-template')
router.register(r'estimate-markup-defaults', EstimateMarkupDefaultsViewSet, basename='estimate-markup-defaults')

urlpatterns = [
    path('', include(router.urls)),
]
