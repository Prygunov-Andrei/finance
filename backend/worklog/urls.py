from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'workers', views.WorkerViewSet, basename='worklog-worker')
router.register(r'supergroups', views.SupergroupViewSet, basename='worklog-supergroup')
router.register(r'shifts', views.ShiftViewSet, basename='worklog-shift')
router.register(r'teams', views.TeamViewSet, basename='worklog-team')
router.register(r'media', views.MediaViewSet, basename='worklog-media')
router.register(r'reports', views.ReportViewSet, basename='worklog-report')
router.register(r'questions', views.QuestionViewSet, basename='worklog-question')

urlpatterns = [
    path('worklog/', include(router.urls)),
    path('worklog/auth/telegram/', views.telegram_auth, name='worklog-telegram-auth'),
    path('objects/<int:object_id>/work-journal/', views.work_journal_summary, name='work-journal-summary'),
]
