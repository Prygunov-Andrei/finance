from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    FrontOfWorkItemViewSet,
    MountingConditionViewSet,
    TechnicalProposalViewSet,
    TKPEstimateSectionViewSet,
    TKPEstimateSubsectionViewSet,
    TKPCharacteristicViewSet,
    TKPFrontOfWorkViewSet,
    MountingProposalViewSet,
)

router = DefaultRouter()
router.register(r'front-of-work-items', FrontOfWorkItemViewSet, basename='front-of-work-item')
router.register(r'mounting-conditions', MountingConditionViewSet, basename='mounting-condition')
router.register(r'technical-proposals', TechnicalProposalViewSet, basename='technical-proposal')
router.register(r'tkp-sections', TKPEstimateSectionViewSet, basename='tkp-section')
router.register(r'tkp-subsections', TKPEstimateSubsectionViewSet, basename='tkp-subsection')
router.register(r'tkp-characteristics', TKPCharacteristicViewSet, basename='tkp-characteristic')
router.register(r'tkp-front-of-work', TKPFrontOfWorkViewSet, basename='tkp-front-of-work')
router.register(r'mounting-proposals', MountingProposalViewSet, basename='mounting-proposal')

urlpatterns = [
    path('', include(router.urls)),
]
