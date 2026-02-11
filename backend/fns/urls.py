from django.urls import path
from . import views

urlpatterns = [
    path('fns/suggest/', views.FNSSuggestView.as_view(), name='fns-suggest'),
    path('fns/reports/', views.FNSReportCreateView.as_view(), name='fns-report-create'),
    path('fns/reports/list/', views.FNSReportListView.as_view(), name='fns-report-list'),
    path('fns/reports/<int:pk>/', views.FNSReportDetailView.as_view(), name='fns-report-detail'),
    path('fns/stats/', views.FNSStatsView.as_view(), name='fns-stats'),
    path('fns/quick-check/', views.FNSQuickCheckView.as_view(), name='fns-quick-check'),
]
