from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProjectViewSet, ProjectNoteViewSet,
    EstimateViewSet, EstimateSectionViewSet,
    EstimateSubsectionViewSet, EstimateCharacteristicViewSet,
    MountingEstimateViewSet
)

router = DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')
router.register(r'project-notes', ProjectNoteViewSet, basename='project-note')
router.register(r'estimates', EstimateViewSet, basename='estimate')
router.register(r'estimate-sections', EstimateSectionViewSet, basename='estimate-section')
router.register(r'estimate-subsections', EstimateSubsectionViewSet, basename='estimate-subsection')
router.register(r'estimate-characteristics', EstimateCharacteristicViewSet, basename='estimate-characteristic')
router.register(r'mounting-estimates', MountingEstimateViewSet, basename='mounting-estimate')

urlpatterns = [
    path('', include(router.urls)),
]
