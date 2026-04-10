"""
Публичное API v1 — портал расчёта смет.

Анонимные endpoints: OTP, estimate-requests (по access_token).
Cabinet endpoints: CRUD сметы (по ExternalUser session_token).
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views
from .views_cabinet import (
    PublicEstimateViewSet,
    PublicEstimateSectionViewSet,
    PublicEstimateItemViewSet,
    PublicWorkMatchingViewSet,
    PublicExportViewSet,
)

app_name = 'api_public'

# Cabinet router (authenticated by ExternalUserTokenAuth)
cabinet_router = DefaultRouter()
cabinet_router.register(r'estimates', PublicEstimateViewSet, basename='public-estimate')
cabinet_router.register(r'estimate-sections', PublicEstimateSectionViewSet, basename='public-section')
cabinet_router.register(r'estimate-items', PublicEstimateItemViewSet, basename='public-item')
cabinet_router.register(r'work-matching', PublicWorkMatchingViewSet, basename='public-matching')
cabinet_router.register(r'export', PublicExportViewSet, basename='public-export')

urlpatterns = [
    # OTP-верификация email
    path('verify-email/', views.verify_email_send, name='verify-email-send'),
    path('verify-email/confirm/', views.verify_email_confirm, name='verify-email-confirm'),

    # Регистрация/логин внешних пользователей
    path('register/', views.external_user_register, name='external-register'),
    path('login/', views.external_user_login, name='external-login'),
    path('me/', views.external_user_me, name='external-me'),

    # Запросы смет
    path('estimate-requests/', views.create_estimate_request, name='create-estimate-request'),
    path(
        'estimate-requests/<str:access_token>/',
        views.estimate_request_detail,
        name='estimate-request-detail',
    ),
    path(
        'estimate-requests/<str:access_token>/status/',
        views.estimate_request_status,
        name='estimate-request-status',
    ),
    path(
        'estimate-requests/<str:access_token>/download/',
        views.estimate_request_download,
        name='estimate-request-download',
    ),
    path(
        'estimate-requests/<str:access_token>/callback/',
        views.estimate_request_callback,
        name='estimate-request-callback',
    ),

    # Work Matching
    path(
        'estimate-requests/<str:access_token>/match-works/',
        views.public_start_work_matching,
        name='public-start-work-matching',
    ),
    path(
        'estimate-requests/<str:access_token>/match-progress/<str:session_id>/',
        views.public_work_matching_progress,
        name='public-work-matching-progress',
    ),
    path(
        'estimate-requests/<str:access_token>/apply-works/',
        views.public_apply_work_matching,
        name='public-apply-work-matching',
    ),

    # Cabinet API (authenticated by ExternalUserTokenAuth)
    path('cabinet/', include(cabinet_router.urls)),
]
