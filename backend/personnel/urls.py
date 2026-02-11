from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EmployeeViewSet, OrgChartView, PositionRecordViewSet, SalaryHistoryViewSet

router = DefaultRouter()
router.register(r'personnel/employees', EmployeeViewSet, basename='employee')
router.register(r'personnel/org-chart', OrgChartView, basename='org-chart')
router.register(r'personnel/position-records', PositionRecordViewSet, basename='position-record')
router.register(r'personnel/salary-history', SalaryHistoryViewSet, basename='salary-history')

urlpatterns = [
    path('', include(router.urls)),
]
