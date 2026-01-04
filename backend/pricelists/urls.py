from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    WorkerGradeViewSet, WorkSectionViewSet, WorkerGradeSkillsViewSet,
    WorkItemViewSet, PriceListViewSet, PriceListItemViewSet,
    PriceListAgreementViewSet
)

router = DefaultRouter()
router.register(r'worker-grades', WorkerGradeViewSet, basename='worker-grade')
router.register(r'work-sections', WorkSectionViewSet, basename='work-section')
router.register(r'worker-grade-skills', WorkerGradeSkillsViewSet, basename='worker-grade-skills')
router.register(r'work-items', WorkItemViewSet, basename='work-item')
router.register(r'price-lists', PriceListViewSet, basename='price-list')
router.register(r'price-list-items', PriceListItemViewSet, basename='price-list-item')
router.register(r'price-list-agreements', PriceListAgreementViewSet, basename='price-list-agreement')

urlpatterns = [
    path('', include(router.urls)),
]
